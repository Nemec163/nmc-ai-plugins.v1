import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";

const execFileAsync = promisify(execFile);

type Cfg = {
  host: string;
  port: number;
  apiTokenEnv: string;
  mutationTokenEnv: string;
  allowMutations: boolean;
  corsOrigins: string[];
  adminPrincipal: string;
  adminActorLevel: string;
};

type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  required?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
};

type PluginDescriptor = {
  id: string;
  name?: string;
  kind?: string;
  version?: string;
  skills?: string[];
  configSchema?: JsonSchema;
  uiHints?: Record<string, unknown>;
  admin?: Record<string, unknown>;
};

function parseCfg(raw: unknown): Cfg {
  const cfg = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const corsOrigins = Array.isArray(cfg.corsOrigins)
    ? cfg.corsOrigins
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  return {
    host: typeof cfg.host === "string" ? cfg.host : "127.0.0.1",
    port: typeof cfg.port === "number" ? Math.trunc(cfg.port) : 4466,
    apiTokenEnv:
      typeof cfg.apiTokenEnv === "string" ? cfg.apiTokenEnv : "NMC_AI_PLUGINS_API_TOKEN",
    mutationTokenEnv:
      typeof cfg.mutationTokenEnv === "string"
        ? cfg.mutationTokenEnv
        : "NMC_AI_PLUGINS_MUTATION_TOKEN",
    allowMutations: cfg.allowMutations === true,
    corsOrigins,
    adminPrincipal:
      typeof cfg.adminPrincipal === "string" && cfg.adminPrincipal.trim()
        ? cfg.adminPrincipal.trim()
        : "orchestrator",
    adminActorLevel:
      typeof cfg.adminActorLevel === "string" && cfg.adminActorLevel.trim()
        ? cfg.adminActorLevel.trim()
        : "A3_system_operator",
  };
}

function json(res: ServerResponse, status: number, body: Record<string, unknown>) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(`${JSON.stringify(body, null, 2)}\n`);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
    if (chunks.reduce((acc, b) => acc + b.length, 0) > 2 * 1024 * 1024) {
      throw new Error("body_too_large");
    }
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, unknown>;
}

function parseAuth(req: IncomingMessage): { bearer: string | null; mutation: string | null } {
  const auth = req.headers.authorization;
  let bearer: string | null = null;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    bearer = auth.slice(7).trim();
  }
  const mutation =
    typeof req.headers["x-nmc-mutation-token"] === "string"
      ? req.headers["x-nmc-mutation-token"]
      : null;

  return { bearer, mutation };
}

function parseBoundedInt(value: string | null, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function applyCors(req: IncomingMessage, res: ServerResponse, cfg: Cfg): boolean {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin.trim() : "";
  if (!origin) return false;
  const allowed = cfg.corsOrigins.includes(origin);
  if (!allowed) return false;

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,x-nmc-mutation-token");
  res.setHeader("Access-Control-Max-Age", "600");
  return true;
}

async function runOpenClawJson(args: string[]): Promise<Record<string, unknown>> {
  const { stdout } = await execFileAsync("openclaw", args, {
    maxBuffer: 8 * 1024 * 1024,
    env: process.env,
  });
  try {
    return JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    return { raw: stdout };
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function resolveOpenClawConfigPath(): Promise<string> {
  const doctor = await runOpenClawJson(["nmc-agent", "doctor", "--json"]);
  const paths = asObject(doctor.paths);
  const configPath = paths.openclawConfigPath;
  if (typeof configPath === "string" && configPath.trim()) {
    return configPath;
  }
  throw new Error("openclaw_config_path_unavailable");
}

async function readOpenClawConfigJson(): Promise<{ path: string; cfg: Record<string, unknown> }> {
  const configPath = await resolveOpenClawConfigPath();
  const raw = await readFile(configPath, "utf-8");
  return { path: configPath, cfg: asObject(JSON.parse(raw)) };
}

function sanitizePluginEntries(cfg: Record<string, unknown>): Record<string, unknown> {
  const redact = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(redact);
    if (!value || typeof value !== "object") return value;
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(obj)) {
      out[key] = /key|token|secret|password/i.test(key) ? "***" : redact(nested);
    }
    return out;
  };

  const plugins = asObject(cfg.plugins);
  const entries = asObject(plugins.entries);
  const out: Record<string, unknown> = {};
  for (const [id, rawEntry] of Object.entries(entries)) {
    const entry = asObject(rawEntry);
    const config = asObject(entry.config);
    out[id] = {
      enabled: entry.enabled !== false,
      config: redact(config),
    };
  }
  return out;
}

function isMutating(method: string, path: string): boolean {
  if (method === "GET") return false;
  if (path === "/v1/health") return false;
  return true;
}

function pickPluginRows(raw: Record<string, unknown>): Array<Record<string, unknown>> {
  if (Array.isArray(raw.plugins)) return raw.plugins.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  if (Array.isArray(raw.items)) return raw.items.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  if (Array.isArray(raw.results)) return raw.results.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  if (Array.isArray(raw.data)) return raw.data.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  return [];
}

function pickRows(raw: Record<string, unknown>): Array<Record<string, unknown>> {
  if (Array.isArray(raw.items)) return raw.items.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  if (Array.isArray(raw.results)) return raw.results.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  if (Array.isArray(raw.data)) return raw.data.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  if (Array.isArray(raw.plugins)) return raw.plugins.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  return [];
}

function extractCount(raw: Record<string, unknown>): number {
  if (typeof raw.count === "number" && Number.isFinite(raw.count)) return Math.max(0, Math.trunc(raw.count));
  return pickRows(raw).length;
}

function pickMetric(raw: Record<string, unknown>, key: string): number | null {
  const candidates = [
    raw,
    asObject(raw.data),
    asObject(raw.details),
  ];
  for (const candidate of candidates) {
    const value = candidate[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

async function buildHeartbeatState(
  principal: string,
  actorLevel: string,
): Promise<Record<string, unknown>> {
  const [agents, stats, quality] = await Promise.all([
    runOpenClawJson(["nmc-agent", "list", "--json"]),
    runOpenClawJson(["nmc-mem", "stats", "--json"]),
    runOpenClawJson(["nmc-mem", "quality", "--json"]),
  ]);

  const agentCount = extractCount(agents);
  const pendingConflicts = pickMetric(quality, "pendingConflicts") ?? pickMetric(stats, "pendingConflicts") ?? 0;
  const pendingPromotions = pickMetric(quality, "pendingPromotions") ?? pickMetric(stats, "pendingPromotions") ?? 0;
  const staleFacts30d = pickMetric(quality, "staleFacts30d") ?? 0;
  const expiringIn24h = pickMetric(quality, "expiringIn24h") ?? 0;
  const lowConfidenceFacts = pickMetric(quality, "lowConfidenceFacts") ?? 0;
  const oldestPendingConflictAgeSec = pickMetric(quality, "oldestPendingConflictAgeSec");

  const degradedReasons: string[] = [];
  if (pendingConflicts >= 50) degradedReasons.push("high_pending_conflicts");
  if (pendingPromotions >= 100) degradedReasons.push("high_pending_promotions");
  if (staleFacts30d >= 1000) degradedReasons.push("high_staleness");
  if (expiringIn24h >= 500) degradedReasons.push("high_expiry_pressure");
  if (lowConfidenceFacts >= 500) degradedReasons.push("high_low_confidence");
  if ((oldestPendingConflictAgeSec ?? 0) >= 7 * 24 * 3600) {
    degradedReasons.push("stale_conflict_queue");
  }

  const status = degradedReasons.length > 0 ? "degraded" : "healthy";
  const recommendedActions = degradedReasons.length > 0
    ? [
        "Run nmc-mem prune --mode both",
        "Review nmc-mem conflicts --status pending",
        "Review promotion queue nmc-mem decide",
      ]
    : ["No immediate maintenance required."];

  return {
    status,
    principal,
    actorLevel,
    ts: new Date().toISOString(),
    metrics: {
      agentCount,
      pendingConflicts,
      pendingPromotions,
      staleFacts30d,
      expiringIn24h,
      lowConfidenceFacts,
      oldestPendingConflictAgeSec,
    },
    degradedReasons,
    recommendedActions,
    raw: {
      agents,
      stats,
      quality,
    },
  };
}

function collectPluginDescriptors(discovered: Record<string, unknown>): Record<string, PluginDescriptor> {
  const rows = pickPluginRows(discovered);
  const out: Record<string, PluginDescriptor> = {};
  for (const row of rows) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    const config = asObject(row.config);
    const schemaFromLegacy = row.configSchema && typeof row.configSchema === "object"
      ? (row.configSchema as JsonSchema)
      : undefined;
    const schemaFromConfig = config.schema && typeof config.schema === "object"
      ? (config.schema as JsonSchema)
      : undefined;
    const uiHintsFromLegacy = row.uiHints && typeof row.uiHints === "object"
      ? (row.uiHints as Record<string, unknown>)
      : undefined;
    const uiHintsFromConfig = config.uiHints && typeof config.uiHints === "object"
      ? (config.uiHints as Record<string, unknown>)
      : undefined;
    const admin =
      row.admin && typeof row.admin === "object" && !Array.isArray(row.admin)
        ? (row.admin as Record<string, unknown>)
        : undefined;
    out[id] = {
      id,
      name: typeof row.name === "string" ? row.name : undefined,
      kind: typeof row.kind === "string" ? row.kind : undefined,
      version: typeof row.version === "string" ? row.version : undefined,
      skills: Array.isArray(row.skills)
        ? row.skills.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : undefined,
      configSchema: schemaFromConfig ?? schemaFromLegacy,
      uiHints: uiHintsFromConfig ?? uiHintsFromLegacy,
      admin,
    };
  }
  return out;
}

function schemaAllowsType(schema: JsonSchema, value: unknown): boolean {
  if (!schema.type) return true;
  const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
  return allowed.some((type) => {
    if (type === "null") return value === null;
    if (type === "array") return Array.isArray(value);
    if (type === "integer") return typeof value === "number" && Number.isInteger(value);
    if (type === "number") return typeof value === "number";
    return typeof value === type;
  });
}

function validateBySchema(value: unknown, schema: JsonSchema, path = "config"): string[] {
  const errors: string[] = [];
  if (!schemaAllowsType(schema, value)) {
    errors.push(`${path}: invalid type`);
    return errors;
  }

  if (schema.enum && schema.enum.length > 0 && !schema.enum.some((x) => JSON.stringify(x) === JSON.stringify(value))) {
    errors.push(`${path}: must be one of enum values`);
    return errors;
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) errors.push(`${path}: must be >= ${schema.minimum}`);
    if (typeof schema.maximum === "number" && value > schema.maximum) errors.push(`${path}: must be <= ${schema.maximum}`);
  }

  if (Array.isArray(value)) {
    if (schema.items) {
      for (let i = 0; i < value.length; i += 1) {
        errors.push(...validateBySchema(value[i], schema.items, `${path}[${i}]`));
      }
    }
    return errors;
  }

  if (!value || typeof value !== "object") {
    return errors;
  }

  const obj = value as Record<string, unknown>;
  const props = schema.properties ?? {};
  const required = schema.required ?? [];
  for (const key of required) {
    if (!(key in obj)) errors.push(`${path}.${key}: required`);
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(obj)) {
      if (!(key in props)) errors.push(`${path}.${key}: additional property not allowed`);
    }
  }

  for (const [key, childSchema] of Object.entries(props)) {
    if (key in obj) errors.push(...validateBySchema(obj[key], childSchema, `${path}.${key}`));
  }

  return errors;
}

const plugin = {
  id: "nmc-control-plane",
  name: "NMC Control Plane",
  description: "Local API for memory/lifecycle operations",
  configSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      host: { type: "string" },
      port: { type: "integer" },
      apiTokenEnv: { type: "string" },
      mutationTokenEnv: { type: "string" },
      allowMutations: { type: "boolean" },
      corsOrigins: { type: "array", items: { type: "string" } },
      adminPrincipal: { type: "string" },
      adminActorLevel: { type: "string" },
    },
  },

  register(api: OpenClawPluginApi) {
    const cfg = parseCfg(api.pluginConfig);
    const apiToken = process.env[cfg.apiTokenEnv] ?? "";
    const mutationToken = process.env[cfg.mutationTokenEnv] ?? "";

    let server: ReturnType<typeof createServer> | null = null;

    api.registerTool(
      {
        name: "nmc_ops_health",
        label: "NMC Ops Health",
        description: "Health summary of control-plane service and plugins.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
        async execute() {
          const payload = {
            ok: true,
            host: cfg.host,
            port: cfg.port,
            allowMutations: cfg.allowMutations,
            hasApiToken: Boolean(apiToken),
            hasMutationToken: Boolean(mutationToken),
            corsOrigins: cfg.corsOrigins,
          };
          return {
            content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
            details: payload,
          };
        },
      },
      { name: "nmc_ops_health" },
    );

    api.registerTool(
      {
        name: "nmc_ops_heartbeat",
        label: "NMC Ops Heartbeat",
        description: "Runtime heartbeat summary for agents + memory quality pressure.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            principal: { type: "string" },
            actorLevel: { type: "string" },
          },
        },
        async execute(_toolCallId, rawParams) {
          const params = asObject(rawParams);
          const principal =
            typeof params.principal === "string" && params.principal.trim()
              ? params.principal.trim()
              : cfg.adminPrincipal;
          const actorLevel =
            typeof params.actorLevel === "string" && params.actorLevel.trim()
              ? params.actorLevel.trim()
              : cfg.adminActorLevel;
          const payload = await buildHeartbeatState(principal, actorLevel);
          return {
            content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
            details: payload,
          };
        },
      },
      { name: "nmc_ops_heartbeat" },
    );

    api.registerCli(
      ({ program }) => {
        const cmd = program
          .command("nmc-ops")
          .description("Control-plane helper commands");

        cmd
          .command("health")
          .option("--json", "JSON output")
          .action(async (opts: { json?: boolean }) => {
            const payload = {
              ok: true,
              service: { host: cfg.host, port: cfg.port },
              allowMutations: cfg.allowMutations,
              tokens: {
                apiToken: Boolean(apiToken),
                mutationToken: Boolean(mutationToken),
              },
              corsOrigins: cfg.corsOrigins,
              adminPrincipal: cfg.adminPrincipal,
              adminActorLevel: cfg.adminActorLevel,
            };
            if (opts.json) {
              console.log(JSON.stringify(payload, null, 2));
            } else {
              console.log(JSON.stringify(payload, null, 2));
            }
          });

        cmd
          .command("heartbeat")
          .option("--principal <principal>", "principal", cfg.adminPrincipal)
          .option("--actor-level <level>", "actor level", cfg.adminActorLevel)
          .option("--json", "JSON output")
          .action(async (opts: { principal?: string; actorLevel?: string; json?: boolean }) => {
            const payload = await buildHeartbeatState(
              typeof opts.principal === "string" && opts.principal.trim() ? opts.principal.trim() : cfg.adminPrincipal,
              typeof opts.actorLevel === "string" && opts.actorLevel.trim() ? opts.actorLevel.trim() : cfg.adminActorLevel,
            );
            if (opts.json) {
              console.log(JSON.stringify(payload, null, 2));
            } else {
              console.log(JSON.stringify(payload, null, 2));
            }
          });
      },
      {
        commands: ["nmc-ops", "nmc-ops health", "nmc-ops heartbeat"],
      },
    );

    api.registerService({
      id: "nmc-control-plane",
      start: () => {
        server = createServer(async (req, res) => {
          const method = req.method ?? "GET";
          const url = new URL(req.url ?? "/", `http://${cfg.host}:${cfg.port}`);
          const path = url.pathname;
          applyCors(req, res, cfg);

          if (method === "OPTIONS") {
            res.statusCode = 204;
            res.end();
            return;
          }

          const auth = parseAuth(req);
          if (!apiToken || auth.bearer !== apiToken) {
            json(res, 401, { ok: false, error: "unauthorized" });
            return;
          }

          if (isMutating(method, path)) {
            const allowed = cfg.allowMutations || (mutationToken && auth.mutation === mutationToken);
            if (!allowed) {
              json(res, 403, {
                ok: false,
                error: "mutations_locked",
                hint: "Set allowMutations=true or pass valid x-nmc-mutation-token",
              });
              return;
            }
          }

          try {
            if (method === "GET" && path === "/v1/health") {
              json(res, 200, {
                ok: true,
                service: "nmc-control-plane",
                ts: new Date().toISOString(),
                host: cfg.host,
                port: cfg.port,
              });
              return;
            }

            if (method === "GET" && path === "/v1/agents") {
              const payload = await runOpenClawJson(["nmc-agent", "list", "--json"]);
              json(res, 200, { ok: true, data: payload });
              return;
            }

            if (method === "POST" && path === "/v1/agents") {
              const body = await readJsonBody(req);
              const args = [
                "nmc-agent",
                "create",
                "--agent-id",
                String(body.agent_id ?? ""),
                "--display-name",
                String(body.display_name ?? ""),
                "--access-level",
                String(body.access_level ?? "A1_worker"),
                "--json",
              ];
              if (Array.isArray(body.domain_scopes)) {
                for (const scope of body.domain_scopes) {
                  args.push("--domain-scope", String(scope));
                }
              }
              if (typeof body.heartbeat_every === "string") {
                args.push("--heartbeat", body.heartbeat_every);
              }
              const payload = await runOpenClawJson(args);
              json(res, 200, { ok: true, data: payload });
              return;
            }

            if (method === "DELETE" && path.startsWith("/v1/agents/")) {
              const agentId = decodeURIComponent(path.replace("/v1/agents/", ""));
              const payload = await runOpenClawJson([
                "nmc-agent",
                "delete",
                "--agent-id",
                agentId,
                "--mode",
                "hard",
                "--json",
              ]);
              json(res, 200, { ok: true, data: payload });
              return;
            }

            if (method === "POST" && path.endsWith("/access-level") && path.startsWith("/v1/agents/")) {
              const agentId = decodeURIComponent(path.replace("/v1/agents/", "").replace("/access-level", ""));
              const body = await readJsonBody(req);
              const payload = await runOpenClawJson([
                "nmc-agent",
                "set-access",
                "--agent-id",
                agentId,
                "--access-level",
                String(body.access_level ?? "A1_worker"),
                "--json",
              ]);
              json(res, 200, { ok: true, data: payload });
              return;
            }

            if (method === "GET" && path === "/v1/admin/plugins") {
              const discovered = await runOpenClawJson(["plugins", "list", "--json"]);
              const descriptors = collectPluginDescriptors(discovered);
              const { path: configPath, cfg: openclawCfg } = await readOpenClawConfigJson();
              const plugins = asObject(openclawCfg.plugins);
              json(res, 200, {
                ok: true,
                data: {
                  configPath,
                  slots: asObject(plugins.slots),
                  entries: sanitizePluginEntries(openclawCfg),
                  descriptors,
                  discovered,
                },
              });
              return;
            }

            if (method === "GET" && path === "/v1/admin/plugins/contracts") {
              const discovered = await runOpenClawJson(["plugins", "list", "--json"]);
              const descriptors = collectPluginDescriptors(discovered);
              const { cfg: openclawCfg } = await readOpenClawConfigJson();
              json(res, 200, {
                ok: true,
                data: {
                  count: Object.keys(descriptors).length,
                  descriptors,
                  entries: sanitizePluginEntries(openclawCfg),
                },
              });
              return;
            }

            if (method === "GET" && path === "/v1/admin/skills") {
              const listed = await runOpenClawJson(["skills", "list", "--json"]);
              const discovered = await runOpenClawJson(["plugins", "list", "--json"]);
              const descriptors = collectPluginDescriptors(discovered);
              const skillsByPlugin = Object.values(descriptors)
                .filter((row) => Array.isArray(row.skills) && row.skills.length > 0)
                .map((row) => ({
                  pluginId: row.id,
                  pluginName: row.name ?? row.id,
                  skills: row.skills,
                }));

              json(res, 200, {
                ok: true,
                data: {
                  count: extractCount(listed),
                  listed,
                  pluginSkills: skillsByPlugin,
                },
              });
              return;
            }

            if (method === "GET" && path === "/v1/admin/capabilities") {
              const actorLevel = String(url.searchParams.get("actor_level") ?? cfg.adminActorLevel).trim() || cfg.adminActorLevel;
              const discovered = await runOpenClawJson(["plugins", "list", "--json"]);
              const descriptors = collectPluginDescriptors(discovered);
              const listedSkills = await runOpenClawJson(["skills", "list", "--json"]);
              const layers = await runOpenClawJson(["nmc-mem", "layers", "--actor-level", actorLevel, "--json"]);
              const quality = await runOpenClawJson(["nmc-mem", "quality", "--json"]);
              const bootstrap = await runOpenClawJson([
                "nmc-mem",
                "bootstrap",
                "--principal",
                cfg.adminPrincipal,
                "--actor-level",
                actorLevel,
                "--query",
                "admin capabilities bootstrap",
                "--json",
              ]);
              const accessProfile = await runOpenClawJson([
                "nmc-mem",
                "access-profile",
                "--principal",
                cfg.adminPrincipal,
                "--actor-level",
                actorLevel,
                "--query",
                "admin capabilities bootstrap",
                "--json",
              ]);
              const memoryCatalog = await runOpenClawJson([
                "nmc-mem",
                "catalog",
                "--principal",
                cfg.adminPrincipal,
                "--actor-level",
                actorLevel,
                "--query",
                "admin capabilities bootstrap",
                "--json",
              ]);
              const heartbeat = await buildHeartbeatState(cfg.adminPrincipal, actorLevel);
              const { path: configPath, cfg: openclawCfg } = await readOpenClawConfigJson();
              const plugins = asObject(openclawCfg.plugins);
              const pluginSkills = Object.values(descriptors)
                .filter((row) => Array.isArray(row.skills) && row.skills.length > 0)
                .map((row) => ({
                  pluginId: row.id,
                  pluginName: row.name ?? row.id,
                  skills: row.skills,
                }));

              json(res, 200, {
                ok: true,
                data: {
                  defaults: {
                    adminPrincipal: cfg.adminPrincipal,
                    adminActorLevel: cfg.adminActorLevel,
                  },
                  plugins: {
                    configPath,
                    slots: asObject(plugins.slots),
                    entries: sanitizePluginEntries(openclawCfg),
                    descriptors,
                  },
                  skills: {
                    count: extractCount(listedSkills),
                    listed: listedSkills,
                    pluginSkills,
                  },
                  memory: {
                    actorLevel,
                    layers,
                    quality,
                    bootstrap,
                    accessProfile,
                    catalog: memoryCatalog,
                    heartbeat,
                  },
                  endpoints: {
                    admin: [
                      "/v1/admin/plugins",
                      "/v1/admin/plugins/contracts",
                      "/v1/admin/skills",
                      "/v1/admin/capabilities",
                      "/v1/admin/monitoring",
                      "/v1/admin/plugins/:id/config",
                      "/v1/heartbeat/state",
                    ],
                    memory: [
                      "/v1/memory/plan",
                      "/v1/memory/bootstrap",
                      "/v1/memory/access-profile",
                      "/v1/memory/catalog",
                      "/v1/memory/principals",
                      "/v1/memory/grants",
                      "/v1/memory/recall",
                      "/v1/memory/store",
                      "/v1/memory/promote",
                      "/v1/memory/promotions/:id/decide",
                      "/v1/memory/conflicts",
                      "/v1/memory/conflicts/:id/resolve",
                      "/v1/memory/prune",
                      "/v1/memory/stats",
                      "/v1/memory/quality",
                      "/v1/memory/layers",
                    ],
                  },
                },
              });
              return;
            }

            if (method === "GET" && path === "/v1/admin/monitoring") {
              const actorLevel = String(url.searchParams.get("actor_level") ?? cfg.adminActorLevel).trim() || cfg.adminActorLevel;
              const principal = String(url.searchParams.get("principal") ?? cfg.adminPrincipal).trim();
              const [agents, stats, quality, layers, auditEvents, heartbeat] = await Promise.all([
                runOpenClawJson(["nmc-agent", "list", "--json"]),
                runOpenClawJson(["nmc-mem", "stats", "--json"]),
                runOpenClawJson(["nmc-mem", "quality", "--json"]),
                runOpenClawJson(["nmc-mem", "layers", "--actor-level", actorLevel, "--json"]),
                runOpenClawJson(["nmc-agent", "doctor", "--json"]),
                buildHeartbeatState(principal || cfg.adminPrincipal, actorLevel),
              ]);
              const accessProfile = principal
                ? await runOpenClawJson([
                    "nmc-mem",
                    "access-profile",
                    "--principal",
                    principal,
                    "--actor-level",
                    actorLevel,
                    "--query",
                    "monitoring dashboard",
                    "--json",
                  ])
                : null;
              const catalog = principal
                ? await runOpenClawJson([
                    "nmc-mem",
                    "catalog",
                    "--principal",
                    principal,
                    "--actor-level",
                    actorLevel,
                    "--query",
                    "monitoring dashboard",
                    "--json",
                  ])
                : null;
              const principals = principal
                ? await runOpenClawJson([
                    "nmc-mem",
                    "principals",
                    "--principal",
                    principal,
                    "--actor-level",
                    actorLevel,
                    "--limit",
                    "200",
                    "--json",
                  ])
                : null;
              const grants = principal
                ? await runOpenClawJson([
                    "nmc-mem",
                    "grants",
                    "--principal",
                    principal,
                    "--target",
                    principal,
                    "--actor-level",
                    actorLevel,
                    "--json",
                  ])
                : null;
              let conflicts: Record<string, unknown> | null = null;
              if (principal) {
                conflicts = await runOpenClawJson([
                  "nmc-mem",
                  "conflicts",
                  "--status",
                  "pending",
                  "--limit",
                  "200",
                  "--actor-level",
                  actorLevel,
                  "--principal",
                  principal,
                  "--json",
                ]);
              }

              json(res, 200, {
                ok: true,
                data: {
                  ts: new Date().toISOString(),
                  principal,
                  actorLevel,
                  agents: {
                    count: extractCount(agents),
                    data: agents,
                  },
                  memory: {
                    stats,
                    quality,
                    layers,
                    accessProfile,
                    catalog,
                    principalsCount: principals ? extractCount(principals) : null,
                    principals,
                    grantsCount: grants ? extractCount(grants) : null,
                    grants,
                    conflictsPending: conflicts ? extractCount(conflicts) : null,
                    conflicts,
                  },
                  runtime: {
                    controlPlane: {
                      host: cfg.host,
                      port: cfg.port,
                      allowMutations: cfg.allowMutations,
                    },
                    heartbeat,
                    doctor: auditEvents,
                  },
                },
              });
              return;
            }

            if (method === "POST" && path.startsWith("/v1/admin/plugins/") && path.endsWith("/config")) {
              const pluginId = decodeURIComponent(path.replace("/v1/admin/plugins/", "").replace("/config", ""));
              if (!pluginId.trim()) {
                json(res, 400, { ok: false, error: "plugin_id_required" });
                return;
              }
              const body = await readJsonBody(req);
              const discovered = await runOpenClawJson(["plugins", "list", "--json"]);
              const descriptors = collectPluginDescriptors(discovered);
              const { path: configPath, cfg: openclawCfg } = await readOpenClawConfigJson();

              openclawCfg.plugins = asObject(openclawCfg.plugins);
              const plugins = asObject(openclawCfg.plugins);
              plugins.entries = asObject(plugins.entries);
              const entries = asObject(plugins.entries);
              const existing = asObject(entries[pluginId]);

              const patchEnabled = typeof body.enabled === "boolean" ? body.enabled : existing.enabled !== false;
              const patchConfig = body.config && typeof body.config === "object" && !Array.isArray(body.config)
                ? (body.config as Record<string, unknown>)
                : {};

              entries[pluginId] = {
                ...existing,
                enabled: patchEnabled,
                config: {
                  ...asObject(existing.config),
                  ...patchConfig,
                },
              };

              const mergedConfig = asObject((entries[pluginId] as Record<string, unknown>).config);
              const schema = descriptors[pluginId]?.configSchema;
              if (schema) {
                const errors = validateBySchema(mergedConfig, schema, "config");
                if (errors.length > 0) {
                  json(res, 400, {
                    ok: false,
                    error: "invalid_plugin_config",
                    pluginId,
                    validationErrors: errors,
                  });
                  return;
                }
              }

              plugins.entries = entries;
              openclawCfg.plugins = plugins;
              await writeFile(configPath, `${JSON.stringify(openclawCfg, null, 2)}\n`, "utf-8");

              json(res, 200, {
                ok: true,
                data: {
                  pluginId,
                  enabled: patchEnabled,
                  configPath,
                  entry: sanitizePluginEntries(openclawCfg)[pluginId] ?? null,
                },
              });
              return;
            }

            if (method === "POST" && path === "/v1/memory/recall") {
              const body = await readJsonBody(req);
              const principal = String(body.principal ?? "").trim();
              if (!principal) {
                json(res, 400, { ok: false, error: "principal_required" });
                return;
              }
              const args = [
                "nmc-mem",
                "recall",
                String(body.query ?? ""),
                "--scope",
                String(body.scope ?? "global"),
                "--limit",
                String(body.limit ?? 5),
                "--actor-level",
                String(body.actor_level ?? "A1_worker"),
                "--principal",
                principal,
                "--json",
              ];
              if (Array.isArray(body.layers)) {
                for (const layer of body.layers) {
                  args.push("--layer", String(layer));
                }
              }
              if (typeof body.min_score === "number" && Number.isFinite(body.min_score)) {
                args.push("--min-score", String(body.min_score));
              }
              const payload = await runOpenClawJson(args);
              json(res, 200, { ok: true, data: payload });
              return;
            }

            if (method === "GET" && path === "/v1/memory/plan") {
              const query = String(url.searchParams.get("query") ?? "").trim();
              if (!query) {
                json(res, 400, { ok: false, error: "query_required" });
                return;
              }
              const args = [
                "nmc-mem",
                "plan",
                query,
                "--actor-level",
                String(url.searchParams.get("actor_level") ?? "A1_worker"),
                "--json",
              ];
              const scope = String(url.searchParams.get("scope") ?? "").trim();
              if (scope) {
                args.push("--scope", scope);
              }
              for (const layer of url.searchParams.getAll("layer")) {
                const trimmed = String(layer ?? "").trim();
                if (!trimmed) continue;
                args.push("--layer", trimmed);
              }
              const payload = await runOpenClawJson(args);
              json(res, 200, { ok: true, data: payload });
              return;
            }

            if (method === "GET" && path === "/v1/memory/access-profile") {
              const principal = String(url.searchParams.get("principal") ?? "").trim();
              if (!principal) {
                json(res, 400, { ok: false, error: "principal_required" });
                return;
              }
              const args = [
                "nmc-mem",
                "access-profile",
                "--principal",
                principal,
                "--actor-level",
                String(url.searchParams.get("actor_level") ?? "A1_worker"),
                "--scope",
                String(url.searchParams.get("scope") ?? "global"),
                "--query",
                String(url.searchParams.get("query") ?? "default recall"),
                "--json",
              ];
              for (const layer of url.searchParams.getAll("layer")) {
                const trimmed = String(layer ?? "").trim();
                if (!trimmed) continue;
                args.push("--layer", trimmed);
              }
              const payload = await runOpenClawJson(args);
              json(res, 200, { ok: true, data: payload });
              return;
            }

            if (method === "GET" && path === "/v1/memory/bootstrap") {
              const principal = String(url.searchParams.get("principal") ?? "").trim();
              if (!principal) {
                json(res, 400, { ok: false, error: "principal_required" });
                return;
              }
              const args = [
                "nmc-mem",
                "bootstrap",
                "--principal",
                principal,
                "--actor-level",
                String(url.searchParams.get("actor_level") ?? "A1_worker"),
                "--scope",
                String(url.searchParams.get("scope") ?? "global"),
                "--query",
                String(url.searchParams.get("query") ?? "default recall"),
                "--json",
              ];
              for (const layer of url.searchParams.getAll("layer")) {
                const trimmed = String(layer ?? "").trim();
                if (!trimmed) continue;
                args.push("--layer", trimmed);
              }
              const payload = await runOpenClawJson(args);
              json(res, 200, { ok: true, data: payload });
              return;
            }

            if (method === "GET" && path === "/v1/memory/catalog") {
              const principal = String(url.searchParams.get("principal") ?? "").trim();
              if (!principal) {
                json(res, 400, { ok: false, error: "principal_required" });
                return;
              }
              const args = [
                "nmc-mem",
                "catalog",
                "--principal",
                principal,
                "--actor-level",
                String(url.searchParams.get("actor_level") ?? "A1_worker"),
                "--scope",
                String(url.searchParams.get("scope") ?? "global"),
                "--query",
                String(url.searchParams.get("query") ?? "default recall"),
                "--json",
              ];
              for (const layer of url.searchParams.getAll("layer")) {
                const trimmed = String(layer ?? "").trim();
                if (!trimmed) continue;
                args.push("--layer", trimmed);
              }
              const payload = await runOpenClawJson(args);
              json(res, 200, { ok: true, data: payload });
              return;
            }

            if (method === "GET" && path === "/v1/memory/principals") {
              const principal = String(url.searchParams.get("principal") ?? "").trim();
              if (!principal) {
                json(res, 400, { ok: false, error: "principal_required" });
                return;
              }
              const limit = parseBoundedInt(url.searchParams.get("limit"), 200, 1, 2000);
              const actorLevel = String(url.searchParams.get("actor_level") ?? "A3_system_operator");
              const payload = await runOpenClawJson([
                "nmc-mem",
                "principals",
                "--limit",
                String(limit),
                "--actor-level",
                actorLevel,
                "--principal",
                principal,
                "--json",
              ]);
              json(res, 200, { ok: true, data: payload });
              return;
            }

            if (method === "GET" && path === "/v1/memory/grants") {
              const principal = String(url.searchParams.get("principal") ?? "").trim();
              if (!principal) {
                json(res, 400, { ok: false, error: "principal_required" });
                return;
              }
              const targetPrincipal = String(url.searchParams.get("target_principal") ?? principal).trim();
              if (!targetPrincipal) {
                json(res, 400, { ok: false, error: "target_principal_required" });
                return;
              }
              const actorLevel = String(url.searchParams.get("actor_level") ?? "A3_system_operator");
              const payload = await runOpenClawJson([
                "nmc-mem",
                "grants",
                "--principal",
                principal,
                "--target",
                targetPrincipal,
                "--actor-level",
                actorLevel,
                "--json",
              ]);
              json(res, 200, { ok: true, data: payload });
              return;
            }

            if (method === "POST" && path === "/v1/memory/grants") {
              const body = await readJsonBody(req);
              const principal = String(body.principal ?? "").trim();
              if (!principal) {
                json(res, 400, { ok: false, error: "principal_required" });
                return;
              }
              const targetPrincipal = String(body.target_principal ?? "").trim();
              if (!targetPrincipal) {
                json(res, 400, { ok: false, error: "target_principal_required" });
                return;
              }
              const layer = String(body.layer ?? "").trim();
              const mode = String(body.mode ?? "").trim();
              if (!layer || !mode) {
                json(res, 400, { ok: false, error: "layer_and_mode_required" });
                return;
              }
              const payload = await runOpenClawJson([
                "nmc-mem",
                "grant-set",
                "--principal",
                principal,
                "--target",
                targetPrincipal,
                "--layer",
                layer,
                "--mode",
                mode,
                "--scope",
                String(body.scope ?? "global"),
                "--actor-level",
                String(body.actor_level ?? "A4_orchestrator_full"),
                "--json",
              ]);
              json(res, 200, { ok: true, data: payload });
              return;
            }

            if (method === "DELETE" && path === "/v1/memory/grants") {
              const principal = String(url.searchParams.get("principal") ?? "").trim();
              if (!principal) {
                json(res, 400, { ok: false, error: "principal_required" });
                return;
              }
              const targetPrincipal = String(url.searchParams.get("target_principal") ?? "").trim();
              if (!targetPrincipal) {
                json(res, 400, { ok: false, error: "target_principal_required" });
                return;
              }
              const layer = String(url.searchParams.get("layer") ?? "").trim();
              const mode = String(url.searchParams.get("mode") ?? "").trim();
              if (!layer || !mode) {
                json(res, 400, { ok: false, error: "layer_and_mode_required" });
                return;
              }
              const payload = await runOpenClawJson([
                "nmc-mem",
                "grant-delete",
                "--principal",
                principal,
                "--target",
                targetPrincipal,
                "--layer",
                layer,
                "--mode",
                mode,
                "--scope",
                String(url.searchParams.get("scope") ?? "global"),
                "--actor-level",
                String(url.searchParams.get("actor_level") ?? "A4_orchestrator_full"),
                "--json",
              ]);
              json(res, 200, { ok: true, data: payload });
              return;
            }

            if (method === "POST" && path === "/v1/memory/store") {
              const body = await readJsonBody(req);
              const principal = String(body.principal ?? "").trim();
              if (!principal) {
                json(res, 400, { ok: false, error: "principal_required" });
                return;
              }
              const args = [
                "nmc-mem",
                "store",
                "--text",
                String(body.text ?? ""),
                "--layer",
                String(body.layer ?? "M1_local"),
                "--scope",
                String(body.scope ?? "global"),
                "--owner",
                String(body.owner ?? "system"),
                "--category",
                String(body.category ?? "other"),
                "--source",
                String(body.source ?? "api"),
                "--actor-level",
                String(body.actor_level ?? "A1_worker"),
                "--principal",
                principal,
                "--json",
              ];
              const payload = await runOpenClawJson(args);
              json(res, 200, { ok: true, data: payload });
              return;
            }

            if (method === "POST" && path === "/v1/memory/promote") {
              const body = await readJsonBody(req);
              const principal = String(body.principal ?? "").trim();
              if (!principal) {
                json(res, 400, { ok: false, error: "principal_required" });
                return;
              }
              const payload = await runOpenClawJson([
                "nmc-mem",
                "promote",
                "--candidate-id",
                String(body.candidate_id ?? ""),
                "--target-layer",
                String(body.target_layer ?? "M4_global_facts"),
                "--reason",
                String(body.reason ?? "promotion_request"),
                "--requested-by",
                String(body.requested_by ?? "api"),
                "--actor-level",
                String(body.actor_level ?? "A2_domain_builder"),
                "--principal",
                principal,
                "--json",
              ]);
              json(res, 200, { ok: true, data: payload });
              return;
            }

            if (method === "POST" && path.startsWith("/v1/memory/promotions/") && path.endsWith("/decide")) {
              const promotionId = decodeURIComponent(
                path.replace("/v1/memory/promotions/", "").replace("/decide", ""),
              );
              const body = await readJsonBody(req);
              const principal = String(body.principal ?? "").trim();
              if (!principal) {
                json(res, 400, { ok: false, error: "principal_required" });
                return;
              }
              const payload = await runOpenClawJson([
                "nmc-mem",
                "decide",
                "--promotion-id",
                promotionId,
                "--decision",
                String(body.decision ?? "rejected"),
                "--reason",
                String(body.reason ?? "api_decision"),
                "--reviewer",
                String(body.reviewer ?? "orchestrator"),
                "--actor-level",
                String(body.actor_level ?? "A4_orchestrator_full"),
                "--principal",
                principal,
                "--json",
              ]);
              json(res, 200, { ok: true, data: payload });
              return;
            }

            if (method === "POST" && path === "/v1/memory/prune") {
              const body = await readJsonBody(req);
              const payload = await runOpenClawJson([
                "nmc-mem",
                "prune",
                "--mode",
                String(body.mode ?? "both"),
                "--json",
              ]);
              json(res, 200, { ok: true, data: payload });
              return;
            }

            if (method === "GET" && path === "/v1/memory/conflicts") {
              const principal = String(url.searchParams.get("principal") ?? "").trim();
              if (!principal) {
                json(res, 400, { ok: false, error: "principal_required" });
                return;
              }
              const limit = parseBoundedInt(url.searchParams.get("limit"), 20, 1, 200);
              const status = String(url.searchParams.get("status") ?? "pending");
              const actorLevel = String(url.searchParams.get("actor_level") ?? "A3_system_operator");
              const payload = await runOpenClawJson([
                "nmc-mem",
                "conflicts",
                "--limit",
                String(limit),
                "--status",
                status,
                "--actor-level",
                actorLevel,
                "--principal",
                principal,
                "--json",
              ]);
              json(res, 200, { ok: true, data: payload });
              return;
            }

            if (method === "POST" && path.startsWith("/v1/memory/conflicts/") && path.endsWith("/resolve")) {
              const conflictId = decodeURIComponent(
                path.replace("/v1/memory/conflicts/", "").replace("/resolve", ""),
              ).trim();
              if (!conflictId) {
                json(res, 400, { ok: false, error: "conflict_id_required" });
                return;
              }
              const body = await readJsonBody(req);
              const principal = String(body.principal ?? "").trim();
              if (!principal) {
                json(res, 400, { ok: false, error: "principal_required" });
                return;
              }
              const resolution = String(body.resolution ?? "apply_incoming");
              const actorLevel = String(body.actor_level ?? "A4_orchestrator_full");
              const payload = await runOpenClawJson([
                "nmc-mem",
                "resolve-conflict",
                "--id",
                conflictId,
                "--resolution",
                resolution,
                "--actor-level",
                actorLevel,
                "--principal",
                principal,
                "--json",
              ]);
              json(res, 200, { ok: true, data: payload });
              return;
            }

            if (method === "GET" && path === "/v1/memory/layers") {
              const actorLevel = String(url.searchParams.get("actor_level") ?? "").trim();
              const args = ["nmc-mem", "layers", "--json"];
              if (actorLevel) args.push("--actor-level", actorLevel);
              const payload = await runOpenClawJson(args);
              json(res, 200, { ok: true, data: payload });
              return;
            }

            if (method === "GET" && path === "/v1/memory/stats") {
              const payload = await runOpenClawJson(["nmc-mem", "stats", "--json"]);
              json(res, 200, { ok: true, data: payload });
              return;
            }

            if (method === "GET" && path === "/v1/memory/quality") {
              const payload = await runOpenClawJson(["nmc-mem", "quality", "--json"]);
              json(res, 200, { ok: true, data: payload });
              return;
            }

            if (method === "GET" && path === "/v1/audit/events") {
              const doctor = await runOpenClawJson(["nmc-agent", "doctor", "--json"]);
              const paths = (doctor.paths ?? {}) as Record<string, unknown>;
              const auditPath = typeof paths.audit === "string" ? paths.audit : "";
              if (!auditPath) {
                json(res, 500, { ok: false, error: "audit_path_unavailable" });
                return;
              }

              const limit = parseBoundedInt(url.searchParams.get("limit"), 200, 1, 2000);
              let raw = "";
              try {
                raw = await readFile(auditPath, "utf-8");
              } catch (err) {
                if ((err as NodeJS.ErrnoException).code === "ENOENT") {
                  json(res, 200, { ok: true, data: { count: 0, events: [] } });
                  return;
                }
                throw err;
              }

              const lines = raw
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean);
              const tail = lines.slice(Math.max(0, lines.length - limit));
              const events: Array<Record<string, unknown>> = [];
              for (const line of tail) {
                try {
                  const parsed = JSON.parse(line) as Record<string, unknown>;
                  events.push(parsed);
                } catch {}
              }
              json(res, 200, { ok: true, data: { count: events.length, events } });
              return;
            }

            if (method === "GET" && path === "/v1/heartbeat/state") {
              const principal = String(url.searchParams.get("principal") ?? cfg.adminPrincipal).trim() || cfg.adminPrincipal;
              const actorLevel = String(url.searchParams.get("actor_level") ?? cfg.adminActorLevel).trim() || cfg.adminActorLevel;
              const payload = await buildHeartbeatState(principal, actorLevel);
              json(res, 200, { ok: true, data: payload });
              return;
            }

            json(res, 404, { ok: false, error: "not_found" });
          } catch (err) {
            json(res, 500, {
              ok: false,
              error: "internal_error",
              message: err instanceof Error ? err.message : String(err),
            });
          }
        });

        server.listen(cfg.port, cfg.host, () => {
          api.logger.info?.(`nmc-control-plane: listening on http://${cfg.host}:${cfg.port}`);
        });
      },
      stop: () => {
        if (server) {
          server.close();
          server = null;
        }
      },
    });

    api.logger.info?.("nmc-control-plane: registered");
  },
};

export default plugin;

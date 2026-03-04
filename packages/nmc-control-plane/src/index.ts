import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

const execFileAsync = promisify(execFile);

type Cfg = {
  host: string;
  port: number;
  apiTokenEnv: string;
  mutationTokenEnv: string;
  allowMutations: boolean;
};

function parseCfg(raw: unknown): Cfg {
  const cfg = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
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

function isMutating(method: string, path: string): boolean {
  if (method === "GET") return false;
  if (path === "/v1/health") return false;
  return true;
}

const plugin = {
  id: "nmc-control-plane",
  name: "NMC Control Plane",
  description: "Local API for memory/lifecycle operations",
  configSchema: emptyPluginConfigSchema(),

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
          };
          return {
            content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
            details: payload,
          };
        },
      },
      { name: "nmc_ops_health" },
    );

    api.registerCli(
      ({ program }) => {
        program
          .command("nmc-ops")
          .description("Control-plane helper commands")
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
            };
            if (opts.json) {
              console.log(JSON.stringify(payload, null, 2));
            } else {
              console.log(JSON.stringify(payload, null, 2));
            }
          });
      },
      {
        commands: ["nmc-ops", "nmc-ops health"],
      },
    );

    api.registerService({
      id: "nmc-control-plane",
      start: () => {
        server = createServer(async (req, res) => {
          const method = req.method ?? "GET";
          const url = new URL(req.url ?? "/", `http://${cfg.host}:${cfg.port}`);
          const path = url.pathname;

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

            if (method === "POST" && path === "/v1/memory/recall") {
              const body = await readJsonBody(req);
              const principal = String(body.principal ?? "").trim();
              if (!principal) {
                json(res, 400, { ok: false, error: "principal_required" });
                return;
              }
              const payload = await runOpenClawJson([
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

            if (method === "GET" && path === "/v1/memory/stats") {
              const payload = await runOpenClawJson(["nmc-mem", "stats", "--json"]);
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
              json(res, 200, {
                ok: true,
                data: {
                  status: "not_configured_in_v1",
                  note: "Heartbeat orchestration hooks are exposed via plugins/CLI and can be wired by ops policy.",
                },
              });
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

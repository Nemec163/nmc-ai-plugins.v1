import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import * as lancedb from "@lancedb/lancedb";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { parseConfig } from "./config.js";
import { parseAccessLevel, grantsForLevel, type AccessLevel, type MemoryLayer } from "./acl.js";
import { AgentRegistry } from "./registry.js";
import { provisionTemplates } from "./templates.js";
import { reconcileOpenclawConfig } from "./reconciler.js";
import { AuditLog } from "./audit.js";

const AGENT_ID_RE = /^[a-z0-9][a-z0-9_-]{1,31}$/;

type CreateSpec = {
  agent_id: string;
  display_name: string;
  access_level?: AccessLevel;
  domain_scopes?: string[];
  heartbeat_every?: string | null;
  tools_allowlist?: string[];
  actor?: string;
};

async function deleteVectorsByOwner(vectorsPath: string, owner: string): Promise<void> {
  const db = await lancedb.connect(vectorsPath);
  const tables = await db.tableNames();
  if (!tables.includes("memory_vectors")) return;
  const table = await db.openTable("memory_vectors");
  await table.delete(`owner = '${owner.replace(/'/g, "''")}'`);
}

function ensureAclTable(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS acl_grants (
      id TEXT PRIMARY KEY,
      principal TEXT NOT NULL,
      layer TEXT NOT NULL,
      scope TEXT NOT NULL,
      mode TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(principal, layer, scope, mode)
    );
  `);
  return db;
}

function upsertGrants(db: Database.Database, principal: string, level: AccessLevel, scopes: string[]) {
  const grants = grantsForLevel(level);
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO acl_grants (id, principal, layer, scope, mode, created_at)
     VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?)`,
  );

  const scopeList = [...new Set(["global", ...scopes.map((scope) => scope.trim().toLowerCase()).filter(Boolean)])];

  const tx = db.transaction(() => {
    for (const grant of grants) {
      for (const scope of scopeList) {
        stmt.run(principal, grant.layer, scope, grant.mode, Date.now());
      }
    }
  });
  tx();
}

function deleteGrants(db: Database.Database, principal: string): number {
  const res = db.prepare(`DELETE FROM acl_grants WHERE principal = ?`).run(principal);
  return res.changes;
}

function deleteFactsByOwner(dbPath: string, owner: string): number {
  const db = new Database(dbPath);
  const res = db.prepare(`DELETE FROM facts WHERE owner = ?`).run(owner);
  db.close();
  return res.changes;
}

const plugin = {
  id: "nmc-agent-lifecycle",
  name: "NMC Agent Lifecycle",
  description: "Lifecycle operations for managed agents",
  configSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      stateDir: { type: "string" },
      openclawConfigPath: { type: "string" },
      workspaceRoot: { type: "string" },
      templatesDir: { type: "string" },
      factsDbPath: { type: "string" },
      vectorsPath: { type: "string" },
    },
  },

  register(api: OpenClawPluginApi) {
    const pluginRoot = api.resolvePath(".");
    const cfg = parseConfig(api.pluginConfig, pluginRoot);

    mkdirSync(cfg.stateDir, { recursive: true });
    mkdirSync(cfg.workspaceRoot, { recursive: true });

    const registry = new AgentRegistry(cfg.stateDir);
    const audit = new AuditLog(cfg.stateDir);
    const aclDb = ensureAclTable(cfg.factsDbPath);

    async function createAgent(spec: CreateSpec) {
      if (!AGENT_ID_RE.test(spec.agent_id)) {
        return { ok: false, code: "invalid_agent_id" as const };
      }
      if (!spec.display_name || !spec.display_name.trim()) {
        return { ok: false, code: "invalid_display_name" as const };
      }

      const existing = registry.get(spec.agent_id);
      if (existing && existing.status !== "deleted") {
        return { ok: true, code: "already_exists" as const, agent: existing };
      }

      const level = parseAccessLevel(spec.access_level);
      const scopes = (spec.domain_scopes ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean);

      const workspace = join(cfg.workspaceRoot, spec.agent_id);
      const vars = {
        agent_id: spec.agent_id,
        display_name: spec.display_name,
        access_level: level,
        domain_scopes: scopes.join(", ") || "global",
        default_routines: "recall -> execute -> write lesson",
        heartbeat_every: spec.heartbeat_every ?? "0",
      };

      const written = provisionTemplates({
        templatesDir: cfg.templatesDir,
        agentWorkspace: workspace,
        vars,
      });

      upsertGrants(aclDb, spec.agent_id, level, scopes.length ? scopes : ["global"]);

      const row = registry.upsert({
        agent_id: spec.agent_id,
        display_name: spec.display_name,
        access_level: level,
        domain_scopes: scopes,
        heartbeat_every: spec.heartbeat_every ?? null,
        tools_allowlist: spec.tools_allowlist ?? [],
        status: "active",
        created_at: existing?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const reconcile = reconcileOpenclawConfig(cfg.openclawConfigPath, registry.list(true));

      audit.write({
        actor: spec.actor ?? "system",
        action: "agent.create",
        target: spec.agent_id,
        outcome: "ok",
        details: {
          access_level: level,
          domain_scopes: scopes,
          written,
          reconcile,
        },
      });

      return { ok: true, code: "created" as const, agent: row, written, reconcile };
    }

    async function deleteAgent(agentId: string, actor = "system") {
      if (!AGENT_ID_RE.test(agentId)) {
        return { ok: false, code: "invalid_agent_id" as const };
      }

      const existing = registry.get(agentId);
      if (!existing || existing.status === "deleted") {
        audit.write({
          actor,
          action: "agent.delete",
          target: agentId,
          outcome: "ok",
          details: { code: "already_deleted" },
        });
        return { ok: true, code: "already_deleted" as const };
      }

      const workspace = join(cfg.workspaceRoot, agentId);
      let removedFacts = 0;
      try {
        removedFacts = deleteFactsByOwner(cfg.factsDbPath, agentId);
      } catch {}

      let removedVectors = 0;
      try {
        await deleteVectorsByOwner(cfg.vectorsPath, agentId);
        removedVectors = 1;
      } catch {}

      const removedGrants = deleteGrants(aclDb, agentId);

      try {
        rmSync(workspace, { recursive: true, force: true });
      } catch {}

      registry.markDeleted(agentId);
      const removedRegistry = registry.delete(agentId);
      const reconcile = reconcileOpenclawConfig(cfg.openclawConfigPath, registry.list(true));

      audit.write({
        actor,
        action: "agent.delete",
        target: agentId,
        outcome: "ok",
        details: {
          removedFacts,
          removedVectors,
          removedGrants,
          removedRegistry,
          reconcile,
        },
      });

      return {
        ok: true,
        code: "deleted" as const,
        removedFacts,
        removedVectors,
        removedGrants,
      };
    }

    api.registerTool(
      {
        name: "nmc_agent_create",
        label: "NMC Agent Create",
        description: "Create managed agent with templates, ACL grants, and reconciler update.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["agent_id", "display_name"],
          properties: {
            agent_id: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]{1,31}$" },
            display_name: { type: "string", minLength: 1 },
            access_level: { type: "string" },
            domain_scopes: { type: "array", items: { type: "string" } },
            heartbeat_every: { type: ["string", "null"] },
            tools_allowlist: { type: "array", items: { type: "string" } },
            actor: { type: "string" },
          },
        },
        async execute(_toolCallId, rawParams) {
          const spec = rawParams as CreateSpec;
          const result = await createAgent(spec);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            details: result,
          };
        },
      },
      { name: "nmc_agent_create" },
    );

    api.registerTool(
      {
        name: "nmc_agent_delete",
        label: "NMC Agent Delete",
        description: "Hard-delete managed agent and cleanup all owned artifacts.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["agent_id"],
          properties: {
            agent_id: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]{1,31}$" },
            actor: { type: "string" },
            mode: { type: "string", enum: ["hard"] },
          },
        },
        async execute(_toolCallId, rawParams) {
          const params = rawParams as { agent_id: string; actor?: string; mode?: "hard" };
          const result = await deleteAgent(params.agent_id, params.actor ?? "system");
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            details: result,
          };
        },
      },
      { name: "nmc_agent_delete" },
    );

    api.registerTool(
      {
        name: "nmc_agent_list",
        label: "NMC Agent List",
        description: "List managed agents from registry.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            include_deleted: { type: "boolean" },
          },
        },
        async execute(_toolCallId, rawParams) {
          const includeDeleted = Boolean((rawParams as { include_deleted?: boolean })?.include_deleted);
          const items = registry.list(includeDeleted);
          return {
            content: [{ type: "text", text: JSON.stringify({ count: items.length, items }, null, 2) }],
            details: { count: items.length, items },
          };
        },
      },
      { name: "nmc_agent_list" },
    );

    api.registerTool(
      {
        name: "nmc_agent_set_access_level",
        label: "NMC Agent Set Access",
        description: "Update access level and reconcile grants/config for an agent.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["agent_id", "access_level"],
          properties: {
            agent_id: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]{1,31}$" },
            access_level: { type: "string" },
            actor: { type: "string" },
          },
        },
        async execute(_toolCallId, rawParams) {
          const params = rawParams as { agent_id: string; access_level: AccessLevel; actor?: string };
          const existing = registry.get(params.agent_id);
          if (!existing || existing.status === "deleted") {
            const out = { ok: false, code: "not_found" };
            return {
              content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
              details: out,
            };
          }

          const level = parseAccessLevel(params.access_level);
          deleteGrants(aclDb, params.agent_id);
          upsertGrants(aclDb, params.agent_id, level, existing.domain_scopes.length ? existing.domain_scopes : ["global"]);

          const updated = registry.upsert({
            ...existing,
            access_level: level,
            updated_at: new Date().toISOString(),
          });
          const reconcile = reconcileOpenclawConfig(cfg.openclawConfigPath, registry.list(true));

          audit.write({
            actor: params.actor ?? "system",
            action: "agent.set_access_level",
            target: params.agent_id,
            outcome: "ok",
            details: { access_level: level, reconcile },
          });

          const out = { ok: true, agent: updated, reconcile };
          return {
            content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
            details: out,
          };
        },
      },
      { name: "nmc_agent_set_access_level" },
    );

    api.registerCli(
      ({ program }) => {
        const cmd = program.command("nmc-agent").description("NMC agent lifecycle operations");

        cmd
          .command("list")
          .option("--include-deleted", "Include deleted")
          .option("--json", "JSON output")
          .action((opts: { includeDeleted?: boolean; json?: boolean }) => {
            const items = registry.list(Boolean(opts.includeDeleted));
            if (opts.json) {
              console.log(JSON.stringify({ count: items.length, items }, null, 2));
              return;
            }
            for (const row of items) {
              console.log(`${row.agent_id}\t${row.access_level}\t${row.status}`);
            }
          });

        cmd
          .command("create")
          .requiredOption("--agent-id <id>")
          .requiredOption("--display-name <name>")
          .option("--access-level <level>", "access level", "A1_worker")
          .option("--domain-scope <scope>", "repeatable scope", (value, prev: string[]) => {
            prev.push(value);
            return prev;
          }, [])
          .option("--heartbeat <every>")
          .option("--json", "JSON output")
          .action(async (opts: Record<string, unknown>) => {
            const result = await createAgent({
              agent_id: String(opts.agentId),
              display_name: String(opts.displayName),
              access_level: String(opts.accessLevel) as AccessLevel,
              domain_scopes: (opts.domainScope as string[]) ?? [],
              heartbeat_every: (opts.heartbeat as string) ?? null,
              actor: "cli",
            });
            if (opts.json) console.log(JSON.stringify(result, null, 2));
            else console.log(result.ok ? `OK ${result.code}` : `ERR ${result.code}`);
          });

        cmd
          .command("delete")
          .requiredOption("--agent-id <id>")
          .option("--mode <mode>", "hard only", "hard")
          .option("--json", "JSON output")
          .action(async (opts: Record<string, unknown>) => {
            const result = await deleteAgent(String(opts.agentId), "cli");
            if (opts.json) console.log(JSON.stringify(result, null, 2));
            else console.log(result.ok ? `OK ${result.code}` : `ERR ${result.code}`);
          });

        cmd
          .command("set-access")
          .requiredOption("--agent-id <id>")
          .requiredOption("--access-level <level>")
          .option("--json", "JSON output")
          .action((opts: Record<string, unknown>) => {
            const existing = registry.get(String(opts.agentId));
            if (!existing) {
              const out = { ok: false, code: "not_found" };
              if (opts.json) console.log(JSON.stringify(out, null, 2));
              else console.error("not_found");
              return;
            }
            const level = parseAccessLevel(String(opts.accessLevel));
            deleteGrants(aclDb, String(opts.agentId));
            upsertGrants(aclDb, String(opts.agentId), level, existing.domain_scopes.length ? existing.domain_scopes : ["global"]);
            const updated = registry.upsert({ ...existing, access_level: level, updated_at: new Date().toISOString() });
            const reconcile = reconcileOpenclawConfig(cfg.openclawConfigPath, registry.list(true));
            const out = { ok: true, agent: updated, reconcile };
            if (opts.json) console.log(JSON.stringify(out, null, 2));
            else console.log("updated");
          });

        cmd.command("doctor").option("--json", "JSON output").action((opts: { json?: boolean }) => {
          const data = {
            ok: true,
            paths: {
              registry: registry.path,
              audit: audit.getPath(),
              workspaceRoot: cfg.workspaceRoot,
              openclawConfigPath: cfg.openclawConfigPath,
              factsDbPath: cfg.factsDbPath,
            },
            agents: registry.list(true).length,
          };
          if (opts.json) console.log(JSON.stringify(data, null, 2));
          else console.log(JSON.stringify(data, null, 2));
        });
      },
      {
        commands: [
          "nmc-agent",
          "nmc-agent list",
          "nmc-agent create",
          "nmc-agent delete",
          "nmc-agent set-access",
          "nmc-agent doctor",
        ],
      },
    );

    api.registerService({
      id: "nmc-agent-lifecycle",
      start: () => {
        api.logger.info?.(`nmc-agent-lifecycle: started (registry=${registry.path})`);
      },
      stop: () => {
        aclDb.close();
      },
    });

    api.logger.info?.("nmc-agent-lifecycle: registered");
  },
};

export default plugin;

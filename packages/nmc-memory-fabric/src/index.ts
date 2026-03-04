import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { parseAccessLevel, canApprove, canPromote, canRead, canWrite, type AccessLevel, type MemoryLayer } from "./acl.js";
import { parseConfig } from "./config.js";
import { FactsStore, type ConflictResolution, type FactCategory, type DecayClass } from "./sqlite-store.js";
import { Embeddings, VectorStore } from "./vector-store.js";
import { QmdStore } from "./qmd-store.js";
import { normalizeScope, uniqBy } from "./utils.js";

type RecallResult = {
  id: string;
  text: string;
  score: number;
  layer: MemoryLayer;
  reason: string;
  citation: string;
  scope: string;
  backend: "facts" | "qmd" | "vector";
};

type HookHandler = (event: Record<string, unknown>) => Promise<unknown> | unknown;

function extractHookPrompt(event: Record<string, unknown>): string {
  if (typeof event.prompt === "string") return event.prompt;
  if (typeof event.userPrompt === "string") return event.userPrompt;
  if (typeof event.input === "string") return event.input;
  return "";
}

function parseExactRequest(query: string): { entity?: string; key?: string } {
  const compact = query.trim().match(/^([a-z0-9._-]+)[:/]([a-z0-9._-]+)$/i);
  if (compact) {
    return { entity: compact[1], key: compact[2] };
  }

  const entityMatch = query.match(/\bentity\s*[:=]\s*([a-z0-9._-]+)/i);
  const keyMatch = query.match(/\bkey\s*[:=]\s*([a-z0-9._-]+)/i);
  return {
    entity: entityMatch?.[1],
    key: keyMatch?.[1],
  };
}

const plugin = {
  id: "nmc-memory-fabric",
  name: "NMC Memory Fabric",
  description: "QMD-first memory with structured facts and vector fallback",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    const cfg = parseConfig(api.pluginConfig);

    mkdirSync(cfg.stateDir, { recursive: true });
    const factsDbPath = join(cfg.stateDir, "memory", "facts.sqlite");
    const vectorsPath = join(cfg.stateDir, "memory", "vectors");

    const facts = new FactsStore(factsDbPath);
    const vectors = new VectorStore(vectorsPath, cfg.embedding.model.includes("large") ? 3072 : 1536);
    const embeddings = new Embeddings(cfg.embedding.apiKey, cfg.embedding.model);
    const qmd = new QmdStore(cfg.qmd.paths, cfg.workspaceRoot, cfg.qmd.exclude);

    function canReadScoped(level: AccessLevel, principal: string | undefined, layer: MemoryLayer, scope: string): boolean {
      return canRead(level, layer) && facts.hasGrant(principal, layer, scope, "read");
    }

    function canWriteScoped(level: AccessLevel, principal: string | undefined, layer: MemoryLayer, scope: string): boolean {
      return canWrite(level, layer) && facts.hasGrant(principal, layer, scope, "write");
    }

    function canPromoteScoped(level: AccessLevel, principal: string | undefined, layer: MemoryLayer, scope: string): boolean {
      return canPromote(level) && facts.hasGrant(principal, layer, scope, "promote");
    }

    function resolvePrincipal(value?: string): string | undefined {
      const fromParam = value?.trim();
      if (fromParam) return fromParam;
      const fromEnv = (process.env.OPENCLAW_AGENT_ID ?? process.env.OPENCLAW_PRINCIPAL ?? "").trim();
      return fromEnv || undefined;
    }

    function requirePrincipal(value?: string): { ok: true; principal: string } | { ok: false } {
      const principal = resolvePrincipal(value);
      if (!principal) return { ok: false };
      return { ok: true, principal };
    }

    function registerCompatHook(kind: string, legacyEvent: string, handler: HookHandler): void {
      const apiLike = api as unknown as Record<string, unknown>;
      const registerHookFn = apiLike.registerHook;
      if (typeof registerHookFn === "function") {
        try {
          (registerHookFn as (hookKind: string, hookHandler: HookHandler) => unknown)(kind, handler);
          return;
        } catch (err) {
          api.logger.warn?.(`nmc-memory-fabric: registerHook(${kind}) failed, fallback to api.on: ${String(err)}`);
        }
      }
      const onFn = apiLike.on;
      if (typeof onFn === "function") {
        (onFn as (eventName: string, eventHandler: HookHandler) => unknown)(legacyEvent, handler);
      }
    }

    async function runPrune(mode: "hard" | "soft" | "both") {
      const result = facts.prune(mode);
      let vectorHardDeleted = 0;
      let vectorExpiredDeleted = 0;

      if (mode === "hard" || mode === "both") {
        if (result.hardDeletedIds.length > 0) {
          try {
            vectorHardDeleted = await vectors.deleteByIds(result.hardDeletedIds);
          } catch (err) {
            api.logger.warn?.(`nmc-memory-fabric: vector delete-by-id failed: ${String(err)}`);
          }
        }
        try {
          vectorExpiredDeleted = await vectors.pruneExpired();
        } catch (err) {
          api.logger.warn?.(`nmc-memory-fabric: vector prune-expired failed: ${String(err)}`);
        }
      }

      return {
        hardDeleted: result.hardDeleted,
        softDecayed: result.softDecayed,
        vectorHardDeleted,
        vectorExpiredDeleted,
      };
    }

    async function runRecall(input: {
      query: string;
      scope?: string;
      limit?: number;
      actorLevel?: AccessLevel;
      principal?: string;
      entity?: string;
      key?: string;
    }): Promise<RecallResult[]> {
      const level = parseAccessLevel(input.actorLevel);
      const scope = input.scope ? normalizeScope(input.scope) : undefined;
      const principalCheck = requirePrincipal(input.principal);
      if (!principalCheck.ok) return [];
      const principal = principalCheck.principal;
      const limit = Math.max(1, Math.min(input.limit ?? 5, 20));

      const requestedExact = input.entity
        ? { entity: input.entity, key: input.key }
        : parseExactRequest(input.query);

      const exactHits =
        requestedExact.entity && requestedExact.entity.trim()
          ? facts
              .exactLookup(requestedExact.entity, requestedExact.key, scope)
              .filter((hit) => canReadScoped(level, principal, hit.layer, hit.scope))
          : [];

      const factsHits = facts
        .search(input.query, scope, limit * 2)
        .filter((hit) => canReadScoped(level, principal, hit.layer, hit.scope));

      const qmdHits = cfg.qmd.enabled
        ? qmd
            .search(input.query, limit * 2)
            .filter((hit) => canReadScoped(level, principal, hit.layer, hit.scope))
        : [];

      let vectorHits: RecallResult[] = [];
      try {
        const vec = await embeddings.embed(input.query);
        const rawVectorHits = await vectors.search(vec, limit * 2, scope);
        const activeFacts = facts.activeFactRows(rawVectorHits.map((hit) => hit.id));
        vectorHits = rawVectorHits
          .map((hit) => {
            const fact = activeFacts.get(hit.id);
            if (!fact) return null;
            return {
              ...hit,
              text: fact.text,
              layer: fact.layer,
              scope: fact.scope,
            };
          })
          .filter(
            (hit): hit is RecallResult =>
              Boolean(hit) && canReadScoped(level, principal, hit.layer, hit.scope),
          );
      } catch (err) {
        api.logger.warn(`nmc-memory-fabric: vector recall failed: ${String(err)}`);
      }

      const merged = uniqBy(
        [...exactHits, ...factsHits, ...qmdHits, ...vectorHits].sort((a, b) => b.score - a.score),
        (item) => `${item.layer}:${item.scope}:${item.text.trim().toLowerCase().replace(/\s+/g, " ")}`,
      ).slice(0, limit);

      return merged;
    }

    api.registerTool(
      {
        name: "nmc_memory_recall",
        label: "NMC Memory Recall",
        description: "Recall from structured facts, QMD corpus, and semantic vectors.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["query"],
          properties: {
            query: { type: "string" },
            scope: { type: "string" },
            entity: { type: "string" },
            key: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 20 },
            actorLevel: { type: "string" },
            principal: { type: "string" },
          },
        },
        async execute(_toolCallId, rawParams) {
          const params = rawParams as {
            query: string;
            scope?: string;
            entity?: string;
            key?: string;
            limit?: number;
            actorLevel?: AccessLevel;
            principal?: string;
          };

          const principalCheck = requirePrincipal(params.principal);
          if (!principalCheck.ok) {
            return {
              content: [{ type: "text", text: "Recall denied: principal is required for ACL checks." }],
              details: { ok: false, code: "principal_required" },
            };
          }

          const results = await runRecall(params);
          return {
            content: [
              {
                type: "text",
                text:
                  results.length === 0
                    ? "No memory hits found."
                    : results
                        .map(
                          (r, i) =>
                            `${i + 1}. [${r.layer}/${r.backend}] ${r.text} (${(r.score * 100).toFixed(0)}%)\n   citation: ${r.citation}`,
                        )
                        .join("\n"),
              },
            ],
            details: {
              count: results.length,
              results,
            },
          };
        },
      },
      { name: "nmc_memory_recall" },
    );

    api.registerTool(
      {
        name: "nmc_memory_store",
        label: "NMC Memory Store",
        description: "Store structured memory entry and optional vector embedding.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["text", "layer", "principal"],
          properties: {
            text: { type: "string" },
            layer: { type: "string" },
            scope: { type: "string" },
            owner: { type: "string" },
            entity: { type: "string" },
            key: { type: "string" },
            value: { type: "string" },
            category: { type: "string" },
            source: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            decayClass: { type: "string" },
            validForSec: { type: "integer", minimum: 1 },
            actorLevel: { type: "string" },
            principal: { type: "string" },
            idempotencyKey: { type: "string" },
          },
        },
        async execute(_toolCallId, rawParams) {
          const params = rawParams as {
            text: string;
            layer: MemoryLayer;
            scope?: string;
            owner?: string;
            entity?: string;
            key?: string;
            value?: string;
            category?: FactCategory;
            source?: string;
            confidence?: number;
            decayClass?: DecayClass;
            validForSec?: number;
            actorLevel?: AccessLevel;
            principal?: string;
            idempotencyKey?: string;
          };

          const level = parseAccessLevel(params.actorLevel);
          const principalCheck = requirePrincipal(params.principal);
          if (!principalCheck.ok) {
            return {
              content: [{ type: "text", text: "Write denied: principal is required for ACL checks." }],
              details: { ok: false, code: "principal_required" },
            };
          }
          const principal = principalCheck.principal;
          const writeScope = normalizeScope(params.scope);
          if (!canWriteScoped(level, principal, params.layer, writeScope)) {
            return {
              content: [{ type: "text", text: `Write denied for ${level} on ${params.layer}.` }],
              details: { ok: false, code: "access_denied" },
            };
          }

          if (params.layer === "M4_global_facts" && level !== "A4_orchestrator_full") {
            return {
              content: [{ type: "text", text: "Direct write to M4_global_facts is forbidden. Use promotion workflow." }],
              details: { ok: false, code: "promotion_required" },
            };
          }

          const validUntil = params.validForSec ? Math.floor(Date.now() / 1000) + params.validForSec : undefined;

          const stored = facts.store({
            text: params.text,
            entity: params.entity,
            key: params.key,
            value: params.value,
            category: params.category,
            source: params.source ?? "manual",
            scope: params.scope,
            owner: params.owner ?? "system",
            layer: params.layer,
            confidence: params.confidence,
            decayClass: params.decayClass,
            validUntil,
            idempotencyKey: params.idempotencyKey,
          });

          if (stored.mutated) {
            try {
              const vector = await embeddings.embed(params.text);
              await vectors.store({
                id: stored.id,
                text: params.text,
                vector,
                layer: params.layer,
                scope: writeScope,
                owner: params.owner ?? "system",
                source: params.source ?? "manual",
                validUntil: stored.validUntil,
              });
            } catch (err) {
              api.logger.warn(`nmc-memory-fabric: vector store failed: ${String(err)}`);
            }
          }

          const conflictText = stored.conflictId ? ` conflict=${stored.conflictId}` : "";
          return {
            content: [
              {
                type: "text",
                text: stored.created
                  ? `Stored memory fact ${stored.id} in ${params.layer}.${conflictText}`
                  : stored.idempotent
                    ? `Idempotent upsert matched fact ${stored.id}.${conflictText}`
                    : `Existing fact ${stored.id} kept; conflict queued.${conflictText}`,
              },
            ],
            details: {
              ok: true,
              id: stored.id,
              created: stored.created,
              idempotent: stored.idempotent,
              mutated: stored.mutated,
              conflictId: stored.conflictId ?? null,
              validUntil: stored.validUntil,
            },
          };
        },
      },
      { name: "nmc_memory_store" },
    );

    api.registerTool(
      {
        name: "nmc_memory_promote",
        label: "NMC Memory Promote",
        description: "Create promotion request (or direct approve for orchestrator).",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["candidateId", "targetLayer", "reason"],
          properties: {
            candidateId: { type: "string" },
            targetLayer: { type: "string" },
            reason: { type: "string" },
            requestedBy: { type: "string" },
            actorLevel: { type: "string" },
            principal: { type: "string" },
          },
        },
        async execute(_toolCallId, rawParams) {
          const params = rawParams as {
            candidateId: string;
            targetLayer: MemoryLayer;
            reason: string;
            requestedBy?: string;
            actorLevel?: AccessLevel;
            principal?: string;
          };

          const level = parseAccessLevel(params.actorLevel);
          if (!canPromote(level)) {
            return {
              content: [{ type: "text", text: `Promotion denied for ${level}.` }],
              details: { ok: false, code: "access_denied" },
            };
          }

          const candidate = facts.getFact(params.candidateId);
          if (!candidate) {
            return {
              content: [{ type: "text", text: `Candidate fact ${params.candidateId} not found.` }],
              details: { ok: false, code: "not_found" },
            };
          }

          const candidateScope = normalizeScope(String(candidate.scope ?? "global"));
          const principalCheck = requirePrincipal(params.principal);
          if (!principalCheck.ok) {
            return {
              content: [{ type: "text", text: "Promotion denied: principal is required for ACL checks." }],
              details: { ok: false, code: "principal_required" },
            };
          }
          const principal = principalCheck.principal;
          if (!canPromoteScoped(level, principal, params.targetLayer, candidateScope)) {
            return {
              content: [{ type: "text", text: `Promotion denied for ${params.targetLayer} in scope ${candidateScope}.` }],
              details: { ok: false, code: "access_denied" },
            };
          }

          const status = canApprove(level) ? "approved" : "pending";
          const promotionId = facts.createPromotion({
            fromLayer: candidate.layer as MemoryLayer,
            toLayer: params.targetLayer,
            candidateId: params.candidateId,
            requestedBy: params.requestedBy ?? "unknown",
            reason: params.reason,
            status,
            reviewer: canApprove(level) ? params.requestedBy ?? "system" : null,
          });

          if (status === "approved") {
            facts.decidePromotion(promotionId, "approved", params.requestedBy ?? "system", params.reason);
          }

          return {
            content: [
              {
                type: "text",
                text: `Promotion ${promotionId} created with status ${status}.`,
              },
            ],
            details: { ok: true, promotionId, status },
          };
        },
      },
      { name: "nmc_memory_promote" },
    );

    api.registerTool(
      {
        name: "nmc_memory_promote_decide",
        label: "NMC Memory Promote Decide",
        description: "Approve/reject promotion request (A4 only).",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["promotionId", "decision", "reason"],
          properties: {
            promotionId: { type: "string" },
            decision: { type: "string", enum: ["approved", "rejected"] },
            reason: { type: "string" },
            reviewer: { type: "string" },
            actorLevel: { type: "string" },
            principal: { type: "string" },
          },
        },
        async execute(_toolCallId, rawParams) {
          const params = rawParams as {
            promotionId: string;
            decision: "approved" | "rejected";
            reason: string;
            reviewer?: string;
            actorLevel?: AccessLevel;
            principal?: string;
          };

          const level = parseAccessLevel(params.actorLevel);
          if (!canApprove(level)) {
            return {
              content: [{ type: "text", text: "Only A4_orchestrator_full can decide promotions." }],
              details: { ok: false, code: "access_denied" },
            };
          }
          const principalCheck = requirePrincipal(params.principal);
          if (!principalCheck.ok) {
            return {
              content: [{ type: "text", text: "Promotion decision denied: principal is required for ACL checks." }],
              details: { ok: false, code: "principal_required" },
            };
          }
          const principal = principalCheck.principal;
          if (!facts.hasGrant(principal, "M4_global_facts", "global", "admin")) {
            return {
              content: [{ type: "text", text: "Promotion decision denied by ACL policy." }],
              details: { ok: false, code: "access_denied" },
            };
          }

          const ok = facts.decidePromotion(
            params.promotionId,
            params.decision,
            params.reviewer ?? "orchestrator",
            params.reason,
          );

          return {
            content: [
              {
                type: "text",
                text: ok
                  ? `Promotion ${params.promotionId} marked ${params.decision}.`
                  : `Promotion ${params.promotionId} not found.`,
              },
            ],
            details: { ok, promotionId: params.promotionId, decision: params.decision },
          };
        },
      },
      { name: "nmc_memory_promote_decide" },
    );

    api.registerTool(
      {
        name: "nmc_memory_prune",
        label: "NMC Memory Prune",
        description: "Run memory prune/decay maintenance.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            mode: { type: "string", enum: ["hard", "soft", "both"] },
          },
        },
        async execute(_toolCallId, rawParams) {
          const mode = ((rawParams as { mode?: "hard" | "soft" | "both" })?.mode ?? "both") as
            | "hard"
            | "soft"
            | "both";

          const result = await runPrune(mode);
          return {
            content: [
              {
                type: "text",
                text:
                  `Prune complete: hardDeleted=${result.hardDeleted}, softDecayed=${result.softDecayed}, ` +
                  `vectorHardDeleted=${result.vectorHardDeleted}, vectorExpiredDeleted=${result.vectorExpiredDeleted}`,
              },
            ],
            details: { ok: true, ...result },
          };
        },
      },
      { name: "nmc_memory_prune" },
    );

    api.registerTool(
      {
        name: "nmc_memory_stats",
        label: "NMC Memory Stats",
        description: "Show memory layer counters and health info.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
        async execute() {
          const stats = facts.stats();
          const vectorCount = await vectors.count().catch(() => -1);
          const payload = { ...stats, vectorCount, qmdEnabled: cfg.qmd.enabled, qmdPaths: cfg.qmd.paths };

          return {
            content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
            details: payload,
          };
        },
      },
      { name: "nmc_memory_stats" },
    );

    api.registerTool(
      {
        name: "nmc_memory_conflicts",
        label: "NMC Memory Conflicts",
        description: "List pending/resolved fact conflicts detected by natural-key upsert.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 200 },
            status: { type: "string", enum: ["pending", "resolved", "all"] },
          },
        },
        async execute(_toolCallId, rawParams) {
          const params = rawParams as { limit?: number; status?: "pending" | "resolved" | "all" };
          const rows = facts.listConflicts(params.limit ?? 20, params.status ?? "pending");
          return {
            content: [{ type: "text", text: JSON.stringify({ count: rows.length, rows }, null, 2) }],
            details: { count: rows.length, rows },
          };
        },
      },
      { name: "nmc_memory_conflicts" },
    );

    api.registerTool(
      {
        name: "nmc_memory_conflict_resolve",
        label: "NMC Memory Conflict Resolve",
        description: "Mark a conflict queue item as resolved.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["conflictId"],
          properties: {
            conflictId: { type: "string" },
            resolution: { type: "string", enum: ["apply_incoming", "keep_existing"] },
          },
        },
        async execute(_toolCallId, rawParams) {
          const params = rawParams as { conflictId: string; resolution?: ConflictResolution };
          const resolved = facts.resolveConflict(params.conflictId, params.resolution ?? "apply_incoming");
          if (resolved.ok && resolved.applied && resolved.fact) {
            try {
              const vector = await embeddings.embed(resolved.fact.text);
              await vectors.store({
                id: resolved.fact.id,
                text: resolved.fact.text,
                vector,
                layer: resolved.fact.layer,
                scope: resolved.fact.scope,
                owner: resolved.fact.owner,
                source: resolved.fact.source,
                validUntil: resolved.fact.validUntil,
              });
            } catch (err) {
              api.logger.warn(`nmc-memory-fabric: vector update after conflict resolve failed: ${String(err)}`);
            }
          }
          return {
            content: [
              {
                type: "text",
                text: resolved.ok
                  ? resolved.applied
                    ? `Resolved ${params.conflictId}; canonical fact updated from incoming value.`
                    : `Resolved ${params.conflictId}; kept canonical fact unchanged.`
                  : `Conflict ${params.conflictId} not found.`,
              },
            ],
            details: { ...resolved, conflictId: params.conflictId },
          };
        },
      },
      { name: "nmc_memory_conflict_resolve" },
    );

    api.registerCli(
      ({ program }) => {
        const mem = program.command("nmc-mem").description("NMC memory fabric operations");

        mem
          .command("stats")
          .option("--json", "JSON output")
          .action(async (opts: { json?: boolean }) => {
            const stats = facts.stats();
            const vectorCount = await vectors.count().catch(() => -1);
            const payload = { ...stats, vectorCount, qmdEnabled: cfg.qmd.enabled, qmdPaths: cfg.qmd.paths };
            if (opts.json) {
              console.log(JSON.stringify(payload, null, 2));
            } else {
              console.log(`Facts: ${payload.totalFacts}`);
              console.log(`Vectors: ${payload.vectorCount}`);
              console.log(`Pending promotions: ${payload.pendingPromotions}`);
              console.log(`Pending conflicts: ${payload.pendingConflicts}`);
              console.log(`By layer: ${JSON.stringify(payload.byLayer)}`);
            }
          });

        mem
          .command("recall")
          .argument("<query>")
          .option("--scope <scope>")
          .option("--entity <entity>")
          .option("--key <key>")
          .option("--limit <limit>", "result limit", "5")
          .option("--actor-level <level>", "access level", "A1_worker")
          .option("--principal <principal>", "acl principal")
          .option("--json", "JSON output")
          .action(async (query: string, opts: { scope?: string; entity?: string; key?: string; limit?: string; actorLevel?: string; principal?: string; json?: boolean }) => {
            const principalCheck = requirePrincipal(opts.principal);
            if (!principalCheck.ok) {
              const payload = { ok: false, code: "principal_required" };
              if (opts.json) console.log(JSON.stringify(payload, null, 2));
              else console.error("principal_required");
              return;
            }
            const results = await runRecall({
              query,
              scope: opts.scope,
              entity: opts.entity,
              key: opts.key,
              limit: Number(opts.limit ?? "5"),
              actorLevel: parseAccessLevel(opts.actorLevel),
              principal: principalCheck.principal,
            });
            if (opts.json) {
              console.log(JSON.stringify({ count: results.length, results }, null, 2));
            } else {
              for (const [idx, hit] of results.entries()) {
                console.log(`${idx + 1}. [${hit.layer}/${hit.backend}] ${hit.text}`);
                console.log(`   ${hit.citation}`);
              }
            }
          });

        mem
          .command("store")
          .requiredOption("--text <text>")
          .requiredOption("--layer <layer>")
          .option("--scope <scope>", "scope", "global")
          .option("--owner <owner>", "owner", "system")
          .option("--category <category>", "category", "other")
          .option("--source <source>", "source", "cli")
          .option("--actor-level <level>", "access level", "A1_worker")
          .option("--principal <principal>", "acl principal")
          .option("--idempotency-key <key>", "idempotency key")
          .option("--json", "JSON output")
          .action(async (opts: Record<string, string | boolean>) => {
            const layer = String(opts.layer) as MemoryLayer;
            const level = parseAccessLevel(String(opts.actorLevel ?? "A1_worker"));
            const principalCheck = requirePrincipal(
              opts.principal ? String(opts.principal) : undefined,
            );
            if (!principalCheck.ok) {
              const payload = { ok: false, code: "principal_required" };
              if (opts.json) console.log(JSON.stringify(payload, null, 2));
              else console.error("principal_required");
              return;
            }
            const principal = principalCheck.principal;
            const scope = normalizeScope(String(opts.scope ?? "global"));
            if (!canWriteScoped(level, principal, layer, scope)) {
              const payload = { ok: false, code: "access_denied" };
              if (opts.json) console.log(JSON.stringify(payload, null, 2));
              else console.error("Access denied");
              return;
            }

            const out = facts.store({
              text: String(opts.text),
              layer,
              scope,
              owner: String(opts.owner ?? "system"),
              category: String(opts.category ?? "other") as FactCategory,
              source: String(opts.source ?? "cli"),
              idempotencyKey: opts.idempotencyKey ? String(opts.idempotencyKey) : undefined,
            });

            if (out.mutated) {
              try {
                const vector = await embeddings.embed(String(opts.text));
                await vectors.store({
                  id: out.id,
                  text: String(opts.text),
                  vector,
                  layer,
                  scope,
                  owner: String(opts.owner ?? "system"),
                  source: String(opts.source ?? "cli"),
                  validUntil: out.validUntil,
                });
              } catch {}
            }

            const payload = { ok: true, ...out };
            if (opts.json) console.log(JSON.stringify(payload, null, 2));
            else console.log(out.created ? `Stored ${out.id}` : `Upserted ${out.id}`);
          });

        mem
          .command("promote")
          .requiredOption("--candidate-id <id>")
          .requiredOption("--target-layer <layer>")
          .requiredOption("--reason <reason>")
          .option("--requested-by <who>", "requester", "cli")
          .option("--actor-level <level>", "access level", "A2_domain_builder")
          .option("--principal <principal>", "acl principal")
          .option("--json", "JSON output")
          .action((opts: Record<string, string | boolean>) => {
            const level = parseAccessLevel(String(opts.actorLevel ?? "A2_domain_builder"));
            const candidate = facts.getFact(String(opts.candidateId));
            if (!candidate) {
              const payload = { ok: false, code: "not_found" };
              if (opts.json) console.log(JSON.stringify(payload, null, 2));
              else console.error("Candidate not found");
              return;
            }
            const principalCheck = requirePrincipal(
              opts.principal ? String(opts.principal) : undefined,
            );
            if (!principalCheck.ok) {
              const payload = { ok: false, code: "principal_required" };
              if (opts.json) console.log(JSON.stringify(payload, null, 2));
              else console.error("principal_required");
              return;
            }
            const principal = principalCheck.principal;
            const targetLayer = String(opts.targetLayer) as MemoryLayer;
            const candidateScope = normalizeScope(String(candidate.scope ?? "global"));
            if (!canPromoteScoped(level, principal, targetLayer, candidateScope)) {
              const payload = { ok: false, code: "access_denied" };
              if (opts.json) console.log(JSON.stringify(payload, null, 2));
              else console.error("Access denied");
              return;
            }
            const status = canApprove(level) ? "approved" : "pending";
            const promotionId = facts.createPromotion({
              fromLayer: candidate.layer as MemoryLayer,
              toLayer: targetLayer,
              candidateId: String(opts.candidateId),
              requestedBy: String(opts.requestedBy ?? "cli"),
              reason: String(opts.reason),
              status,
              reviewer: canApprove(level) ? String(opts.requestedBy ?? "cli") : null,
            });

            if (status === "approved") {
              facts.decidePromotion(promotionId, "approved", String(opts.requestedBy ?? "cli"), String(opts.reason));
            }

            const payload = { ok: true, promotionId, status };
            if (opts.json) console.log(JSON.stringify(payload, null, 2));
            else console.log(`Promotion ${promotionId} (${status})`);
          });

        mem
          .command("decide")
          .requiredOption("--promotion-id <id>")
          .requiredOption("--decision <decision>")
          .requiredOption("--reason <reason>")
          .option("--reviewer <reviewer>", "reviewer", "orchestrator")
          .option("--actor-level <level>", "access level", "A4_orchestrator_full")
          .option("--principal <principal>", "acl principal")
          .option("--json", "JSON output")
          .action((opts: Record<string, string | boolean>) => {
            const level = parseAccessLevel(String(opts.actorLevel ?? "A4_orchestrator_full"));
            if (!canApprove(level)) {
              const payload = { ok: false, code: "access_denied" };
              if (opts.json) console.log(JSON.stringify(payload, null, 2));
              else console.error("Only A4 can decide promotions");
              return;
            }
            const principalCheck = requirePrincipal(
              opts.principal ? String(opts.principal) : undefined,
            );
            if (!principalCheck.ok) {
              const payload = { ok: false, code: "principal_required" };
              if (opts.json) console.log(JSON.stringify(payload, null, 2));
              else console.error("principal_required");
              return;
            }
            const principal = principalCheck.principal;
            if (!facts.hasGrant(principal, "M4_global_facts", "global", "admin")) {
              const payload = { ok: false, code: "access_denied" };
              if (opts.json) console.log(JSON.stringify(payload, null, 2));
              else console.error("Access denied");
              return;
            }

            const ok = facts.decidePromotion(
              String(opts.promotionId),
              String(opts.decision) as "approved" | "rejected",
              String(opts.reviewer ?? "orchestrator"),
              String(opts.reason),
            );
            const payload = { ok };
            if (opts.json) console.log(JSON.stringify(payload, null, 2));
            else console.log(ok ? "Updated" : "Promotion not found");
          });

        mem
          .command("prune")
          .option("--mode <mode>", "hard|soft|both", "both")
          .option("--json", "JSON output")
          .action(async (opts: { mode?: "hard" | "soft" | "both"; json?: boolean }) => {
            const out = await runPrune(opts.mode ?? "both");
            if (opts.json) console.log(JSON.stringify({ ok: true, ...out }, null, 2));
            else
              console.log(
                `hardDeleted=${out.hardDeleted}, softDecayed=${out.softDecayed}, ` +
                  `vectorHardDeleted=${out.vectorHardDeleted}, vectorExpiredDeleted=${out.vectorExpiredDeleted}`,
              );
          });

        mem
          .command("conflicts")
          .option("--limit <limit>", "max rows", "20")
          .option("--status <status>", "pending|resolved|all", "pending")
          .option("--json", "JSON output")
          .action((opts: { limit?: string; status?: "pending" | "resolved" | "all"; json?: boolean }) => {
            const rows = facts.listConflicts(Number(opts.limit ?? "20"), opts.status ?? "pending");
            const payload = { count: rows.length, rows };
            if (opts.json) console.log(JSON.stringify(payload, null, 2));
            else console.log(JSON.stringify(payload, null, 2));
          });

        mem
          .command("resolve-conflict")
          .requiredOption("--id <id>")
          .option("--resolution <resolution>", "apply_incoming|keep_existing", "apply_incoming")
          .option("--json", "JSON output")
          .action(async (opts: { id: string; resolution?: ConflictResolution; json?: boolean }) => {
            const result = facts.resolveConflict(opts.id, opts.resolution ?? "apply_incoming");
            if (result.ok && result.applied && result.fact) {
              try {
                const vector = await embeddings.embed(result.fact.text);
                await vectors.store({
                  id: result.fact.id,
                  text: result.fact.text,
                  vector,
                  layer: result.fact.layer,
                  scope: result.fact.scope,
                  owner: result.fact.owner,
                  source: result.fact.source,
                  validUntil: result.fact.validUntil,
                });
              } catch {}
            }
            const payload = { ...result, id: opts.id };
            if (opts.json) console.log(JSON.stringify(payload, null, 2));
            else console.log(result.ok ? (result.applied ? "resolved_applied" : "resolved_kept") : "not_found");
          });

        mem.command("doctor").option("--json", "JSON output").action(async (opts: { json?: boolean }) => {
          const dbStats = facts.stats();
          const vectorCount = await vectors.count().catch(() => -1);
          const payload = {
            ok: true,
            checks: {
              factsDb: dbStats,
              vectors: vectorCount,
              qmd: { enabled: cfg.qmd.enabled, paths: cfg.qmd.paths.length },
              embeddingModel: cfg.embedding.model,
            },
          };
          if (opts.json) console.log(JSON.stringify(payload, null, 2));
          else console.log(JSON.stringify(payload, null, 2));
        });
      },
      {
        commands: [
          "nmc-mem",
          "nmc-mem stats",
          "nmc-mem recall",
          "nmc-mem store",
          "nmc-mem promote",
          "nmc-mem decide",
          "nmc-mem prune",
          "nmc-mem conflicts",
          "nmc-mem resolve-conflict",
          "nmc-mem doctor",
        ],
      },
    );

    if (cfg.autoRecall) {
      registerCompatHook("session.prompt.addendum", "before_agent_start", async (event) => {
        const prompt = extractHookPrompt(event);
        if (!prompt || prompt.length < 4) {
          return;
        }
        const hits = await runRecall({ query: prompt, limit: 5, actorLevel: "A4_orchestrator_full" });
        if (!hits.length) return;
        const text = hits.map((h) => `- [${h.layer}/${h.backend}] ${h.text} (${h.citation})`).join("\n");
        const addendum = `<nmc-memory>\n${text}\n</nmc-memory>`;
        return {
          addendum,
          prependContext: addendum,
          text: addendum,
        };
      });
    }

    if (cfg.autoCapture) {
      registerCompatHook("agent.post_run", "agent_end", async (event) => {
        const success = event.success !== false;
        const messageLike = event.messages ?? event.outputMessages ?? event.output ?? null;
        if (!success || !messageLike) return;
        const candidates: string[] = [];

        const messages = Array.isArray(messageLike) ? messageLike : [messageLike];
        for (const msg of messages) {
          if (!msg || typeof msg !== "object") continue;
          const m = msg as Record<string, unknown>;
          const content = m.content;
          if (typeof content === "string") {
            candidates.push(content);
            continue;
          }
          if (!Array.isArray(content)) continue;
          for (const block of content) {
            if (!block || typeof block !== "object") continue;
            const b = block as Record<string, unknown>;
            if (b.type === "text" && typeof b.text === "string") {
              candidates.push(b.text);
            }
          }
        }

        const filtered = candidates
          .map((t) => t.trim())
          .filter((t) => t.length >= 20 && t.length <= 400)
          .filter((t) => /\b(decide|decision|remember|always|never|prefer|because|chosen|choose)\b/i.test(t))
          .slice(0, 3);

        for (const text of filtered) {
          const category: FactCategory = /\b(decide|decision|chosen|choose|because)\b/i.test(text)
            ? "decision"
            : /\b(prefer)\b/i.test(text)
              ? "preference"
              : "fact";
          const decayClass: DecayClass =
            category === "decision"
              ? "permanent"
              : category === "preference"
                ? "stable"
                : "active";

          const storeOut = facts.store({
            text,
            category,
            layer: "M1_local",
            source: "auto_capture",
            scope: "global",
            owner: "session",
            confidence: 0.75,
            decayClass,
            idempotencyKey: `auto_capture:${text.slice(0, 80).toLowerCase()}`,
          });

          if (storeOut.mutated) {
            try {
              const vector = await embeddings.embed(text);
              await vectors.store({
                id: storeOut.id,
                text,
                vector,
                layer: "M1_local",
                scope: "global",
                owner: "session",
                source: "auto_capture",
                validUntil: storeOut.validUntil,
              });
            } catch {}
          }
        }
      });
    }

    let pruneTimer: ReturnType<typeof setInterval> | null = null;
    let nightlyTimer: ReturnType<typeof setInterval> | null = null;

    api.registerService({
      id: "nmc-memory-fabric",
      start: () => {
        api.logger.info?.(`nmc-memory-fabric: started (db=${factsDbPath}, vectors=${vectorsPath})`);
        const runNightlyBackfill = () => {
          try {
            const created = facts.createNightlyBackfillPromotions(100);
            if (created > 0) {
              api.logger.info?.(`nmc-memory-fabric: nightly backfill queued promotions=${created}`);
            }
          } catch (err) {
            api.logger.warn?.(`nmc-memory-fabric: nightly backfill failed ${String(err)}`);
          }
        };

        pruneTimer = setInterval(() => {
          void (async () => {
            try {
              const out = await runPrune("both");
              if (
                out.hardDeleted > 0 ||
                out.softDecayed > 0 ||
                out.vectorHardDeleted > 0 ||
                out.vectorExpiredDeleted > 0
              ) {
                api.logger.info?.(
                  `nmc-memory-fabric: prune hard=${out.hardDeleted} soft=${out.softDecayed} ` +
                    `vectorHard=${out.vectorHardDeleted} vectorExpired=${out.vectorExpiredDeleted}`,
                );
              }
            } catch (err) {
              api.logger.warn?.(`nmc-memory-fabric: prune failed ${String(err)}`);
            }
          })();
        }, 60 * 60_000);

        runNightlyBackfill();
        nightlyTimer = setInterval(runNightlyBackfill, 24 * 60 * 60_000);
      },
      stop: () => {
        if (pruneTimer) clearInterval(pruneTimer);
        if (nightlyTimer) clearInterval(nightlyTimer);
        facts.close();
      },
    });

    api.logger.info?.("nmc-memory-fabric: registered");
  },
};

export default plugin;

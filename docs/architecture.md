# Architecture

## Memory fabric

1. Structured facts (`facts.sqlite`, FTS5) is the exact truth layer.
2. QMD corpus is the shared narrative retrieval layer.
3. Vector store provides semantic fallback.
4. Recall cascade is deterministic:
   - facts exact/fts
   - qmd text retrieval
   - vector semantic
   - merge + dedup + rerank + citations
5. Recall is ACL-gated by `principal` and can be layer-scoped to avoid loading irrelevant context.
6. Auto-recall uses bounded context budget and explicit layer allowlist.
7. Auto-recall enforces score threshold + max items so agents do not over-load context.
8. Startup ACL bootstrap seeds baseline grants for `system:auto-recall` and admin principal.
9. Memory quality telemetry (`nmc-mem quality`) tracks staleness/expiry/conflict pressure for UI and ops.
10. Default recall path is narrow-first (`M1_local -> M2_domain -> M4_global_facts`), with `M3_shared` as explicit expansion layer.
11. Conflict queue (`fact_conflicts`) prevents noisy overwrites for the same natural key and supports manual resolve.
12. Recall planning is explicit (`nmc-mem plan` / `/v1/memory/plan`) so agents can choose layers before loading memory snippets.
13. Principal access bootstrap is explicit (`nmc-mem bootstrap` / `/v1/memory/bootstrap`) so UI/agents can apply ACL-aware layer routing and context budget defaults before recall.
14. Principal grant inventory is explicit (`nmc-mem principals` / `/v1/memory/principals`) so admin UI can render ACL coverage without scanning full memory content.
15. Principal memory catalog is explicit (`nmc-mem catalog` / `/v1/memory/catalog`) so agents can orient by visible layers/counters before any recall.
16. Principal grant CRUD handles are explicit (`nmc-mem grants|grant-set|grant-delete` / `/v1/memory/grants`) so admin UI can perform manual ACL tuning.
17. Quality endpoint is explicit (`nmc-mem quality` / `/v1/memory/quality`) so admin UI can monitor drift pressure without running ad-hoc SQL.

## Multi-agent best practice

- Keep most agents at `A1`/`A2`; reserve `A3`/`A4` for operators and orchestrators.
- Require explicit `principal` for recall/store/promote/decide flows.
- Treat `M4_global_facts` as curated memory only via promotion workflow.
- Keep context tight: layer filters + small limits first, then controlled expansion.
- Keep quality high: track `nmc-mem quality` and keep conflict queue near zero.
- Use control-plane admin endpoints for observability (`/v1/memory/stats`, `/v1/memory/quality`, `/v1/memory/layers`, `/v1/memory/bootstrap`, `/v1/memory/catalog`, `/v1/memory/conflicts`, `/v1/heartbeat/state`).

## Lifecycle

- Registry SoT: `~/.openclaw/nmc-ai-plugins/registry/agents.json`
- Reconciler updates runtime config idempotently.
- Create provisions templates + ACL grants, including principal-isolated scope (`agent:<id>`) grants.
- Delete performs hard cleanup across workspace/facts/vectors/grants/config.

## Access model

- `A0_isolated`
- `A1_worker`
- `A2_domain_builder`
- `A3_system_operator`
- `A4_orchestrator_full`

Layers:

- `M0_core`, `M1_local`, `M2_domain`, `M3_shared`, `M4_global_facts`, `M5_audit_ops`

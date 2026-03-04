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
7. Default recall path is narrow-first (`M1_local -> M2_domain -> M4_global_facts`), with `M3_shared` as explicit expansion layer.
8. Conflict queue (`fact_conflicts`) prevents noisy overwrites for the same natural key and supports manual resolve.
9. Recall planning is explicit (`nmc-mem plan` / `/v1/memory/plan`) so agents can choose layers before loading memory snippets.
10. Principal access bootstrap is explicit (`nmc-mem access-profile` / `/v1/memory/access-profile`) so UI/agents can apply ACL-aware layer routing and context budget defaults before recall.
11. Principal grant inventory is explicit (`nmc-mem principals` / `/v1/memory/principals`) so admin UI can render ACL coverage without scanning full memory content.
12. Principal memory catalog is explicit (`nmc-mem catalog` / `/v1/memory/catalog`) so agents can orient by visible layers/counters before any recall.

## Multi-agent best practice

- Keep most agents at `A1`/`A2`; reserve `A3`/`A4` for operators and orchestrators.
- Require explicit `principal` for recall/store/promote/decide flows.
- Treat `M4_global_facts` as curated memory only via promotion workflow.
- Keep context tight: layer filters + small limits first, then controlled expansion.
- Use control-plane admin endpoints for observability (`/v1/memory/stats`, `/v1/memory/layers`, `/v1/memory/access-profile`, `/v1/memory/catalog`, `/v1/memory/conflicts`).

## Lifecycle

- Registry SoT: `~/.openclaw/nmc-ai-plugins/registry/agents.json`
- Reconciler updates runtime config idempotently.
- Create provisions templates + ACL grants.
- Delete performs hard cleanup across workspace/facts/vectors/grants/config.

## Access model

- `A0_isolated`
- `A1_worker`
- `A2_domain_builder`
- `A3_system_operator`
- `A4_orchestrator_full`

Layers:

- `M0_core`, `M1_local`, `M2_domain`, `M3_shared`, `M4_global_facts`, `M5_audit_ops`

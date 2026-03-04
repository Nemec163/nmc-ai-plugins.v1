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

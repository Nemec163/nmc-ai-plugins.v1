---
name: memory-curator
description: Curate long-term memory quality by running recall checks, promotion workflow, and prune/decay maintenance. Use when memory drift, duplicate facts, stale entries, or promotion decisions must be handled.
metadata: {"openclaw":{"requires":{"config":["plugins.entries.nmc-memory-fabric.enabled"],"anyBins":["openclaw"]}}}
---

# Memory Curator

## Workflow

1. Inspect memory health and layer distribution.
2. Inspect principal memory catalog before recall expansion.
3. Run targeted recall for task context.
4. Promote stable facts into `M4_global_facts` through the workflow.
5. Execute prune and verify resulting counters.

## Commands

- Stats/doctor: `scripts/memory_health.sh`
- Quality only (manual): `openclaw nmc-mem quality --json`
- Catalog (manual): `openclaw nmc-mem catalog --principal <id> --actor-level A2_domain_builder --query "<query>" --json`
- Grants (manual): `openclaw nmc-mem grants --principal <id> --target <id> --actor-level A3_system_operator --json`
- Promote candidate: `scripts/promote_fact.sh`
- Decide promotion: `scripts/decide_promotion.sh`
- Prune: `scripts/prune_memory.sh`
- Conflicts (manual queue): `openclaw nmc-mem conflicts --status pending --principal <id> --actor-level A3_system_operator --json`
- Resolve conflict: `openclaw nmc-mem resolve-conflict --id <conflict-id> --principal <id> --actor-level A4_orchestrator_full --json`

Use a stable principal for ACL-aware commands:
- Example: `NMC_PRINCIPAL=orchestrator scripts/promote_fact.sh <id> "reason" A3_system_operator`

## Rules

- Avoid direct writes to `M4_global_facts` for non-orchestrator actors.
- Require explicit rationale for every promotion.
- Prefer small, deterministic updates over bulk writes.
- Prefer targeted recall by scope/layer instead of broad retrieval.
- Keep context lean: recall with explicit `--layer` and low `--limit` first, expand only if recall is insufficient.

## References

Read [`references/promotion-policy.md`](references/promotion-policy.md) for quality gates.

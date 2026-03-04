---
name: memory-curator
description: Curate long-term memory quality by running recall checks, promotion workflow, and prune/decay maintenance. Use when memory drift, duplicate facts, stale entries, or promotion decisions must be handled.
metadata: {"openclaw":{"requires":{"config":["plugins.entries.nmc-memory-fabric.enabled"]}}}
---

# Memory Curator

## Workflow

1. Inspect memory health and layer distribution.
2. Run targeted recall for task context.
3. Promote stable facts into `M4_global_facts` through the workflow.
4. Execute prune and verify resulting counters.

## Commands

- Stats/doctor: `scripts/memory_health.sh`
- Promote candidate: `scripts/promote_fact.sh`
- Decide promotion: `scripts/decide_promotion.sh`
- Prune: `scripts/prune_memory.sh`

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

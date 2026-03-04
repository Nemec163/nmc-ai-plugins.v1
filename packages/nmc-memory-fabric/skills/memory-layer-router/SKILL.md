---
name: memory-layer-router
description: Route recall/store actions through the right memory layers with minimal context usage. Use when deciding which layer(s) to query, when applying scoped recall, or when avoiding broad context injection.
metadata: {"openclaw":{"requires":{"config":["plugins.entries.nmc-memory-fabric.enabled"]}}}
---

# Memory Layer Router

## Workflow

1. Start recall from the narrowest layer set that can answer the question.
2. Use explicit layer filters before increasing result limits.
3. Escalate to broader layers only when the narrow search is insufficient.
4. Store new memory in the lowest valid layer; use promotion flow for `M4_global_facts`.
5. Keep injected context budget small and evidence-based (citations only, no full logs).

## Layer-first recall patterns

- Local task state: `M1_local`
- Domain work context: `M2_domain`
- Cross-agent operational context: `M3_shared`
- Stable global facts/decisions: `M4_global_facts`

## Commands

- Tool: `nmc_memory_plan` (plan layers before retrieval)
- Tool: `nmc_memory_access_profile` (principal ACL + suggested budget)
- Tool: `nmc_memory_principals` (ACL principal inventory for operators/admin UI)
- Tool: `nmc_memory_recall` with `layers`
- Tool: `nmc_memory_layers` (inspect layer guide)
- CLI: `openclaw nmc-mem plan "<query>" --scope <scope> --actor-level A1_worker --json`
- CLI: `openclaw nmc-mem access-profile --principal <id> --actor-level A2_domain_builder --json`
- CLI: `openclaw nmc-mem principals --principal <id> --actor-level A3_system_operator --json`
- CLI: `openclaw nmc-mem recall "<query>" --principal <id> --layer M2_domain --layer M4_global_facts --json`
- CLI: `openclaw nmc-mem layers --json`

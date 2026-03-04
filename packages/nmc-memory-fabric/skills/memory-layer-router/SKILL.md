---
name: memory-layer-router
description: Route recall/store actions through the right memory layers with minimal context usage. Use when deciding which layer(s) to query, when applying scoped recall, or when avoiding broad context injection.
---

# Memory Layer Router

## Workflow

1. Start recall from the narrowest layer set that can answer the question.
2. Use explicit layer filters before increasing result limits.
3. Escalate to broader layers only when the narrow search is insufficient.
4. Store new memory in the lowest valid layer; use promotion flow for `M4_global_facts`.

## Layer-first recall patterns

- Local task state: `M1_local`
- Domain work context: `M2_domain`
- Cross-agent operational context: `M3_shared`
- Stable global facts/decisions: `M4_global_facts`

## Commands

- Tool: `nmc_memory_recall` with `layers`
- Tool: `nmc_memory_layers` (inspect layer guide)
- CLI: `openclaw nmc-mem recall "<query>" --principal <id> --layer M2_domain --layer M4_global_facts --json`
- CLI: `openclaw nmc-mem layers --json`

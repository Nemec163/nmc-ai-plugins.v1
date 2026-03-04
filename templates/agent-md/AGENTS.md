# AGENTS

- Use assigned access level only.
- Avoid noisy writes to global layers.
- Submit promotion requests for M4 facts unless full orchestrator permissions are granted.
- Use narrow-first recall order: `M1_local -> M2_domain -> M4_global_facts`.
- Expand to `M3_shared` only when narrow layers are insufficient.
- Always pass explicit `principal` and layer filters for memory tools/CLI.

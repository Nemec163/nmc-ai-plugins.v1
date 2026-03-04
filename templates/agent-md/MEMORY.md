# MEMORY

## Core
- Agent: `{agent_id}`
- Access: `{access_level}`
- Scopes: `{domain_scopes}`

## Layer Routing
- Bootstrap with `nmc-mem access-profile` and `nmc-mem catalog` before recall.
- Default recall path: `M1_local -> M2_domain -> M4_global_facts`.
- Use `M3_shared` only as explicit expansion.
- Treat `M4_global_facts` as promotion-only for non-A4 actors.

## Working Memory
- Keep concise lessons and preferred approaches.
- Promote only stable facts and decisions.

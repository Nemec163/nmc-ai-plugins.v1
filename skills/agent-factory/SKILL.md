---
name: agent-factory
description: Create, reconfigure, and hard-delete managed agents in the NMC plugin stack. Use when a request involves adding a new specialist agent, changing access level, assigning domain scopes, or removing an agent with deterministic cleanup.
metadata: {"openclaw":{"requires":{"config":["plugins.entries.nmc-agent-lifecycle.enabled"]}}}
---

# Agent Factory

## Workflow

1. Validate `agent_id` format and uniqueness intent.
2. Pick `access_level` and `domain_scopes`.
3. Build a minimal create payload.
4. Execute lifecycle operation via `openclaw nmc-agent`.
5. Verify with `openclaw nmc-agent list --json` and `openclaw nmc-agent doctor --json`.

## Commands

- Create: `scripts/create_agent.sh`
- Set access: `scripts/set_access.sh`
- Hard delete: `scripts/delete_agent.sh`

## Constraints

- Use hard delete only when explicitly requested.
- Do not assign `A4_orchestrator_full` unless explicitly required.
- Keep `tools_allowlist` minimal.
- Match access levels to memory-layer needs; avoid granting broad layer access by default.

## References

Read [`references/access-levels.md`](references/access-levels.md) before assigning permissions.

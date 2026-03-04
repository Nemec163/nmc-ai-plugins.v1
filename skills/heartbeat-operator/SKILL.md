---
name: heartbeat-operator
description: Run proactive heartbeat operations for agent/task continuity. Use when periodic checks, stale-task detection, and operational nudges are required around kanban/cron workflows.
---

# Heartbeat Operator

## Workflow

1. Check control-plane health.
2. Check managed agents list and status.
3. Trigger memory hygiene pass when needed.
4. Emit concise operational report.

## Commands

- Health: `scripts/ops_health.sh`
- Cycle: `scripts/heartbeat_cycle.sh`

## Guardrails

- Do not mutate agent lifecycle unless requested.
- Keep operations idempotent.
- Record only actionable deltas.

## References

See [`references/heartbeat-routine.md`](references/heartbeat-routine.md).

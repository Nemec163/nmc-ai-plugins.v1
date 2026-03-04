---
name: heartbeat-operator
description: Run proactive heartbeat operations for agent/task continuity. Use when periodic checks, stale-task detection, and operational nudges are required around kanban/cron workflows.
metadata: {"openclaw":{"requires":{"config":["plugins.entries.nmc-control-plane.enabled"],"anyBins":["openclaw"]}}}
---

# Heartbeat Operator

## Workflow

1. Check control-plane health.
2. Read heartbeat state (agents + memory quality pressure).
3. Trigger memory hygiene pass when quality pressure rises.
4. Emit concise operational report.

## Commands

- Health: `scripts/ops_health.sh [principal] [actor_level]`
- Cycle: `scripts/heartbeat_cycle.sh [principal] [actor_level]`
- API heartbeat: `GET /v1/heartbeat/state?principal=<id>&actor_level=<level>`
- Memory quality: `openclaw nmc-mem quality --json`

## Guardrails

- Do not mutate agent lifecycle unless requested.
- Keep operations idempotent.
- Record only actionable deltas.
- For memory checks, query narrow layers first and avoid broad context dumps.

## References

See [`references/heartbeat-routine.md`](references/heartbeat-routine.md).

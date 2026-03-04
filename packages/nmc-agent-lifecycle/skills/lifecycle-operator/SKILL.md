---
name: lifecycle-operator
description: Operate agent lifecycle workflows with deterministic ACL and cleanup guarantees. Use when creating agents, changing access level, reconciling config, or deleting agents with full teardown.
metadata: {"openclaw":{"requires":{"config":["plugins.entries.nmc-agent-lifecycle.enabled"],"anyBins":["openclaw"]}}}
---

# Lifecycle Operator

## Workflow

1. Validate requested `agent_id`, access level, and domain scopes.
2. Create or update the agent via lifecycle tools.
3. Verify registry/config reconciliation and ACL grants.
4. For deletion, use hard-delete and confirm facts/vectors/grants cleanup.

## Commands

- `openclaw nmc-agent create --agent-id <id> --display-name "<name>" --access-level A1_worker --json`
- `openclaw nmc-agent set-access --agent-id <id> --access-level A2_domain_builder --json`
- `openclaw nmc-agent delete --agent-id <id> --mode hard --json`
- `openclaw nmc-agent doctor --json`

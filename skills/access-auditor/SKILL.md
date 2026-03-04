---
name: access-auditor
description: Audit memory access levels and grant consistency for managed agents. Use when validating ACL policy, detecting drift, or reviewing whether an agent is over-privileged.
metadata: {"openclaw":{"requires":{"config":["plugins.entries.nmc-agent-lifecycle.enabled","plugins.entries.nmc-memory-fabric.enabled"],"anyBins":["openclaw"]}}}
---

# Access Auditor

## Workflow

1. List active agents and their access levels.
2. Verify each assignment against expected operational scope.
3. Flag over-privileged or under-privileged agents.
4. Propose minimal access correction.

## Commands

- Snapshot: `scripts/access_snapshot.sh`
- Compare: `scripts/access_check.sh`
- Principals inventory: `openclaw nmc-mem principals --principal <id> --actor-level A3_system_operator --json`
- Principal grants: `openclaw nmc-mem grants --principal <id> --target <id> --actor-level A3_system_operator --json`

## Policy

- Default to least privilege.
- Escalate only if required by concrete task capability.
- Prefer `A1`/`A2` for domain specialists.
- Validate that memory-layer grants are narrower than or equal to operational scope.

## References

Read [`references/acl-baseline.md`](references/acl-baseline.md).

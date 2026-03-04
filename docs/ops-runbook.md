# Ops runbook

## Health checks

```bash
openclaw nmc-mem doctor --json
openclaw nmc-agent doctor --json
openclaw nmc-ops health --json
```

## Common workflows

### Create agent

```bash
openclaw nmc-agent create \
  --agent-id trader-01 \
  --display-name "Trader 01" \
  --access-level A2_domain_builder \
  --domain-scope finance \
  --json
```

### Hard delete agent

```bash
openclaw nmc-agent delete --agent-id trader-01 --mode hard --json
```

### Recall

```bash
openclaw nmc-mem recall "portfolio rebalance decision" --scope finance --json
```

### Promote fact candidate

```bash
openclaw nmc-mem promote \
  --candidate-id <fact-id> \
  --target-layer M4_global_facts \
  --reason "stable cross-agent decision" \
  --actor-level A2_domain_builder \
  --json
```

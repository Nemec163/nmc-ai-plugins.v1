# Ops runbook

## Health checks

```bash
openclaw nmc-mem doctor --json
openclaw nmc-agent doctor --json
openclaw nmc-ops health --json
npm run audit:openclaw
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
openclaw nmc-mem plan "portfolio rebalance decision" \
  --scope finance \
  --actor-level A2_domain_builder \
  --json

openclaw nmc-mem recall "portfolio rebalance decision" \
  --scope finance \
  --layer M2_domain \
  --layer M4_global_facts \
  --principal trader-01 \
  --json
```

### Inspect layer routing defaults

```bash
openclaw nmc-mem layers --json
```

### Inspect principal access profile (UI bootstrap contract)

```bash
openclaw nmc-mem access-profile \
  --principal trader-01 \
  --actor-level A2_domain_builder \
  --scope finance \
  --query "portfolio recall" \
  --json
```

### Inspect principal ACL inventory (admin UI list)

```bash
openclaw nmc-mem principals \
  --principal orchestrator \
  --actor-level A3_system_operator \
  --limit 500 \
  --json
```

### Inspect and resolve memory conflicts

```bash
openclaw nmc-mem conflicts --status pending --limit 20 --actor-level A3_system_operator --principal orchestrator --json
openclaw nmc-mem resolve-conflict --id <conflict-id> --resolution apply_incoming --actor-level A4_orchestrator_full --principal orchestrator --json
```

### Promote fact candidate

```bash
openclaw nmc-mem promote \
  --candidate-id <fact-id> \
  --target-layer M4_global_facts \
  --reason "stable cross-agent decision" \
  --actor-level A2_domain_builder \
  --principal orchestrator \
  --json
```

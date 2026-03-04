# Heartbeat routine

Cadence recommendations:

1. Every 10-15 minutes: `nmc-ops heartbeat` + memory quality check.
2. Hourly: prune memory (`nmc-mem prune --mode both`) and re-check quality.
3. Daily: promotion queue review.

Output contract:

- status
- anomalies
- metrics (`pendingConflicts`, `pendingPromotions`, `staleFacts30d`, `expiringIn24h`)
- next actions

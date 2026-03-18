# memory-os-gateway

In-process SDK and CLI for Memory OS read, bootstrap, query, status, verify, health, and safe write orchestration operations.

Current v1 surface:

- `readRecord` / `read_record`
- `getProjection` / `get_projection`
- `getCanonicalCurrent` / `get_canonical_current`
- `getRoleBundle` / `get_role_bundle`
- `bootstrap`
- `query`
- `getStatus` / `status`
- `verify`
- `getHealth` / `health`
- `getOpsSnapshot` / `inspectOps`
- `propose`
- `feedback`
- `completeJob` / `complete_job`

CLI entrypoint:

```sh
node packages/memory-os-gateway/bin/memory-os-gateway.js status --memory-root /path/to/memory
```

Temporary Phase 2.5 ops harness:

- `ops-snapshot` exposes read-only proposal, job, conflict, lock, status, verify, degraded-mode, and current projection visibility
- the snapshot is explicitly migration-scoped and disposable ahead of a future `control-plane` package
- the harness only inspects gateway-backed state and canon projections; it does not lease jobs, approve writes, or mutate canon

Write orchestration stays non-authoritative in this slice:

- `propose` stores structured proposal payloads under `intake/proposals/`
- `feedback` merges curator decisions and materializes `intake/pending/YYYY-MM-DD.md` when the batch is fully reviewed
- `complete-job` writes a non-canonical job receipt under `intake/jobs/` and exposes the single-writer lock scaffold and promotion request for the legacy apply path without writing canon directly

See [Memory OS Roadmap](../../docs/memory-os-roadmap.md) for the extraction plan and phase sequencing.

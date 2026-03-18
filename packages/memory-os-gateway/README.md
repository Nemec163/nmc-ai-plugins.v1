# memory-os-gateway

In-process SDK and CLI for Memory OS read, bootstrap, query, status, verify, health, and safe write orchestration operations.

Current v1 surface:

- `readRecord` / `read_record`
- `getProjection` / `get_projection`
- `getCanonicalCurrent` / `get_canonical_current`
- `getRoleBundle` / `get_role_bundle`
- `bootstrap`
- `query`
- `getRuntimeDelta` / `get_runtime_delta`
- `getRuntimeRecallBundle` / `get_runtime_recall_bundle`
- `getRecallBundle` / `get_recall_bundle`
- `captureRuntime` / `capture_runtime`
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

Shadow runtime stays separate from canon in this slice:

- `captureRuntime` writes shadow-mode runtime artifacts under `runtime/shadow/`
- `getRuntimeDelta` exposes the non-authoritative runtime layer separately from canonical current
- `getRuntimeRecallBundle` exposes scored runtime recall hits without widening authority
- `getRecallBundle` composes canonical current, optional role bundle/query context, and runtime recall for orchestration consumers
- `status` reports runtime shadow counts without widening into canon mutation or orchestration ownership

See [Memory OS Roadmap](../../docs/memory-os-roadmap.md) for the extraction plan and phase sequencing.

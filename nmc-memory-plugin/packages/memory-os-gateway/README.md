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
- `propose`
- `feedback`
- `completeJob` / `complete_job`

CLI entrypoint:

```sh
node packages/memory-os-gateway/bin/memory-os-gateway.js status --memory-root /path/to/memory
```

Installed-artifact wrapper:

```sh
node ~/.openclaw/extensions/nmc-memory-plugin/bin/memory-os-gateway.js status --memory-root /path/to/memory
```

Temporary Phase 2.5 ops harness:

- the deprecated gateway ops bridge has been retired from this shipped mirror as well
- the supported Phase 6 operator surface lives in `packages/control-plane`
- this shipped `nmc-memory-plugin` mirror does not export `getOpsSnapshot` / `inspectOps` from `require('memory-os-gateway')` or `require('memory-os-gateway/ops')`
- the compatibility shell exposes stable installed-artifact wrapper paths at `bin/memory-os-gateway.js` and `memory-os-gateway/`
- operators should use `memory-control-plane snapshot|queues|health|analytics|audits|runtime-inspector`

Current cutover note:

- the post-freeze migration-release cutover and repo-local bridge retirement sequence are tracked in [../../../docs/deliberate-migration-release-plan.md](../../../docs/deliberate-migration-release-plan.md)

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

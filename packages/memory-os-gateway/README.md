# memory-os-gateway

In-process SDK and CLI for Memory OS read, bootstrap, query, status, verify, health, and safe write orchestration operations.

Current v1 surface:

- `readRecord` / `read_record`
- `getProjection` / `get_projection`
- `getCanonicalCurrent` / `get_canonical_current`
- `buildReadIndex` / `build_read_index`
- `readReadIndex` / `read_read_index`
- `verifyReadIndex` / `verify_read_index`
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

Temporary Phase 2.5 ops harness:

- the deprecated gateway ops bridge has been retired from the root `memory-os-gateway` package surface
- the supported operator surface lives in `packages/control-plane`
- installed artifacts should continue to use `packages/control-plane`
- `memory-os-gateway` now exposes only the supported read, bootstrap, query, runtime, status, verify, health, and safe write-orchestration surfaces

Current cutover note:

- the post-freeze migration-release cutover and repo-local bridge retirement sequence are tracked in [../../docs/deliberate-migration-release-plan.md](../../docs/deliberate-migration-release-plan.md)

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

Derived read index stays rebuildable and non-authoritative in this slice:

- `buildReadIndex` materializes `core/meta/read-index.json` from canon only
- `verifyReadIndex` reports whether a persisted index is fresh against current canon checksums
- `query` prefers the persisted index when it is fresh and otherwise rebuilds an ephemeral in-memory index without changing canon

Retrieval semantics stay bounded and explainable in this slice:

- `query` returns weighted ranking reasons for canonical hits and keeps pending runtime delta explicit instead of blending it into canonical results
- `getRecallBundle` separates `canonicalRecall`, `pendingRecall`, and `runtimeRecall`, then exposes normalized `topHits` over those bounded sources

See [Memory OS Roadmap](../../docs/memory-os-roadmap.md) for the extraction plan and phase sequencing.

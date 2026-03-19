# memory-os-gateway

In-process SDK and CLI for Memory OS read, bootstrap, query, status, verify, health, and safe write orchestration operations.

Surface status: `production` programmatic surface. Installed artifacts should
prefer the adapter-owned wrapper paths instead of nested `packages/` paths.

Current v1 surface:

- `readRecord` / `read_record`
- `getProjection` / `get_projection`
- `getCanonicalCurrent` / `get_canonical_current`
- `listProcedures` / `list_procedures`
- `inspectProcedure` / `inspect_procedure`
- `compareProcedureVersions` / `compare_procedure_versions`
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
- procedure-oriented proposal claims may carry `target_type: "procedure"`, `procedure_key`, `acceptance`, and `feedback_refs` so runtime feedback can move through the existing reviewed promotion path instead of bypassing canon

Shadow runtime stays separate from canon in this slice:

- `captureRuntime` writes shadow-mode runtime artifacts under `runtime/shadow/`
- `getRuntimeDelta` exposes the non-authoritative runtime layer separately from canonical current
- `getRuntimeRecallBundle` exposes scored runtime recall hits without widening authority
- `getRecallBundle` composes canonical current, optional role bundle/query context, and runtime recall for orchestration consumers
- `status` reports runtime shadow counts without widening into canon mutation or orchestration ownership
- runtime summary refreshes now persist digest-backed non-authoritative receipts beside the runtime manifest so operators can inspect reconcile provenance without widening authority

Derived read index stays rebuildable and non-authoritative in this slice:

- `buildReadIndex` materializes `core/meta/read-index.json` from canon only
- `verifyReadIndex` reports whether a persisted index is fresh against current canon checksums
- `query` prefers the persisted index when it is fresh and otherwise rebuilds an ephemeral in-memory index without changing canon
- persisted read-index build/verify actions now emit digest-backed receipts that `status`, `verify`, and operator surfaces can inspect without treating the index as authoritative

Verification provenance stays inspectable and non-authoritative in this slice:

- `verify` persists a digest-backed receipt for canon manifest/graph refreshes under `core/meta/verify-receipt.json`
- `status` exposes receipt summaries for canon verify, read-index activity, and runtime-summary reconciliation under `verificationProvenance`
- control-plane snapshot inherits those receipt/provenance views through the supported gateway/operator surfaces

Retrieval semantics stay bounded and explainable in this slice:

- `query` returns weighted ranking reasons for canonical hits and keeps pending runtime delta explicit instead of blending it into canonical results
- `getRecallBundle` separates `canonicalRecall`, `pendingRecall`, and `runtimeRecall`, then exposes normalized `topHits` over those bounded sources

Procedure inspection stays canonical and read-only in this slice:

- `listProcedures` exposes version-aware canonical procedure lineage grouped by `procedure_key` and role
- `inspectProcedure` returns the canonical version history plus diff-safe views over metadata, acceptance criteria, feedback references, and body lines
- `compareProcedureVersions` emits a structured diff between two canonical procedure versions without introducing a rollback writer or runtime authority
- the gateway CLI now exposes `list-procedures`, `inspect-procedure`, and `compare-procedure-versions` for operator-facing inspection paths

See [Memory OS Roadmap](../../docs/legacy/memory-os-roadmap.md) for the extraction plan and phase sequencing.

# control-plane

Read-only operator surface for Memory OS over stable gateway, runtime, and maintainer contracts.

Surface status: `production` read-only operator surface.

Current surface:

- `getControlPlaneSnapshot` / `snapshot`
- `getControlPlaneHealth` / `health`
- `getControlPlaneAnalytics` / `analytics`
- `getControlPlaneAudits` / `audits`
- `getControlPlaneQueues` / `queues`
- `getControlPlaneInterventions` / `interventions`
- `getControlPlaneRuntimeInspector` / `runtime-inspector`
- `recordControlPlaneIntervention`

CLI entrypoint:

```sh
node packages/control-plane/bin/memory-control-plane.js snapshot \
  --memory-root /path/to/system/memory \
  --system-root /path/to/system
```

Current CLI commands:

- `snapshot`
- `health`
- `queues`
- `analytics`
- `audit`
- `audits`
- `interventions`
- `runtime-inspector`
- `record-intervention`

Queue and manual intervention entrypoints:

```sh
node packages/control-plane/bin/memory-control-plane.js queues \
  --memory-root /path/to/system/memory

node packages/control-plane/bin/memory-control-plane.js record-intervention \
  --memory-root /path/to/system/memory \
  --action request-handoff-reconcile \
  --target-kind conflict \
  --conflict-code orphan-job \
  --note "Inspect orphan receipt before re-handoff"

node packages/control-plane/bin/memory-control-plane.js analytics \
  --memory-root /path/to/system/memory \
  --today 2026-03-19

node packages/control-plane/bin/memory-control-plane.js audits \
  --memory-root /path/to/system/memory \
  --audit-limit 25

node packages/control-plane/bin/memory-control-plane.js runtime-inspector \
  --memory-root /path/to/system/memory \
  --runtime-stale-after-days 3
```

Control-plane v3 stays intentionally careful:

- operator visibility only
- runtime remains explicitly non-authoritative
- maintainer policy ownership stays in `@nmc/memory-maintainer`
- scheduler, queue policy, and canon promotion authority stay outside this package
- manual interventions are stored as advisory receipts under `runtime/shadow/control-plane/interventions/`
- manual interventions never mutate canon, proposal receipts, or job receipts directly
- analytics and audit surfaces summarize queue, intervention, lock, and runtime history without becoming source-of-truth
- runtime inspection stays a read-only view over `runtime/shadow/` and preserves the runtime freshness boundary
- `snapshot` and `health` emit release-qualification metadata that marks `control-plane` as the supported operator surface, `memoryos-app` as the supported standalone app surface, and `adapter-openclaw` as the supported OpenClaw connector surface
- the same release-qualification metadata carries a package matrix for the current product boundary so consumers can inspect which packages are `production`, `bounded`, or `internal`
- the same release qualification records `nmc-memory-plugin` as a retired legacy shell rather than an active production surface
- `snapshot.gateway.procedures` now carries the canonical procedure catalog so operators can inspect lineage/version state without implying control-plane ownership of promotion or rollback

Packaging note:

- when the OpenClaw adapter is installed directly, the supported installed-artifact CLI entrypoint is `node ~/.openclaw/extensions/memoryos-openclaw/bin/memory-control-plane.js <command> ...`
- the supported installed-artifact programmatic wrapper is `~/.openclaw/extensions/memoryos-openclaw/control-plane/`
- installed-artifact automation should prefer that adapter-owned wrapper over nested `packages/control-plane/bin/` paths

Compatibility note:

- the deprecated `memory-os-gateway` ops snapshot bridge is retired from package surfaces
- the supported operator queue, audit, analytics, and runtime inspection contract now lives in `control-plane`
- the historical cutover plan is preserved in [../../docs/legacy/deliberate-migration-release-plan.md](../../docs/legacy/deliberate-migration-release-plan.md)

See [supported surfaces](../../docs/supported-surfaces.md) for the current
package matrix and [implementation guide](../../docs/legacy/implementation-guide.md)
for installation and day-2 operations.

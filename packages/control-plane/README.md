# control-plane

Read-only operator surface for Memory OS over stable gateway, runtime, and maintainer contracts.

Current control-plane v3 surface:

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
- `snapshot` and `health` now emit release-qualification metadata that marks `control-plane` as the supported migration-release operator surface and `nmc-memory-plugin` as the compatibility shell
- that release qualification also records that `nmc-memory-plugin` remains the current production install/setup shell and that direct installation of `adapter-openclaw` is not supported in this slice
- the same release qualification now enumerates the remaining retirement prerequisites for any future direct-install cutover away from `nmc-memory-plugin`

Packaging note:

- when the compatibility shell is shipped through `nmc-memory-plugin`, the supported operator surface is bundled under `nmc-memory-plugin/packages/control-plane/`
- the packaged CLI entrypoint is `node ~/.openclaw/extensions/nmc-memory-plugin/packages/control-plane/bin/memory-control-plane.js <command> ...`

Compatibility note:

- the deprecated `memory-os-gateway` ops snapshot bridge is retired from package surfaces
- the supported operator queue, audit, analytics, and runtime inspection contract now lives in `control-plane`
- the current post-freeze cutover and repo-local bridge retirement sequence are tracked in [../../docs/deliberate-migration-release-plan.md](../../docs/deliberate-migration-release-plan.md)

See [Memory OS Roadmap](../../docs/memory-os-roadmap.md) for the extraction plan.

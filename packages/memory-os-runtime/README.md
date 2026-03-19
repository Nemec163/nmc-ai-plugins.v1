# memory-os-runtime

Shadow-mode runtime store for non-canonical Memory OS artifacts.

Surface status: `internal` shared core package inside the product boundary. It
is not a direct install, operator, or bounded connector surface.

Current v1 surface:

- `captureShadowRuntime`
- `getRuntimeDelta`
- `getRuntimeRecallBundle`
- `listRuntimeRecords`
- layout helpers for runtime shadow paths

The runtime store stays:

- non-authoritative
- disposable
- rebuildable from canon plus captured runtime inputs
- isolated from canon writes

See [Memory OS Roadmap](../../docs/legacy/memory-os-roadmap.md) for the extraction plan.

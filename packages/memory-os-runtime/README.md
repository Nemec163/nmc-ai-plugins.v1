# memory-os-runtime

Shadow-mode runtime store for non-canonical Memory OS artifacts.

Current v1 surface:

- `captureShadowRuntime`
- `getRuntimeDelta`
- `listRuntimeRecords`
- layout helpers for runtime shadow paths

The runtime store stays:

- non-authoritative
- disposable
- rebuildable from canon plus captured runtime inputs
- isolated from canon writes

See [Memory OS Roadmap](../../docs/memory-os-roadmap.md) for the extraction plan.

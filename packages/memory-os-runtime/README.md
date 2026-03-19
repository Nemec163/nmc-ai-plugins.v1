# memory-os-runtime

Shadow-mode runtime store for non-canonical Memory OS artifacts.

Surface status: `internal` shared core package inside the product boundary. It
is not a direct install, operator, or adapter surface.

Current surface:

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

Boundaries:

- runtime artifacts live under `runtime/shadow/`
- runtime does not become a second truth layer
- promotion into canon still goes through gateway handoff and the canon write boundary

See [Memory OS Roadmap](../../docs/legacy/memory-os-roadmap.md) for the
migration history.

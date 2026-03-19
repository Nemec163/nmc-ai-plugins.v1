# Release Readiness

This document defines the current go/no-go gate for the production OpenClaw
surface of `MemoryOS.v1`.

## Production Scope

The current production scope is intentionally narrow:

- `packages/adapter-openclaw`: production install/setup surface
- `packages/control-plane`: production read-only operator surface
- `packages/memory-os-gateway`: production programmatic surface

The following packages are not part of the current production launch posture:

- `packages/adapter-codex`: bounded connector surface
- `packages/adapter-claude`: bounded connector surface
- shared `@nmc/*` packages plus `memory-os-runtime`: internal product-boundary
  packages rather than direct install or operator surfaces

Use [supported-surfaces.md](./supported-surfaces.md) for the authoritative
package matrix and support classes.

## Go / No-Go Criteria

Call the current repository production-ready only when all of the following are
true:

1. Supported-surface docs stay aligned with release qualification metadata.
2. `openclaw memoryos setup`, auto-bootstrap behavior, and `openclaw.plugin.json`
   remain unchanged.
3. The managed workspace layout under `system/` remains unchanged.
4. Runtime remains non-authoritative and cannot write canon directly.
5. Canon writes stay behind the single promotion path.
6. The contract and integration baselines are green.
7. The production-readiness gate is green.

## Production Gate

Run the production gate from the repository root:

```bash
./tests/run-production-readiness.sh
```

That gate verifies:

- required release-facing docs exist and root references point at live paths
- `control-plane` release qualification and supported-surface fixtures are green
- the full contract baseline via `./tests/run-contract-tests.sh`
- the full integration baseline via `./tests/run-integration.sh`

## Fast Manual Checks

For a release candidate, these manual spot checks are still worth doing after
the automated gate is green:

- install the packed `adapter-openclaw` artifact in a temp OpenClaw project
- run `openclaw memoryos setup`
- confirm the managed workspace appears under `system/`
- run `memory-control-plane snapshot`
- run `memory-os-gateway status`
- run `memory-verify` and `memory-status` against the scaffolded memory root

## Release Record

When a release candidate is cut, record:

- commit SHA
- date
- gate command output summary
- any manual verification notes
- rollback note pointing at the previous known-good artifact

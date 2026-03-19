# Release Readiness

This document defines the current go/no-go gate for the production
`MemoryOS.v1` repository.

## Production Scope

`MemoryOS.v1` remains an independent, connector-agnostic memory system. Its
product boundary is the core package set plus the stable gateway and operator
surfaces. Connectors attach to that core; they do not define the product
boundary.

- `@nmc/memory-contracts`, `@nmc/memory-ingest`, `@nmc/memory-canon`,
  `@nmc/memory-maintainer`, `@nmc/memory-workspace`, `@nmc/memory-agents`,
  `@nmc/memory-pipeline`, and `memory-os-runtime`: independent MemoryOS core
- `packages/memoryos-app`: production standalone install/run surface
- `packages/memory-os-gateway`: production programmatic surface
- `packages/control-plane`: production read-only operator surface
- `packages/adapter-openclaw`, `packages/adapter-codex`, and `packages/adapter-claude`: production peer adapter surfaces with host-specific runner/bootstrap contracts

Use [supported-surfaces.md](./supported-surfaces.md) for the authoritative
package matrix and support classes.

## Go / No-Go Criteria

Call the current repository production-ready only when all of the following are
true:

1. Supported-surface docs stay aligned with release qualification metadata.
2. The independent MemoryOS core remains the product boundary and is not
   reframed as an OpenClaw-owned release.
3. The managed workspace layout under `system/` remains unchanged.
4. Runtime remains non-authoritative and cannot write canon directly.
5. Canon writes stay behind the single promotion path.
6. The supported standalone app path works without OpenClaw while preserving the
   existing `system/` layout, canon boundaries, and app-owned `memoryos run`
   host loop.
7. Each supported adapter surface preserves only its LLM- or host-specific
   contract without becoming the product boundary or a privileged adapter
   class.
8. The OpenClaw adapter keeps `openclaw memoryos setup`, auto-bootstrap
   behavior, and `openclaw.plugin.json` intact as host-specific integration
   details, not as a higher-order install/setup surface than the other peer
   adapters.
9. The contract and integration baselines are green.
10. The production-readiness gate is green.

## Production Gate

Run the production gate from the repository root:

```bash
./tests/run-production-readiness.sh
```

That gate verifies:

- required release-facing docs exist and root references point at live paths
- the release-facing docs keep `MemoryOS.v1` framed as an independent core
  product with peer adapter surfaces
- `control-plane` release qualification and supported-surface fixtures are green
- the full contract baseline via `./tests/run-contract-tests.sh`
- the full integration baseline via `./tests/run-integration.sh`

## Fast Manual Checks

For a release candidate, these manual spot checks are still worth doing after
the automated gate is green:

- install the packed `adapter-openclaw` artifact in a temp OpenClaw project
- run `PATH="/usr/local/bin:$PATH" node ./packages/adapter-codex/test/validate-fixtures.js`
- run `PATH="/usr/local/bin:$PATH" node ./packages/adapter-claude/test/validate-fixtures.js`
- run `node ./packages/memoryos-app/bin/memoryos.js init`
- run `node ./packages/memoryos-app/bin/memoryos.js run --phase verify --once`
- run `node ./packages/memoryos-app/bin/memoryos.js status`
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

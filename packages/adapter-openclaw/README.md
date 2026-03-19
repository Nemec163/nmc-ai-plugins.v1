# adapter-openclaw

Supported OpenClaw adapter package for MemoryOS.v1.

Surface status: `production` OpenClaw adapter surface. It is a peer adapter
over the same MemoryOS core. Its OpenClaw-specific bootstrap, plugin, skill,
and wrapper behavior are host integration details, not a different class of
adapter surface from `adapter-codex` or `adapter-claude`.

Current responsibilities:

- `openclaw.plugin.json`, `plugin.js`, and `package.json#openclaw` as
  OpenClaw-specific host integration assets
- plugin runtime registration and service bootstrap wiring
- setup CLI parsing and execution
- pipeline phase invocation descriptors for `extract` and `curate`, plus the compatibility `memory-apply` Phase C wrapper
- runtime-backed orchestration helpers that consume recall bundles through `memory-os-gateway`
- bundled OpenClaw skill assets and `SKILL.md` packaging
- `openclaw.json` mutation and managed bindings
- managed `memorySearch.extraPaths` registration
- gateway-backed scaffold bootstrap for the OpenClaw host

Runtime-backed orchestration surface:

- `getOpenClawOrchestrationContext(options)` resolves role bundle, gateway recall bundle, and maintainer contract paths for one OpenClaw role
- `getOpenClawRecallBundle(options)` is a convenience alias for the orchestration context when the caller only needs recall-oriented intake
- `createOpenClawOrchestrationAdapter()` exposes thin orchestration methods over stable gateway boundaries
- `proposeOpenClawResults()`, `recordOpenClawFeedback()`, and `completeOpenClawHandoff()` keep proposal, review, and completion flow on the gateway handoff path without writing canon directly

The orchestration context stays explicitly non-authoritative:

- canonical current comes from the gateway recall bundle
- runtime recall is labeled non-authoritative through the freshness boundary
- maintainer references point at `system/tasks`, `system/policy`, and `system/scripts` instead of reintroducing adapter-owned tasking rules

This package is the OpenClaw peer adapter for MemoryOS.v1. When targeting the
OpenClaw host, install it with `openclaw plugins install ./packages/adapter-openclaw`
and run setup with `openclaw memoryos setup`.

Packed adapter artifacts also bundle the installed-artifact wrapper paths for
`control-plane/`, `memory-os-gateway/`, `bin/memory-control-plane.js`, and
`bin/memory-os-gateway.js` so operator and gateway entrypoints remain available
after extract without a monorepo workspace layout.

Published package exports:

- `.` for the adapter entrypoint
- `./plugin` and `./register` for the OpenClaw plugin/runtime hooks
- `./setup` and `./setup-cli` for managed setup
- `./runtime-orchestration` for bounded orchestration helpers
- `./pipeline-adapter`, `./install-surface`, and `./conformance-adapter` for
  integration and test surfaces

This package is one of the repository's three supported peer adapters.

See [supported surfaces](../../docs/supported-surfaces.md) for the current
package matrix and [implementation guide](../../docs/legacy/implementation-guide.md)
for installation and day-2 operations.

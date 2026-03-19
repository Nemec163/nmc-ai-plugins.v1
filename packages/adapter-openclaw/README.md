# adapter-openclaw

Supported OpenClaw adapter package for MemoryOS.v1.

Surface status: `production` direct-install and setup surface for OpenClaw. It
also owns the installed-artifact wrapper entrypoints for `control-plane` and
`memory-os-gateway`.

Current responsibilities:

- plugin runtime registration and service bootstrap wiring
- setup CLI parsing and execution
- pipeline phase invocation descriptors for `extract`, `curate`, and transitional `apply`
- runtime-backed orchestration helpers that consume recall bundles through `memory-os-gateway`
- bundled OpenClaw skill assets and `SKILL.md` packaging
- `openclaw.json` mutation and managed bindings
- managed `memorySearch.extraPaths` registration
- gateway-backed scaffold bootstrap for direct OpenClaw installs

Runtime-backed orchestration surface:

- `getOpenClawOrchestrationContext(options)` resolves role bundle, gateway recall bundle, and maintainer contract paths for one OpenClaw role
- `getOpenClawRecallBundle(options)` is a convenience alias for the orchestration context when the caller only needs recall-oriented intake
- `createOpenClawOrchestrationAdapter()` exposes thin orchestration methods over stable gateway boundaries
- `proposeOpenClawResults()`, `recordOpenClawFeedback()`, and `completeOpenClawHandoff()` keep proposal, review, and completion flow on the gateway handoff path without writing canon directly

The orchestration context stays explicitly non-authoritative:

- canonical current comes from the gateway recall bundle
- runtime recall is labeled non-authoritative through the freshness boundary
- maintainer references point at `system/tasks`, `system/policy`, and `system/scripts` instead of reintroducing adapter-owned tasking rules

This package is the supported OpenClaw install/setup surface for MemoryOS.v1.
Install it directly with `openclaw plugins install ./packages/adapter-openclaw`
and run setup with `openclaw memoryos setup`.

Packed adapter artifacts also bundle the installed-artifact wrapper paths for
`control-plane/`, `memory-os-gateway/`, `bin/memory-control-plane.js`, and
`bin/memory-os-gateway.js` so operator and gateway entrypoints remain available
after extract without a monorepo workspace layout.

The legacy `nmc-memory-plugin/` shell is retired. This package is the only
supported OpenClaw install/setup surface in the repository.

See [Memory OS Roadmap](../../docs/legacy/memory-os-roadmap.md) for the extraction plan.

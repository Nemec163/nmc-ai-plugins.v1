# adapter-openclaw

OpenClaw-specific adapter package for the Memory OS migration.

Current responsibilities:

- plugin runtime registration and service bootstrap wiring
- setup CLI parsing and execution
- pipeline phase invocation descriptors for `extract`, `curate`, and transitional `apply`
- runtime-backed orchestration helpers that consume recall bundles through `memory-os-gateway`
- bundled OpenClaw skill assets and `SKILL.md` packaging
- `openclaw.json` mutation and managed bindings
- managed `memorySearch.extraPaths` registration
- gateway-backed scaffold bootstrap for the compatibility plugin

Runtime-backed orchestration surface:

- `getOpenClawOrchestrationContext(options)` resolves role bundle, gateway recall bundle, and maintainer contract paths for one OpenClaw role
- `getOpenClawRecallBundle(options)` is a convenience alias for the orchestration context when the caller only needs recall-oriented intake
- `createOpenClawOrchestrationAdapter()` exposes thin orchestration methods over stable gateway boundaries
- `proposeOpenClawResults()`, `recordOpenClawFeedback()`, and `completeOpenClawHandoff()` keep proposal, review, and completion flow on the gateway handoff path without writing canon directly

The orchestration context stays explicitly non-authoritative:

- canonical current comes from the gateway recall bundle
- runtime recall is labeled non-authoritative through the freshness boundary
- maintainer references point at `system/tasks`, `system/policy`, and `system/scripts` instead of reintroducing adapter-owned tasking rules

The compatibility shell remains in `nmc-memory-plugin/`, but OpenClaw-specific
logic and bundled skill assets should live here. `nmc-memory-plugin/skills/`
remains the compatibility discovery surface for live installs.

See [Memory OS Roadmap](../../docs/memory-os-roadmap.md) for the extraction plan.

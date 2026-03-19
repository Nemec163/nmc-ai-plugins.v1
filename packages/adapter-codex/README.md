# adapter-codex

Codex-facing adapter over `memory-os-gateway` as a peer connector surface over the same MemoryOS core.

Surface status: `bounded` connector surface. It is a supported narrow Codex
integration package, but it is not the repository's production install/setup
surface.

Current bounded scope:

- role-aware bootstrap for a single Codex role workspace
- role bundle intake for a bounded stateless run
- canon-safe read and write-orchestration operations through the gateway
- a single-thread execution helper for read-only operations plus an explicit handoff helper that uploads reviewed results and completes at the promoter handoff boundary
- shared adapter conformance coverage for the claimed read and write-orchestration capabilities
- `./conformance-adapter` as the exported test surface for the shared
  capability harness

This package intentionally does not mutate `openclaw.json`, bundle OpenClaw skills, lease maintainer jobs, or write canon directly.

See [supported surfaces](../../docs/supported-surfaces.md) for the current
package matrix.

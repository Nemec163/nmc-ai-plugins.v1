# adapter-codex

Codex-facing adapter over `memory-os-gateway` as a peer connector surface over the same MemoryOS core.

Surface status: `production` Codex adapter surface. It is a supported peer
adapter package over the same MemoryOS core, with Codex-specific runner and
handoff behavior rather than OpenClaw-specific install/setup responsibilities.

Current scope:

- role-aware bootstrap for a single Codex role workspace
- connector-neutral pipeline adapter support for `extract` and `curate`
  through a package-local Codex phase runner
- role bundle intake for a bounded stateless run
- canon-safe read and write-orchestration operations through the gateway
- a single-thread execution helper for read-only operations plus an explicit handoff helper that uploads reviewed results and completes at the promoter handoff boundary
- shared adapter conformance coverage for the claimed read and write-orchestration capabilities
- `./pipeline-adapter` as the exported pipeline surface for shared
  `@nmc/memory-pipeline` execution
- `./conformance-adapter` as the exported test surface for the shared
  capability harness

The Codex phase runner bootstraps the role workspace, follows the MemoryOS
runbook for Phase A or Phase B, and hands prompt execution to an adapter-owned
runner command over stdin without widening into direct canon writes.

This package intentionally does not mutate `openclaw.json`, bundle OpenClaw
skills, lease maintainer jobs, or write canon directly. Those responsibilities
belong to the OpenClaw adapter, not to the shared adapter contract.

See [supported surfaces](../../docs/supported-surfaces.md) for the current
package matrix.

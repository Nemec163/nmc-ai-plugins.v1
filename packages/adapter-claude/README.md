# adapter-claude

Claude-facing adapter over `memory-os-gateway`.

Surface status: `production` Claude adapter surface. It is a supported peer
adapter package over the same MemoryOS core, with Claude-specific runner and
handoff behavior instead of OpenClaw plugin glue or standalone app bootstrap
responsibilities.

Supported scope:

- role-aware bootstrap for a bounded Claude workspace
- connector-neutral pipeline adapter support for `extract` and `curate`
  through a package-local Claude phase runner
- role bundle intake for a Claude session
- canon-safe read and write-orchestration operations through the gateway
- a bounded session helper for read-only operations plus an explicit handoff helper that uploads reviewed results and completes at the promoter handoff boundary
- shared adapter conformance coverage for the claimed capabilities
- `./pipeline-adapter` as the exported pipeline surface for shared
  `@nmc/memory-pipeline` execution
- `./conformance-adapter` as the exported test surface for the shared
  capability harness

The Claude phase runner bootstraps the role workspace, follows the MemoryOS
runbook for Phase A or Phase B, and hands prompt execution to an adapter-owned
runner command over stdin without widening into direct canon writes.

This package intentionally does not mutate `openclaw.json`, own workspace-wide
setup, lease maintainer jobs, or write canon directly. Those behaviors are
host-specific concerns, not part of the shared peer-adapter contract.

See [supported surfaces](../../docs/supported-surfaces.md) for the current
package matrix.

# adapter-claude

Claude-facing bounded adapter over `memory-os-gateway`.

Current scope for the `adapter-claude runtime contract` slice:

- role-aware bootstrap for a bounded Claude workspace
- role bundle intake for a Claude session
- canon-safe read and write-orchestration operations through the gateway
- a bounded session helper for read-only operations plus an explicit handoff helper that uploads reviewed results and completes at the promoter handoff boundary
- shared adapter conformance coverage for the claimed capabilities

This package intentionally does not mutate `openclaw.json`, own workspace-wide
setup, lease maintainer jobs, or write canon directly.

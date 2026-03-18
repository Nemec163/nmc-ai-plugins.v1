# adapter-codex

Codex-facing adapter over `memory-os-gateway` for the first non-OpenClaw execution path.

Current scope for Phase 4 / PR 4.2:

- role-aware bootstrap for a single Codex role workspace
- role bundle intake for a bounded stateless run
- canon-safe read and write-orchestration operations through the gateway
- a single-thread execution helper for read-only operations plus an explicit handoff helper that uploads reviewed results and completes at the promoter handoff boundary
- shared adapter conformance coverage for the claimed read and write-orchestration capabilities

This package intentionally does not mutate `openclaw.json`, bundle OpenClaw skills, lease maintainer jobs, or write canon directly.

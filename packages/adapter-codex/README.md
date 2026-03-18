# adapter-codex

Codex-facing adapter over `memory-os-gateway` for the first non-OpenClaw execution path.

Current scope for Phase 4 / PR 4.1:

- role-aware bootstrap for a single Codex role workspace
- canon-safe read-only operations through the gateway
- a single-thread execution helper that combines bootstrap with one read-only operation
- shared adapter conformance coverage for the claimed read-only capabilities

This package intentionally does not mutate `openclaw.json`, bundle OpenClaw skills, or claim write orchestration.

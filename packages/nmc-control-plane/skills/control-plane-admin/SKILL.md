---
name: control-plane-admin
description: Operate and configure the local NMC control-plane API for monitoring and admin workflows. Use when checking service health, inspecting plugin setup, or applying safe plugin config patches.
metadata: {"openclaw":{"requires":{"config":["plugins.entries.nmc-control-plane.enabled"]}}}
---

# Control Plane Admin

## Workflow

1. Check control-plane health and auth setup.
2. Inspect plugin discovery, contracts, and enabled config entries.
3. Validate one plugin patch against contract before mutation.
4. Apply minimal config patch for one plugin at a time.
5. Re-run health and plugin listing checks.

## Endpoints

- `GET /v1/health`
- `GET /v1/admin/plugins`
- `GET /v1/admin/plugins/contracts`
- `GET /v1/admin/skills`
- `GET /v1/admin/capabilities`
- `GET /v1/admin/monitoring`
- `POST /v1/admin/plugins/:id/config`
- `GET /v1/memory/plan?query=...`
- `GET /v1/memory/conflicts`
- `POST /v1/memory/conflicts/:id/resolve`

## Guardrails

- Use mutation token for config updates.
- Patch only required fields; preserve existing config.
- Avoid bulk edits across many plugins in one operation.
- For UI bootstrap, prefer `GET /v1/admin/capabilities` over multiple fragmented calls.
- For dashboard monitoring, prefer `GET /v1/admin/monitoring` with explicit `principal` for accurate conflict counters.
- For memory conflict endpoints, always pass `principal` and explicit `actor_level` (`A3` list, `A4` resolve).
- Inspect pending conflicts first; resolve one conflict at a time.

---
name: control-plane-admin
description: Operate and configure the local NMC control-plane API for monitoring and admin workflows. Use when checking service health, inspecting plugin setup, or applying safe plugin config patches.
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
- `POST /v1/admin/plugins/:id/config`

## Guardrails

- Use mutation token for config updates.
- Patch only required fields; preserve existing config.
- Avoid bulk edits across many plugins in one operation.

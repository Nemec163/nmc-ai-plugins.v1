# Control-plane API v1

Base URL: `http://127.0.0.1:4466`

Required header:

- `Authorization: Bearer <NMC_AI_PLUGINS_API_TOKEN>`

Mutating endpoints additionally require:

- `x-nmc-mutation-token: <NMC_AI_PLUGINS_MUTATION_TOKEN>` unless plugin config `allowMutations=true`.

## Browser admin UI integration

- Configure `nmc-control-plane` `corsOrigins` with explicit allowed origins (for example, `["http://127.0.0.1:5173"]`).
- Preflight `OPTIONS` is supported and uses the same origin allowlist.

## Endpoints

- `GET /v1/health`
- `GET /v1/agents`
- `POST /v1/agents`
- `DELETE /v1/agents/:id?mode=hard`
- `POST /v1/agents/:id/access-level`
- `POST /v1/memory/recall`
- `POST /v1/memory/store`
- `POST /v1/memory/promote`
- `POST /v1/memory/promotions/:id/decide`
- `POST /v1/memory/prune`
- `GET /v1/memory/conflicts?status=pending&limit=20&principal=orchestrator`
- `POST /v1/memory/conflicts/:id/resolve`
- `GET /v1/memory/layers`
- `GET /v1/memory/stats`
- `GET /v1/admin/plugins`
- `GET /v1/admin/plugins/contracts`
- `GET /v1/admin/skills`
- `POST /v1/admin/plugins/:id/config`
- `GET /v1/audit/events?limit=200`
- `GET /v1/heartbeat/state`

All responses are JSON.

## ACL note for memory endpoints

For `POST /v1/memory/recall`, `POST /v1/memory/store`, `POST /v1/memory/promote`, and
`POST /v1/memory/promotions/:id/decide`, request body must include `principal` (string).
Requests without `principal` return `400 {"error":"principal_required"}`.
For `POST /v1/memory/recall`, optional `layers` array narrows retrieval to explicit memory layers.
`GET /v1/memory/layers` returns machine-readable layer guidance and recommended recall order.
Optional query `actor_level` includes effective read/write/promote profile for that level.
`GET /v1/memory/conflicts` returns conflict queue rows. Required/optional query:
- `principal`: ACL principal (required)
- `actor_level`: defaults to `A3_system_operator`
- `status`: `pending|resolved|all`
- `limit`: `1..200` (default `20`)
`POST /v1/memory/conflicts/:id/resolve` resolves conflict with body:
- `principal`: ACL principal (required)
- `actor_level`: defaults to `A4_orchestrator_full`
- `resolution`: `apply_incoming` or `keep_existing`

`GET /v1/audit/events` returns parsed audit entries from lifecycle `events.ndjson`.
Use optional query `limit` (1..2000, default 200) to control tail size.

`GET /v1/admin/skills` returns runtime-discovered skills (`openclaw skills list --json`)
and plugin-manifest skill bindings (`pluginSkills`) for admin UI inventory.

## Plugin config validation

`POST /v1/admin/plugins/:id/config` now validates merged `config` against plugin `configSchema` when schema is available from plugin discovery.
Invalid requests return `400 {"error":"invalid_plugin_config","validationErrors":[...]}`.

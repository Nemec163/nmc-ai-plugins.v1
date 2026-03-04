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
- `GET /v1/memory/plan?query=...`
- `GET /v1/memory/bootstrap?principal=orchestrator`
- `GET /v1/memory/access-profile?principal=orchestrator`
- `GET /v1/memory/catalog?principal=orchestrator`
- `GET /v1/memory/principals?principal=orchestrator`
- `GET /v1/memory/grants?principal=orchestrator&target_principal=trader-01`
- `POST /v1/memory/grants`
- `DELETE /v1/memory/grants?principal=orchestrator&target_principal=trader-01&layer=M2_domain&mode=read&scope=finance`
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
- `GET /v1/admin/capabilities`
- `GET /v1/admin/monitoring`
- `POST /v1/admin/plugins/:id/config`
- `GET /v1/audit/events?limit=200`
- `GET /v1/heartbeat/state`

All responses are JSON.

## ACL note for memory endpoints

For `POST /v1/memory/recall`, `POST /v1/memory/store`, `POST /v1/memory/promote`, and
`POST /v1/memory/promotions/:id/decide`, request body must include `principal` (string).
Requests without `principal` return `400 {"error":"principal_required"}`.
For `POST /v1/memory/recall`, optional `layers` array narrows retrieval to explicit memory layers.
`GET /v1/memory/plan` returns a narrow-first layer strategy (no memory content), useful for
agents/UI to choose minimal retrieval scope before calling recall.
`GET /v1/memory/bootstrap` returns principal-aware access profile + layer catalog + narrow-first
plan in one payload (no memory snippets), preferred for agent/UI startup.
`GET /v1/memory/access-profile` returns principal-specific ACL summary, suggested recall layers,
and a bounded context budget recommendation without loading memory snippets.
`GET /v1/memory/catalog` returns principal-aware layer orientation (ACL grants, visible counts,
and suggested strategy) without loading memory snippets.
`GET /v1/memory/principals` returns ACL principal inventory (grant counts by mode/layer/scope) for admin UI and operator audits.
`GET /v1/memory/grants` returns explicit grants for one target principal, used by admin UI manual ACL editors.
`GET /v1/memory/layers` returns machine-readable layer guidance and recommended recall order.
Optional query `actor_level` includes effective read/write/promote profile for that level.
`GET /v1/memory/access-profile` query:
- `principal`: ACL principal (required)
- `actor_level`: defaults to `A1_worker`
- `scope`: defaults to `global`
- `query`: optional routing seed for suggested recall layers
- `layer`: repeatable explicit layer override
`GET /v1/memory/bootstrap` query:
- `principal`: ACL principal (required)
- `actor_level`: defaults to `A1_worker`
- `scope`: defaults to `global`
- `query`: optional routing seed for suggested recall layers
- `layer`: repeatable explicit layer override
`GET /v1/memory/principals` query:
- `principal`: ACL principal requesting inventory access (required)
- `actor_level`: defaults to `A3_system_operator`
- `limit`: `1..2000` (default `200`)
`GET /v1/memory/grants` query:
- `principal`: ACL principal requesting access (required)
- `target_principal`: principal whose grants are returned (defaults to `principal`)
- `actor_level`: defaults to `A3_system_operator`
`POST /v1/memory/grants` body:
- `principal`: ACL principal requesting mutation (required)
- `target_principal`: principal whose grant will be set (required)
- `layer`: memory layer (required)
- `mode`: `read|write|promote|admin` (required)
- `scope`: defaults to `global`
- `actor_level`: defaults to `A4_orchestrator_full`
`DELETE /v1/memory/grants` query:
- `principal`: ACL principal requesting mutation (required)
- `target_principal`: principal whose grant will be removed (required)
- `layer`: memory layer (required)
- `mode`: `read|write|promote|admin` (required)
- `scope`: defaults to `global`
- `actor_level`: defaults to `A4_orchestrator_full`
`GET /v1/memory/catalog` query:
- `principal`: ACL principal (required)
- `actor_level`: defaults to `A1_worker`
- `scope`: defaults to `global`
- `query`: optional routing seed for suggested recall layers
- `layer`: repeatable explicit layer override
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
`GET /v1/admin/plugins/contracts` includes plugin descriptor contracts and optional
manifest-declared `admin.uiHandles` for wiring config/monitoring UI actions.
`GET /v1/admin/capabilities` returns a single payload for admin UI bootstrapping:
- plugin contracts + redacted plugin entries
- skill inventory + plugin-skill bindings
- memory layer guide + principal access profile + principal memory catalog for selected actor level
- endpoint groups for memory/admin feature wiring
Optional query:
- `actor_level`: defaults to control-plane config `adminActorLevel`

`GET /v1/admin/monitoring` returns dashboard-oriented runtime summary:
- managed agents count + raw agent list payload
- memory stats + memory layers + principal access profile + principal memory catalog + pending conflicts (ACL-aware)
- control-plane runtime settings + `nmc-agent doctor` payload
Optional query:
- `principal`: defaults to control-plane config `adminPrincipal`
- `actor_level`: defaults to control-plane config `adminActorLevel`

## Plugin config validation

`POST /v1/admin/plugins/:id/config` now validates merged `config` against plugin `configSchema` when schema is available from plugin discovery.
Invalid requests return `400 {"error":"invalid_plugin_config","validationErrors":[...]}`.

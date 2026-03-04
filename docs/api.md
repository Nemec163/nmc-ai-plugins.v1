# Control-plane API v1

Base URL: `http://127.0.0.1:4466`

Required header:

- `Authorization: Bearer <NMC_AI_PLUGINS_API_TOKEN>`

Mutating endpoints additionally require:

- `x-nmc-mutation-token: <NMC_AI_PLUGINS_MUTATION_TOKEN>` unless plugin config `allowMutations=true`.

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
- `GET /v1/memory/stats`
- `GET /v1/audit/events?limit=200`
- `GET /v1/heartbeat/state`

All responses are JSON.

## ACL note for memory endpoints

For `POST /v1/memory/recall`, `POST /v1/memory/store`, `POST /v1/memory/promote`, and
`POST /v1/memory/promotions/:id/decide`, request body must include `principal` (string).
Requests without `principal` return `400 {"error":"principal_required"}`.

`GET /v1/audit/events` returns parsed audit entries from lifecycle `events.ndjson`.
Use optional query `limit` (1..2000, default 200) to control tail size.

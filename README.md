# nmc-ai-plugins.v1

Greenfield plugin pack for OpenClaw:

- `nmc-memory-fabric` — QMD-first permanent memory (`facts -> qmd -> vector` cascade)
- `nmc-agent-lifecycle` — deterministic agent create/delete with registry + reconciler
- `nmc-control-plane` — local authenticated HTTP API for future admin UI
- `skills/*` — operational skills created with skill-creator workflow

## Install from link

```bash
git clone <REPO_URL> nmc-ai-plugins.v1
cd nmc-ai-plugins.v1
cp .env.example .env
# set OPENAI_API_KEY and control-plane tokens in .env
./scripts/install.sh --non-interactive
```

Prerequisites:

1. OpenClaw CLI installed and available as `openclaw`.
2. Native build toolchain for your OS (needed by `better-sqlite3` / `@lancedb/lancedb`):
   - macOS: Xcode Command Line Tools (`xcode-select --install`)
   - Debian/Ubuntu: `build-essential python3 pkg-config`
3. Build scripts explicitly allowed (security model). You can set this in `openclaw.json` (installer also passes `--allow-build`):

```json
{
  "plugins": {
    "install": {
      "allowBuild": ["better-sqlite3", "@lancedb/lancedb"]
    }
  }
}
```

Installer behavior:

1. Installs plugins via official flow `openclaw plugins install <source>`.
2. Uses secure dependency install path (`--ignore-scripts` internally, with explicit allow-build list).
3. Installs skills into `~/.openclaw/skills/nmc-ai-plugins`.
4. Patches `openclaw.json` for memory backend/QMD paths, `plugins.slots.memory`, and baseline tool allowlist.
5. Restarts gateway.
6. Runs smoke checks (`plugins list/doctor` + runtime checks) and writes reports.

## Default control-plane API

- Bind: `127.0.0.1:4466`
- Auth: `Authorization: Bearer $NMC_AI_PLUGINS_API_TOKEN`
- Mutation gate: `x-nmc-mutation-token: $NMC_AI_PLUGINS_MUTATION_TOKEN` (unless `allowMutations=true`)
- Admin/UI hooks: `GET /v1/admin/plugins`, `GET /v1/admin/plugins/contracts`, `POST /v1/admin/plugins/:id/config`
- Admin/UI capabilities: `GET /v1/admin/capabilities` (contracts + skills + memory layers + access profile), `GET /v1/admin/monitoring` (runtime dashboard payload)
- Skills/UI hooks: `GET /v1/admin/skills` (runtime + plugin-bound skills inventory)
- Memory recall supports optional layer routing (`layers` in API or `--layer` in CLI)
- Memory planning endpoint for narrow-first routing before recall: `GET /v1/memory/plan`
- Principal access profile for UI/agent bootstrap (ACL + suggested layers + context budget): `GET /v1/memory/access-profile`
- Memory conflict queue for manual curation (ACL principal required): `GET /v1/memory/conflicts`, `POST /v1/memory/conflicts/:id/resolve`
- Memory layer metadata for agents/UI: `GET /v1/memory/layers` (`openclaw nmc-mem layers --json`)

See [docs/api.md](./docs/api.md).

## Packages

- `packages/nmc-shared-contracts`
- `packages/nmc-memory-fabric`
- `packages/nmc-agent-lifecycle`
- `packages/nmc-control-plane`

## Skills

- `skills/agent-factory`
- `skills/memory-curator`
- `skills/heartbeat-operator`
- `skills/access-auditor`

## Notes

- This repo is intentionally greenfield and does not depend on legacy docs/code.
- Delete policy is hard delete (no snapshot retention).
- Embeddings are OpenAI-only in v1.
- OpenClaw plugin+skill compatibility audit: `npm run audit:openclaw`.

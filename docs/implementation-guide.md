# Implementation Guide: nmc-memory-plugin

Current-state implementation and operations guide for the managed OpenClaw memory workspace.

Use this document for installation, setup behavior, day-2 operations, and verification. The conceptual model lives in [memory-design-v2.md](./memory-design-v2.md), while package-specific details live in [../nmc-memory-plugin/README.md](../nmc-memory-plugin/README.md).

## Scope

The current repository ships one production plugin, `nmc-memory-plugin`, in the OpenClaw plugin format:

- `openclaw.plugin.json` declares the manifest and config schema.
- `package.json` exposes `./index.js` through `openclaw.extensions`.
- `index.js` registers the `nmc-memory setup` CLI and the runtime bootstrap service.
- `packages/control-plane/` is bundled inside the shipped plugin as the supported read-only operator surface.
- `templates/workspace-memory/` and `templates/workspace-system/` provide the managed scaffold.
- `skills/` bundles the memory pipeline, maintenance scripts, and kanban operator.

The deprecated `memory-os-gateway ops-snapshot` output remains compatibility-only and is not the supported operator contract.

### Supported Operator Surface

The shipped plugin artifact now carries the supported Memory OS operator CLI under:

```bash
~/.openclaw/extensions/nmc-memory-plugin/packages/control-plane/bin/memory-control-plane.js
```

Typical usage against the managed workspace:

```bash
node ~/.openclaw/extensions/nmc-memory-plugin/packages/control-plane/bin/memory-control-plane.js snapshot \
  --memory-root ~/.openclaw/workspace/system/memory \
  --system-root ~/.openclaw/workspace/system

node ~/.openclaw/extensions/nmc-memory-plugin/packages/control-plane/bin/memory-control-plane.js health \
  --memory-root ~/.openclaw/workspace/system/memory \
  --system-root ~/.openclaw/workspace/system
```

Supported operator commands come from `packages/control-plane` and include `snapshot`, `health`, `queues`, `analytics`, `audits`, `runtime-inspector`, and advisory `record-intervention`. Keep migration-release usage pinned to that surface rather than to deprecated gateway bridge commands.

## Managed Bootstrap

The plugin supports two setup paths:

1. Runtime auto-bootstrap on plugin load, controlled by `config.autoSetup`.
2. Explicit setup via `openclaw nmc-memory setup`.

The runtime path exists because OpenClaw does not expose a plugin install-time lifecycle hook. `maybeAutoSetup()` runs when the plugin service starts and scaffolds the managed workspace if setup is enabled.

### Setup Outputs

The managed setup creates:

- `~/.openclaw/workspace/system/` as shared infrastructure root
- `~/.openclaw/workspace/system/memory/` as shared canon root
- `~/.openclaw/workspace/system/skills/` as mirrored skill root
- `~/.openclaw/workspace/system/tasks/`, `policy/`, `docs/`, `scripts/` as the shared operations layer
- `~/.openclaw/workspace/{nyx,medea,arx,lev,mnemo}/` as per-agent workspaces
- `~/.openclaw/agents/{nyx,medea,arx,lev,mnemo}/{agent,sessions}/` as OpenClaw state directories
- symlinks inside each agent workspace:
  - `system -> ../system`
  - `skills -> ../system/skills`

Setup also manages `~/.openclaw/openclaw.json` by writing:

- predefined agent registrations under `agents.list`
- shared canon search paths under `agents.defaults.memorySearch.extraPaths`
- optional routing bindings

### CLI And Script Entry Points

OpenClaw command:

```bash
openclaw nmc-memory setup \
  --state-dir ~/.openclaw \
  --bind "nyx=telegram:primary" \
  --model-lev "codex 5.1 mini"
```

Standalone development script:

```bash
node ./nmc-memory-plugin/scripts/setup-openclaw.js \
  --state-dir ~/.openclaw \
  --workspace-root ~/.openclaw/workspace
```

Supported options:

- `--state-dir <path>`
- `--workspace-root <path>`
- `--system-root <path>`
- `--memory-root <path>`
- `--config-path <path>`
- `--overwrite`
- `--no-config`
- `--bind <agent=channel[:accountId[:peerId]]>` repeatable
- `--model-nyx <model>`
- `--model-medea <model>`
- `--model-arx <model>`
- `--model-lev <model>`
- `--model-mnemo <model>`

### Plugin Config

These keys are available through the plugin manifest config schema:

| Key | Meaning |
|---|---|
| `autoSetup` | Run managed bootstrap during plugin startup. |
| `stateDir` | Override the OpenClaw state dir used by setup. |
| `workspaceRoot` | Override the parent workspace root. |
| `systemRoot` | Override the shared `system/` root. |
| `memoryRoot` | Override the shared canon root. |
| `configPath` | Override the `openclaw.json` path. |
| `overwrite` | Allow managed files and symlinks to be replaced. |
| `writeConfig` | Disable config writes during setup when set to `false`. |
| `bindings` | Preseed agent routing bindings. |
| `models` | Override default models for predefined agents. |

## Workspace Contracts

### Shared System Layer

The setup now provisions a shared `system/` contract:

- `system/memory/` contains the canonical memory workspace.
- `system/skills/` mirrors bundled plugin skills into the runtime workspace.
- `system/tasks/` is the source of truth for the file-first kanban.
- `system/policy/` contains shared autonomy, git, git-flow, and operating policy.
- `system/scripts/` contains helpers such as `kanban.mjs` and `git-iteration-closeout.sh`.
- `system/docs/` holds implementation notes that future UI layers can consume.

The default references inside agent slices assume this shared layer exists and is accessed through each agent's local `system` symlink.

### Memory Workspace

Canonical memory remains git-backed and lives under `system/memory/` by default:

- `intake/pending/` for extracted daily claims
- `intake/processed/` for completed batches
- `core/system/` for canon invariants and the curator runbook
- `core/user/` for timeline, knowledge, identity, and state
- `core/agents/` for role-specific memory slices
- `core/meta/` for generated manifest and graph outputs

### Task And Policy Layer

The kanban/task layer is now part of the managed scaffold:

- Active tasks are Markdown files named `T-*.md`.
- Board defaults live in `system/tasks/active/.kanban.json`.
- Task frontmatter may override board defaults.
- Missing `autonomy` or `git_flow` values inherit from board defaults.
- `system/scripts/kanban.mjs` is the reference CLI for manipulating the board contract.
- `kanban-operator` is the agent-facing skill that interprets this contract before action.

## Predefined Agents

Managed setup registers five predefined agent workspaces:

| Agent | Role | Default model |
|---|---|---|
| `nyx` | Orchestrator and main user-facing product lead | `opus 4.6` |
| `medea` | Research and documentation lead | `codex 5.4` |
| `arx` | Implementation, refactor, and architecture lead | `codex 5.4` |
| `lev` | Heartbeat, proactivity, and kanban execution lead | `codex 5.1 mini` |
| `mnemo` | Canonical memory writer and maintainer | `codex 5.4` |

`memory-onboard-agent/onboard.sh` remains the path for adding additional role slices under `core/agents/`.

## Memory Pipeline

The consolidation flow still has four phases with narrow responsibilities:

1. **Extract**: convert transcripts into daily claims in `intake/pending/`.
2. **Curate**: accept, reject, or defer claims against the canon.
3. **Apply**: write accepted changes into canonical files and advance intake state.
4. **Verify**: rebuild derived metadata under `core/meta/`.

The operational entry point is:

```bash
./nmc-memory-plugin/skills/memory-pipeline/pipeline.sh YYYY-MM-DD
./nmc-memory-plugin/skills/memory-pipeline/pipeline.sh YYYY-MM-DD --phase verify
```

Behavior:

- accepts one required date in `YYYY-MM-DD`
- supports `--phase extract|curate|apply|verify|all`
- resolves the memory root from `MEMORY_ROOT`, current working directory, or `workspace/system/memory`
- runs LLM phases through `openclaw skill run memory-<phase> --date ...`
- runs the verify phase through the bundled `verify.sh`
- logs timestamps, per-phase status, and total duration
- stops immediately on phase failure

If `openclaw` is not available for extract, curate, or apply, the script prints the commands it would run, emits the pipeline summary, and exits with code `2`.

## Maintenance Scripts

### Verify

`skills/memory-verify/verify.sh path/to/workspace/system/memory`

Current verification responsibilities:

- scan canonical Markdown records under `core/user/` and `core/agents/`
- count records by type
- hash canonical files
- rebuild `manifest.json`
- rebuild or append graph edges from `links[]`
- warn about dangling or missing edge endpoints
- create a git commit when metadata changes exist

Exit behavior:

- `0` on success
- `1` when warnings are present
- `2` on hard errors

### Status

`skills/memory-status/status.sh [memory-root]`

Reports:

- manifest schema version and last update
- record counts by type
- pending backlog count and oldest pending batch
- processed batches older than 90 days
- overall `OK` or `ALERT` status

### Retention

`skills/memory-retention/retention.sh [memory-root] [--compact-edges] [--archive-timeline]`

Current retention behavior:

- archives `intake/processed/*.md` older than 90 days into `archive/YYYY/MM/`
- warns when `intake/pending/*.md` is older than 7 days
- optionally compacts `core/meta/graph/edges.jsonl`
- optionally archives timeline files older than one year
- creates a single retention commit when changes exist

### Onboarding

`skills/memory-onboard-agent/onboard.sh <role>`

Creates a new `core/agents/<role>/` slice with:

- `COURSE.md`
- `PLAYBOOK.md`
- `PITFALLS.md`
- `DECISIONS.md`

and appends the new role to `core/agents/_index.md`.

## Verification And Testing

Run the bundled integration script from the repo root:

```bash
./nmc-memory-plugin/tests/run-integration.sh
```

The current integration coverage validates:

- packaging files and OpenClaw manifest wiring
- setup script behavior
- scaffolded workspace structure
- shared system/task/policy assets
- memory verify/status/onboard/retention helpers

For a live workspace, the smallest post-install verification is:

```bash
./nmc-memory-plugin/skills/memory-verify/verify.sh ~/.openclaw/workspace/system/memory
./nmc-memory-plugin/skills/memory-status/status.sh ~/.openclaw/workspace/system/memory
```

## Troubleshooting

- If setup appears to do nothing, inspect plugin config and confirm `autoSetup` is not disabled.
- If the managed scaffold is partially outdated, rerun setup with `--overwrite`.
- If `openclaw.json` must not be changed, use `--no-config` or set `writeConfig` to `false`.
- If memory scripts cannot locate the canon, pass the memory root explicitly or set `MEMORY_ROOT`.
- If the verify phase reports dangling edges, inspect canonical `links[]` targets before rerunning.
- If the backlog alert triggers, curate or archive the oldest `intake/pending/*.md` batch before further automation.

## Document Roles

- [../README.md](../README.md) is the repository entry point.
- [memory-design-v2.md](./memory-design-v2.md) captures the conceptual model and storage design.
- [human-memory.md](./human-memory.md) captures the higher-level memory abstraction.
- [../nmc-memory-plugin/README.md](../nmc-memory-plugin/README.md) remains the package-level reference for installation and bundled assets.

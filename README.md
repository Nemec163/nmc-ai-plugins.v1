# nmc-ai-plugins.v1

Monorepo for the current NMC OpenClaw memory plugin and its bundled workspace scaffolding.

The repository currently ships one production plugin: `nmc-memory-plugin`. It remains the production OpenClaw install/setup shell for the current migration release, bootstraps a managed multi-agent OpenClaw workspace, provisions a shared `system/` layer, and bundles the memory, kanban, and maintenance skills that operate on that workspace.

Use this document as the entry point. Use [plugin README](./nmc-memory-plugin/README.md) for package-level details, [implementation guide](./docs/implementation-guide.md) for day-2 operations, and [deliberate migration release plan](./docs/deliberate-migration-release-plan.md) for the current post-freeze cutover boundary.

## What It Provides

- A managed OpenClaw bootstrap for five predefined agents: `nyx`, `medea`, `arx`, `lev`, and `mnemo`.
- A shared `system/` layer with memory, skills, tasks, policy, docs, and scripts.
- A git-backed canonical memory workspace with extract -> curate -> apply -> verify flow.
- A file-first kanban contract for task routing, autonomy defaults, and git-flow decisions.
- Retention and health scripts for ongoing maintenance.

## Quick Start

Install the plugin from this repository:

```bash
openclaw plugins install ./nmc-memory-plugin
```

The plugin auto-bootstraps on first runtime load by default. To run setup explicitly:

```bash
openclaw nmc-memory setup
```

For local development without installing the package, use the standalone setup script:

```bash
node ./nmc-memory-plugin/scripts/setup-openclaw.js --state-dir ~/.openclaw
```

Run the daily consolidation pipeline:

```bash
./nmc-memory-plugin/skills/memory-pipeline/pipeline.sh 2026-03-05
```

## Architecture

### Managed OpenClaw Bootstrap

`nmc-memory-plugin` registers:

- a CLI command: `openclaw nmc-memory setup`
- a runtime bootstrap service that can scaffold the workspace automatically on plugin load

The managed scaffold creates:

- `~/.openclaw/workspace/system/` as the shared infra root
- `~/.openclaw/workspace/system/memory/` as the shared canon root
- `~/.openclaw/workspace/system/skills/` as the mirrored shared skill root
- `~/.openclaw/workspace/system/tasks/`, `policy/`, `docs/`, `scripts/` as the shared execution layer
- `~/.openclaw/workspace/{nyx,medea,arx,lev,mnemo}/` as per-agent workspaces
- `~/.openclaw/agents/{nyx,medea,arx,lev,mnemo}/` as OpenClaw state directories

Each agent workspace is linked back to shared infrastructure through:

- `system -> ../system`
- `skills -> ../system/skills`

### Agent Roster

| Agent | Role | Default model |
|---|---|---|
| `nyx` | Orchestrator and main user-facing product lead | `opus 4.6` |
| `medea` | Research and documentation lead | `codex 5.4` |
| `arx` | Implementation, refactor, and architecture lead | `codex 5.4` |
| `lev` | Heartbeat, proactivity, and kanban execution lead | `codex 5.1 mini` |
| `mnemo` | Canonical memory writer and maintainer | `codex 5.4` |

### Skills

| Skill | Type | Purpose |
|---|---|---|
| `memory-extract` | LLM | Extract atomic claims into `intake/pending/`. |
| `memory-curate` | LLM | Accept, reject, or defer extracted claims against canon. |
| `memory-apply` | LLM | Write accepted claims into canon and move intake forward. |
| `memory-verify` | Script | Rebuild manifest metadata and graph edges. |
| `memory-query` | LLM | Answer canon-grounded memory questions. |
| `memory-status` | Script | Report manifest health, backlog risk, and retention alerts. |
| `memory-onboard-agent` | Script | Scaffold a new `core/agents/<role>/` slice. |
| `memory-pipeline` | Script | Run extract -> curate -> apply -> verify in order. |
| `memory-retention` | Script | Archive stale intake and optional long-term maintenance outputs. |
| `kanban-operator` | LLM | Operate the shared file-first board and resolve task policy before action. |

### Shared System Contract

Shared infrastructure is scaffolded under `system/`:

- `memory/` contains canon, intake, metadata, and maintenance state.
- `skills/` mirrors plugin-bundled skills into the workspace.
- `tasks/` contains the file-first kanban source of truth.
- `policy/` contains shared autonomy, git, git-flow, and operations defaults.
- `scripts/` contains local operational helpers such as `kanban.mjs`.
- `docs/` contains system-level implementation notes for future tooling and UI layers.

The shared task layer uses the contract from `nmc-memory-plugin/templates/workspace-system/tasks/README.md`:

- active tasks are `T-*.md`
- board defaults live in `tasks/active/.kanban.json`
- task frontmatter may override defaults such as `autonomy` and `git_flow`
- `system/scripts/kanban.mjs` is the reference CLI for board operations

## Pipeline And Maintenance

The memory workflow has four phases:

1. Extract
2. Curate
3. Apply
4. Verify

Operational helpers:

- `skills/memory-pipeline/pipeline.sh YYYY-MM-DD [--phase ...]` runs one or all phases
- `skills/memory-retention/retention.sh [memory-root] [--compact-edges] [--archive-timeline]` performs housekeeping
- `skills/memory-status/status.sh [memory-root]` reports current memory health

## Configuration

The plugin manifest exposes these managed config knobs through `openclaw.plugin.json`:

| Key | Purpose |
|---|---|
| `autoSetup` | Enable runtime bootstrap on plugin load. |
| `stateDir` | Override the OpenClaw state directory. |
| `workspaceRoot` | Override the workspace root containing `system/` and agent folders. |
| `systemRoot` | Override the shared system root. |
| `memoryRoot` | Override the shared memory root. |
| `configPath` | Override the `openclaw.json` path used for managed updates. |
| `overwrite` | Allow managed files and symlinks to be replaced. |
| `writeConfig` | Disable or enable `openclaw.json` updates during setup. |
| `bindings` | Seed routing bindings in `agent=channel[:accountId[:peerId]]` form. |
| `models.*` | Override the default model per predefined agent. |

Example:

```json
{
  "plugins": {
    "entries": {
      "nmc-memory-plugin": {
        "enabled": true,
        "config": {
          "autoSetup": false,
          "workspaceRoot": "~/custom-workspace",
          "systemRoot": "~/custom-workspace/system",
          "models": {
            "nyx": "opus 4.6",
            "lev": "codex 5.1 mini"
          }
        }
      }
    }
  }
}
```

## Verification

Run the bundled integration checks:

```bash
./nmc-memory-plugin/tests/run-integration.sh
```

For an already scaffolded workspace, the fastest operational verification is:

```bash
./nmc-memory-plugin/skills/memory-verify/verify.sh ~/.openclaw/workspace/system/memory
./nmc-memory-plugin/skills/memory-status/status.sh ~/.openclaw/workspace/system/memory
```

## Documentation Map

| Document | Role |
|---|---|
| [nmc-memory-plugin/README.md](./nmc-memory-plugin/README.md) | Package-level install, setup, structure, and skill reference. |
| [docs/implementation-guide.md](./docs/implementation-guide.md) | Current implementation and day-2 operations guide. |
| [docs/deliberate-migration-release-plan.md](./docs/deliberate-migration-release-plan.md) | Current migration-release surface classification and repo-local bridge retirement sequence. |
| [docs/memory-os-roadmap.md](./docs/memory-os-roadmap.md) | Repo-specific migration roadmap from the current plugin to a modular Memory OS. |
| [docs/memory-design-v2.md](./docs/memory-design-v2.md) | Conceptual v2 design reference. |
| [docs/human-memory.md](./docs/human-memory.md) | High-level memory model note. |
| [docs/legacy/README.md](./docs/legacy/README.md) | Historical v1 design archive. |

# MemoryOS.v1

Monorepo for MemoryOS.v1: an autonomous, self-sufficient memory operating system with optional connector packages for external LLM and agent runtimes.

The product boundary is the Memory OS core: contracts, ingest, canon, maintainer, workspace, agents, gateway, runtime, pipeline, scripts, and control-plane packages. Connector packages attach that core to specific execution environments. In this repository, `adapter-openclaw` and `adapter-codex` are implemented connector packages, and `adapter-claude` exists as an explicit scaffold package for the future Claude connector surface.

`packages/adapter-openclaw` is the supported OpenClaw adapter/plugin surface for MemoryOS.v1. The old `nmc-memory-plugin` mirror has been retired and removed from the repository.

Use this document as the entry point. Use [adapter README](./packages/adapter-openclaw/README.md) for the OpenClaw adapter surface, [implementation guide](./docs/implementation-guide.md) for day-2 operations, and [deliberate migration release plan](./docs/deliberate-migration-release-plan.md) for the current direct-install boundary.

## What It Provides

- An autonomous Memory OS core with canonical memory, runtime shadow state, operator surfaces, and deterministic promotion boundaries.
- A shared `system/` layer with memory, skills, tasks, policy, docs, and scripts.
- A git-backed canonical memory workspace with extract -> curate -> apply -> verify flow.
- Optional connector surfaces for OpenClaw and Codex, plus a scaffolded future Claude adapter that is not part of the current production release surface.
- A direct OpenClaw adapter surface with managed setup and bootstrap behavior.

## Quick Start

Install the optional OpenClaw adapter from this repository:

```bash
openclaw plugins install ./packages/adapter-openclaw
```

The plugin auto-bootstraps on first runtime load by default. To run setup explicitly:

```bash
openclaw memoryos setup
```

For local development without installing the package, use the standalone setup script:

```bash
node ./packages/adapter-openclaw/lib/setup-cli.js --state-dir ~/.openclaw
```

Run the daily consolidation pipeline:

```bash
./packages/adapter-openclaw/skills/memory-pipeline/pipeline.sh 2026-03-05
```

## Architecture

### Autonomous Core

MemoryOS.v1 centers on the extracted core packages:

- `@nmc/memory-contracts`
- `@nmc/memory-ingest`
- `@nmc/memory-canon`
- `@nmc/memory-maintainer`
- `@nmc/memory-workspace`
- `@nmc/memory-agents`
- `@nmc/memory-pipeline`
- `memory-os-gateway`
- `memory-os-runtime`
- `control-plane`

These packages define the memory system itself. Connectors are optional and sit on top.

### Optional Connectors

- `packages/adapter-openclaw` attaches MemoryOS.v1 to the OpenClaw plugin/runtime model.
- `packages/adapter-codex` attaches MemoryOS.v1 to Codex-oriented execution flows.
- `packages/adapter-claude` is the explicit scaffold package for the future Claude adapter surface.

### OpenClaw Adapter

`packages/adapter-openclaw` registers:

- a CLI command: `openclaw memoryos setup`
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

The shared task layer uses the contract from `packages/adapter-openclaw/templates/workspace-system/tasks/README.md`:

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

The adapter manifest exposes these managed config knobs through `openclaw.plugin.json`:

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
      "memoryos-openclaw": {
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
./tests/run-integration.sh
```

For an already scaffolded workspace, the fastest operational verification is:

```bash
./packages/adapter-openclaw/skills/memory-verify/verify.sh ~/.openclaw/workspace/system/memory
./packages/adapter-openclaw/skills/memory-status/status.sh ~/.openclaw/workspace/system/memory
```

## Documentation Map

| Document | Role |
|---|---|
| [packages/adapter-openclaw/README.md](./packages/adapter-openclaw/README.md) | Package-level install, setup, structure, and OpenClaw adapter reference. |
| [docs/implementation-guide.md](./docs/implementation-guide.md) | Current implementation and day-2 operations guide. |
| [docs/deliberate-migration-release-plan.md](./docs/deliberate-migration-release-plan.md) | Current migration-release surface classification and repo-local bridge retirement sequence. |
| [docs/memory-os-roadmap.md](./docs/memory-os-roadmap.md) | Repo-specific migration roadmap from the current plugin to a modular Memory OS. |
| [docs/memory-design-v2.md](./docs/memory-design-v2.md) | Conceptual v2 design reference. |
| [docs/human-memory.md](./docs/human-memory.md) | High-level memory model note. |
| [docs/legacy/README.md](./docs/legacy/README.md) | Historical v1 design archive. |

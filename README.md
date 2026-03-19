# MemoryOS.v1

Monorepo for MemoryOS.v1: an autonomous, self-sufficient memory operating system with a standalone app surface and optional adapter packages for external LLM and agent runtimes.

The product boundary is the independent Memory OS core: contracts, ingest, canon, maintainer, workspace, agents, gateway, runtime, pipeline, scripts, and control-plane packages. Adapter packages attach that core to specific execution environments. In this repository, `memoryos-app` is the standalone app surface, while `adapter-openclaw`, `adapter-codex`, and `adapter-claude` are peer adapter surfaces over the same core, each adapted to its own host or LLM runtime.

`packages/memoryos-app` is the supported standalone app surface for MemoryOS.v1. `packages/adapter-openclaw`, `packages/adapter-codex`, and `packages/adapter-claude` are supported adapter surfaces.

Use this document as the entry point. Start with [standalone app README](./packages/memoryos-app/README.md) for the autonomous local runtime surface. Use [OpenClaw adapter README](./packages/adapter-openclaw/README.md), [Codex adapter README](./packages/adapter-codex/README.md), and [Claude adapter README](./packages/adapter-claude/README.md) only when you need those specific peer adapter surfaces. Use [supported surfaces](./docs/supported-surfaces.md) for the package matrix, [implementation guide](./docs/legacy/implementation-guide.md) for day-2 operations, [release readiness](./docs/release-readiness.md) for the current production gate, and [deliberate migration release plan](./docs/legacy/deliberate-migration-release-plan.md) for historical release-cutover context.

## What It Provides

- An autonomous Memory OS core with canonical memory, runtime shadow state, operator surfaces, and deterministic promotion boundaries.
- A shared `system/` layer with memory, skills, tasks, policy, docs, and scripts.
- A git-backed canonical memory workspace with extract -> curate -> apply -> verify flow.
- Peer adapter surfaces for OpenClaw, Codex, and Claude, while the core product boundary stays independent of any single adapter.
- Host-specific adapter behavior for plugin bootstrap, adapter-owned runners, and explicit gateway handoff without widening canon authority.

## Quick Start

Run MemoryOS.v1 directly from this repository without OpenClaw:

```bash
node ./packages/memoryos-app/bin/memoryos.js init
node ./packages/memoryos-app/bin/memoryos.js run --phase verify --once
node ./packages/memoryos-app/bin/memoryos.js status
```

Run maintenance against the standalone workspace:

```bash
node ./packages/memoryos-app/bin/memoryos.js verify
node ./packages/memoryos-app/bin/memoryos.js health
node ./packages/memoryos-app/bin/memoryos.js pipeline 2026-03-05 --phase verify
```

The three adapters are peer adapters over the same core. Use the OpenClaw path only when you need that specific host integration:

```bash
openclaw plugins install ./packages/adapter-openclaw
```

The plugin auto-bootstraps on first runtime load by default. To run setup explicitly:

```bash
openclaw memoryos setup
```

For local development without installing the OpenClaw package, use the adapter setup script:

```bash
node ./packages/adapter-openclaw/lib/setup-cli.js --state-dir ~/.openclaw
```

For Codex or Claude, use their peer adapter packages as the `--adapter-module`
for shared pipeline or standalone host execution instead of treating OpenClaw as
the default adapter:

```bash
node ./packages/memoryos-app/bin/memoryos.js pipeline 2026-03-20 \
  --phase extract \
  --adapter-module ./packages/adapter-codex \
  --llm-runner codex

node ./packages/memoryos-app/bin/memoryos.js pipeline 2026-03-20 \
  --phase curate \
  --adapter-module ./packages/adapter-claude \
  --llm-runner claude
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
- `memoryos-app`

These packages define the standalone memory system and its stable operator/programmatic entrypoints. Connectors are optional and sit on top.

### Optional Connectors

- `packages/memoryos-app` attaches MemoryOS.v1 to a standalone local CLI/runtime surface.
- `packages/adapter-openclaw` attaches MemoryOS.v1 to the OpenClaw plugin/runtime model.
- `packages/adapter-codex` attaches MemoryOS.v1 to Codex-oriented execution
  flows, including connector-neutral `extract` and `curate` execution through
  the shared pipeline contract.
- `packages/adapter-claude` attaches MemoryOS.v1 to Claude-oriented execution
  flows, including connector-neutral `extract` and `curate` execution through
  the shared pipeline contract.

### Optional OpenClaw Adapter

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
| `memory-apply` | Compatibility | OpenClaw-facing Phase C shim that preserves the stable apply skill name while the core promoter owns canon writes. |
| `memory-verify` | Script | Rebuild manifest metadata and graph edges. |
| `memory-query` | LLM | Answer canon-grounded memory questions. |
| `memory-status` | Script | Report manifest health, backlog risk, and retention alerts. |
| `memory-onboard-agent` | Script | Scaffold a new `core/agents/<role>/` slice. |
| `memory-pipeline` | Script | Run extract -> curate -> apply -> verify in order, with Phase C routed through the core promoter. |
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

These settings apply only to the OpenClaw adapter surface. They are not part of the standalone `MemoryOS.v1` product boundary.

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

Run the production readiness gate:

```bash
./tests/run-production-readiness.sh
```

For an already scaffolded workspace, the fastest operational spot-check is:

```bash
node ./packages/memoryos-app/bin/memoryos.js verify
node ./packages/memoryos-app/bin/memoryos.js status
```

## Documentation Map

| Document | Role |
|---|---|
| [packages/memoryos-app/README.md](./packages/memoryos-app/README.md) | Package-level standalone install, bootstrap, and local runtime CLI reference. |
| [packages/adapter-openclaw/README.md](./packages/adapter-openclaw/README.md) | Package-level install, setup, structure, and OpenClaw adapter reference. |
| [docs/supported-surfaces.md](./docs/supported-surfaces.md) | Production and internal package matrix for the current product boundary. |
| [docs/release-readiness.md](./docs/release-readiness.md) | Current production go/no-go gate and release checklist for the independent MemoryOS repository. |
| [docs/legacy/implementation-guide.md](./docs/legacy/implementation-guide.md) | Current implementation and day-2 operations guide. |
| [docs/legacy/deliberate-migration-release-plan.md](./docs/legacy/deliberate-migration-release-plan.md) | Historical archive of the completed release-cutover and bridge-retirement planning work. |
| [docs/legacy/memory-os-roadmap.md](./docs/legacy/memory-os-roadmap.md) | Repo-specific migration roadmap from the legacy plugin-centric shape to the current modular Memory OS boundary. |
| [docs/legacy/memory-design-v2.md](./docs/legacy/memory-design-v2.md) | Conceptual v2 design reference. |
| [docs/legacy/human-memory.md](./docs/legacy/human-memory.md) | High-level memory model note. |
| [docs/legacy/README.md](./docs/legacy/README.md) | Historical v1 design archive. |

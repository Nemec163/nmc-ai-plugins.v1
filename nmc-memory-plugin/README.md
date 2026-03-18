# nmc-memory-plugin

Persistent OpenClaw memory plugin for maintaining a git-backed personal canon: intake, curation, canonical writes, verification, query, and operational automation.

Repository-level docs live in [../README.md](../README.md). Current setup and day-2 operating guidance live in [../docs/implementation-guide.md](../docs/implementation-guide.md).

The package is shipped in the current OpenClaw plugin format:

- `openclaw.plugin.json` declares the plugin manifest and bundled skill roots.
- `package.json` exposes the runtime entrypoint through `openclaw.extensions`.
- `skills/*/SKILL.md` files use AgentSkills-compatible YAML frontmatter.
- `templates/workspace-memory/` and `templates/workspace-system/` stay bundled as package assets for manual scaffolding.

Release-boundary note:

- `nmc-memory-plugin` is the compatibility shell for setup, auto-bootstrap, bundled skills, and the stable OpenClaw packaging surface.
- the supported Memory OS operator surface is bundled inside the shipped plugin at `packages/control-plane`; the temporary `memory-os-gateway ops-snapshot` bridge is deprecated compatibility-only output.

Supported operator commands from an installed plugin artifact:

```bash
node ~/.openclaw/extensions/nmc-memory-plugin/packages/control-plane/bin/memory-control-plane.js snapshot \
  --memory-root ~/.openclaw/workspace/system/memory \
  --system-root ~/.openclaw/workspace/system

node ~/.openclaw/extensions/nmc-memory-plugin/packages/control-plane/bin/memory-control-plane.js health \
  --memory-root ~/.openclaw/workspace/system/memory \
  --system-root ~/.openclaw/workspace/system
```

The default workspace template ships with predefined agent slices:
- `nyx` - orchestrator and main user-facing agent, Chief Product Officer, `opus 4.6`
- `medea` - research and documentation, Chief Research Officer, `codex 5.4`
- `arx` - coding, refactor, and architecture, Chief Technology Officer, `codex 5.4`
- `lev` - heartbeat, proactivity, and kanban execution, Chief Manager Officer, `codex 5.1 mini`
- `mnemo` - canonical memory writer and maintainer, Chief Knowledge Officer, `codex 5.4`

The plugin also exposes an OpenClaw multi-agent setup command that scaffolds:
- `~/.openclaw/workspace/system/` as the shared infra root
- `~/.openclaw/workspace/system/memory/` as the shared canon root
- `~/.openclaw/workspace/system/skills/` as the shared workspace skill mirror for bundled memory skills
- `~/.openclaw/workspace/system/tasks/`, `policy/`, `scripts/`, and `docs/` as the shared kanban/policy layer
- `~/.openclaw/workspace/{nyx,medea,arx,lev,mnemo}/` as full per-agent workspaces
- `~/.openclaw/openclaw.json` entries under `agents.list`, `agents.defaults.memorySearch.extraPaths`, and optional `bindings`

## Skills

| Skill | Type | Description |
|---|---|---|
| `memory-extract` | LLM | Extract atomic memory claims from transcripts into `intake/pending/`. |
| `memory-curate` | LLM | Evaluate extracted claims against canon and annotate accept, reject, or defer decisions. |
| `memory-apply` | LLM | Apply accepted claims into canonical files and create the consolidation commit. |
| `memory-verify` | Script | Rebuild manifest metadata and append valid graph edges after apply. |
| `memory-query` | LLM | Answer canon-grounded memory questions with explicit freshness boundaries. |
| `memory-status` | Script | Report manifest health, backlog risk, and retention alerts. |
| `memory-onboard-agent` | Script | Scaffold a new agent memory slice under `core/agents/`. |
| `memory-pipeline` | Script | Run extract → curate → apply → verify in order and stop on error. |
| `memory-retention` | Script | Archive stale intake, alert on backlog, and perform optional maintenance tasks. |
| `kanban-operator` | LLM | Operate the shared file-first board and resolve effective autonomy/git flow before action. |

## Quick Start

### 1. Install

```bash
openclaw plugins install ./nmc-memory-plugin
```

### 2. Setup

OpenClaw installs the plugin package under `~/.openclaw/extensions/nmc-memory-plugin/`.

On the first runtime load after install or enable, the plugin now auto-bootstraps the managed scaffold by default. Because OpenClaw does not expose an install-time lifecycle hook, this happens when the extension is loaded by the gateway/runtime, not inside the `plugins install` copy step itself.

If you want to trigger the same scaffold explicitly, or rerun it after changing plugin config, use:

```bash
openclaw nmc-memory setup
```

This creates:
- `~/.openclaw/workspace/system/`
- `~/.openclaw/workspace/system/memory/`
- `~/.openclaw/workspace/system/skills/`
- `~/.openclaw/workspace/system/tasks/`
- `~/.openclaw/workspace/system/policy/`
- `~/.openclaw/workspace/system/scripts/`
- `~/.openclaw/workspace/system/docs/`
- `~/.openclaw/workspace/nyx/`
- `~/.openclaw/workspace/medea/`
- `~/.openclaw/workspace/arx/`
- `~/.openclaw/workspace/lev/`
- `~/.openclaw/workspace/mnemo/`
- per-agent `skills -> ../system/skills` and `system -> ../system` links inside each workspace
- `~/.openclaw/agents/{nyx,medea,arx,lev,mnemo}/{agent,sessions}/`
- agent registrations plus shared `memorySearch.extraPaths` wiring in `~/.openclaw/openclaw.json`

To add routing bindings while setting up, repeat `--bind`:

```bash
openclaw nmc-memory setup \
  --bind "nyx=telegram:primary" \
  --bind "lev=slack:ops"
```

For local development from this repository, you can run the standalone script instead:

```bash
node ./nmc-memory-plugin/scripts/setup-openclaw.js \
  --state-dir ~/.openclaw \
  --bind "nyx=telegram:primary"
```

Supported setup options:

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

To disable runtime auto-bootstrap or override managed paths, configure the plugin entry in `openclaw.json`:

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

If you only need the shared memory canon without agent workspace scaffolding, you can still copy the raw template and onboard extra custom roles manually:

```bash
mkdir -p ./workspace
cp -R ~/.openclaw/extensions/nmc-memory-plugin/templates/workspace-system ./workspace/system
cp -R ~/.openclaw/extensions/nmc-memory-plugin/templates/workspace-memory ./workspace/system/memory
~/.openclaw/extensions/nmc-memory-plugin/skills/memory-onboard-agent/onboard.sh analyst
```

### 3. First Run

Run the full pipeline for a day:

```bash
./nmc-memory-plugin/skills/memory-pipeline/pipeline.sh 2026-03-05
```

Run a single phase when needed:

```bash
./nmc-memory-plugin/skills/memory-pipeline/pipeline.sh 2026-03-05 --phase verify
```

## Pipeline Overview

The consolidation flow is four phases, each with a narrow responsibility:

- **Phase A — Extract**: transcripts become candidate claims in `intake/pending/`.
- **Phase B — Curate**: claims are checked against canon and annotated with decisions.
- **Phase C — Apply**: accepted claims update canon and create a consolidation commit.
- **Phase D — Verify**: derived metadata is rebuilt in `core/meta/` and committed.

Operational automation adds two supporting scripts:

- `memory-pipeline` orchestrates the daily run.
- `memory-retention` handles weekly or quarterly housekeeping.

## Automation

### Daily Pipeline Runner

`skills/memory-pipeline/pipeline.sh` accepts a required date and an optional phase selector:

```bash
./nmc-memory-plugin/skills/memory-pipeline/pipeline.sh 2026-03-05
./nmc-memory-plugin/skills/memory-pipeline/pipeline.sh 2026-03-05 --phase apply
```

Behavior:

- Runs `memory-extract`, `memory-curate`, `memory-apply`, then `memory-verify`.
- Logs each phase with timestamps.
- Stops immediately if any phase fails.
- Prints a run summary with duration and phase status.
- If `openclaw` is unavailable for LLM phases, prints the commands it would run and exits with code `2`.

Example cron entry using the installed plugin path:

```cron
0 0 * * * cd /path/to/project && ~/.openclaw/extensions/nmc-memory-plugin/skills/memory-pipeline/pipeline.sh $(date -u +\%F)
```

### Weekly Retention

`skills/memory-retention/retention.sh` defaults to `workspace/system/memory` and supports optional maintenance flags:

```bash
./nmc-memory-plugin/skills/memory-retention/retention.sh
./nmc-memory-plugin/skills/memory-retention/retention.sh workspace/system/memory --compact-edges --archive-timeline
```

Behavior:

- Archives `intake/processed/*.md` older than 90 days into `intake/processed/archive/YYYY/MM/`.
- Prints `ALERT` lines for `intake/pending/*.md` older than 7 days.
- Rebuilds `core/meta/graph/edges.jsonl` from canonical `links[]` when `--compact-edges` is set.
- Moves timeline files older than 1 year into `core/user/timeline/archive/` when `--archive-timeline` is set.
- Creates a single git commit `memory: retention YYYY-MM-DD` when changes exist.

## Directory Structure

```text
nmc-memory-plugin/
├── openclaw.plugin.json
├── package.json
├── index.js
├── lib/
│   └── openclaw-setup.js
├── README.md
├── scripts/
│   └── setup-openclaw.js
├── skills/
│   ├── memory-extract/
│   ├── memory-curate/
│   ├── memory-apply/
│   ├── memory-verify/
│   ├── memory-query/
│   ├── memory-status/
│   ├── memory-onboard-agent/
│   ├── memory-pipeline/
│   ├── memory-retention/
│   └── kanban-operator/
└── templates/
    ├── workspace-memory/
    │   ├── core/
    │   └── intake/
    └── workspace-system/
        ├── docs/
        ├── policy/
        ├── scripts/
        └── tasks/
```

## Principles

- Canon lives in Markdown plus YAML and is versioned in git.
- `links[]` inside records are authoritative; graph exports are rebuildable.
- Timeline is append-only; corrections happen through new records.
- Runtime delta and canon must stay clearly separated.
- Maintenance scripts preserve history rather than deleting evidence.

## Verification

Run the bundled integration checks from the repository root:

```bash
./nmc-memory-plugin/tests/run-integration.sh
```

For a live workspace, validate canon integrity and backlog state with:

```bash
./nmc-memory-plugin/skills/memory-verify/verify.sh ~/.openclaw/workspace/system/memory
./nmc-memory-plugin/skills/memory-status/status.sh ~/.openclaw/workspace/system/memory
```

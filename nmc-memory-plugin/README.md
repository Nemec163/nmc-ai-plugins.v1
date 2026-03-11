# nmc-memory-plugin

Persistent OpenClaw memory plugin for maintaining a git-backed personal canon: intake, curation, canonical writes, verification, query, and operational automation.

The package is shipped in the current OpenClaw plugin format:

- `openclaw.plugin.json` declares the plugin manifest and bundled skill roots.
- `package.json` exposes the runtime entrypoint through `openclaw.extensions`.
- `skills/*/SKILL.md` files use AgentSkills-compatible YAML frontmatter.
- `templates/workspace-memory/` stays bundled as package assets for manual scaffolding.

The default workspace template ships with predefined agent slices:
- `nyx` - orchestrator and main user-facing agent, Chief Product Officer, `opus 4.6`
- `medea` - research and documentation, Chief Research Officer, `codex 5.4`
- `arx` - coding, refactor, and architecture, Chief Technology Officer, `codex 5.4`
- `lev` - heartbeat, proactivity, and kanban execution, Chief Manager Officer, `codex 5.1 mini`
- `mnemo` - canonical memory writer and maintainer, Chief Knowledge Officer, `codex 5.4`

The plugin also exposes an OpenClaw multi-agent setup command that scaffolds:
- `~/.openclaw/workspace/memory/` as the shared canon root
- `~/.openclaw/workspace/{nyx,medea,arx,lev,mnemo}/` as full per-agent workspaces
- `~/.openclaw/openclaw.json` entries under `agents.list` and optional `bindings`

## Skills

| Skill | Type | Description |
|---|---|---|
| `memory-extract` | LLM | Extract atomic memory claims from transcripts into `intake/pending/`. |
| `memory-curate` | LLM | Evaluate extracted claims against canon and annotate accept or reject decisions. |
| `memory-apply` | LLM | Apply accepted claims into canonical files and create the consolidation commit. |
| `memory-verify` | Script | Rebuild manifest metadata and append valid graph edges after apply. |
| `memory-query` | LLM | Answer canon-grounded memory questions with explicit freshness boundaries. |
| `memory-status` | Script | Report manifest health, backlog risk, and retention alerts. |
| `memory-onboard-agent` | Script | Scaffold a new agent memory slice under `core/agents/`. |
| `memory-pipeline` | Script | Run extract → curate → apply → verify in order and stop on error. |
| `memory-retention` | Script | Archive stale intake, alert on backlog, and perform optional maintenance tasks. |

## Quick Start

### 1. Install

```bash
openclaw plugins install ./nmc-memory-plugin
```

### 2. Setup

OpenClaw installs the plugin package under `~/.openclaw/extensions/nmc-memory-plugin/`. The plugin bundles the shared memory scaffold and can also create the full multi-agent workspace layout. The preferred setup path is:

```bash
openclaw nmc-memory setup
```

This creates:
- `~/.openclaw/workspace/memory/`
- `~/.openclaw/workspace/nyx/`
- `~/.openclaw/workspace/medea/`
- `~/.openclaw/workspace/arx/`
- `~/.openclaw/workspace/lev/`
- `~/.openclaw/workspace/mnemo/`
- agent registrations in `~/.openclaw/openclaw.json`

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

If you only need the shared memory canon without agent workspace scaffolding, you can still copy the raw template and onboard extra custom roles manually:

```bash
mkdir -p ./workspace
cp -R ~/.openclaw/extensions/nmc-memory-plugin/templates/workspace-memory ./workspace/memory
~/.openclaw/extensions/nmc-memory-plugin/skills/memory-onboard-agent/onboard.sh analyst
```

### 3. First Run

Run the full pipeline for a day:

```bash
nmc-memory-plugin/skills/memory-pipeline/pipeline.sh 2026-03-05
```

Run a single phase when needed:

```bash
nmc-memory-plugin/skills/memory-pipeline/pipeline.sh 2026-03-05 --phase verify
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
nmc-memory-plugin/skills/memory-pipeline/pipeline.sh 2026-03-05
nmc-memory-plugin/skills/memory-pipeline/pipeline.sh 2026-03-05 --phase apply
```

Behavior:

- Runs `memory-extract`, `memory-curate`, `memory-apply`, then `memory-verify`.
- Logs each phase with timestamps.
- Stops immediately if any phase fails.
- Prints a run summary with duration and phase status.
- If `openclaw` is unavailable for LLM phases, prints the commands it would run and exits with setup status.

Example cron entry:

```cron
0 0 * * * cd /path/to/project && ~/.openclaw/extensions/nmc-memory-plugin/skills/memory-pipeline/pipeline.sh $(date -u +\%F)
```

### Weekly Retention

`skills/memory-retention/retention.sh` defaults to `workspace/memory` and supports optional maintenance flags:

```bash
nmc-memory-plugin/skills/memory-retention/retention.sh
nmc-memory-plugin/skills/memory-retention/retention.sh workspace/memory --compact-edges --archive-timeline
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
│   └── memory-retention/
└── templates/
    └── workspace-memory/
        ├── core/
        │   ├── system/
        │   ├── user/
        │   ├── agents/
        │   └── meta/
        └── intake/
            ├── pending/
            └── processed/
```

## Principles

- Canon lives in Markdown plus YAML and is versioned in git.
- `links[]` inside records are authoritative; graph exports are rebuildable.
- Timeline is append-only; corrections happen through new records.
- Runtime delta and canon must stay clearly separated.
- Maintenance scripts preserve history rather than deleting evidence.

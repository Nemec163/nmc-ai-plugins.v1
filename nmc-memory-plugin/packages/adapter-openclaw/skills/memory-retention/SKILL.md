---
name: memory-retention
description: Run the local retention script to archive stale intake and compact derived exports.
metadata: {"openclaw":{"os":["darwin","linux"]}}
---

# memory-retention

`Skill ID`: `memory-retention`
`Type`: `script`
`Trigger`: `scheduled (weekly)` or `manual`
`Pipeline Phase`: `Maintenance`
`Entrypoint`: `{baseDir}/retention.sh`

## Purpose

Apply the operational retention policy by archiving old processed intake, surfacing pending backlog alerts, and performing optional quarterly maintenance on graph exports and old timeline files.

## System Prompt

```text
Run the retention script against the memory workspace root.

The script is a maintenance tool.
It should apply retention-safe moves, print visible alerts, and create one retention commit when changes are staged.

Expected behavior:
1. Default the memory root to workspace/system/memory when no path argument is supplied.
2. Move processed intake markdown files older than 90 days into intake/processed/archive/YYYY/MM/ using git-preserving moves.
3. Check intake/pending/ for markdown files older than 7 days and print ALERT lines when backlog exists.
4. When --compact-edges is provided, rebuild core/meta/graph/edges.jsonl from canonical links[] and replace the old export.
5. When --archive-timeline is provided, move timeline markdown files older than 1 year into timeline/archive/ using git-preserving moves.
6. Stage only the maintenance changes made by this run.
7. Create at most one git commit using the required retention commit message when changes exist.

The script must preserve canon history and avoid destructive rewrites of canonical content.
```

## Input Contract

- Optional positional argument: memory workspace root path, default `workspace/system/memory`
- Optional flag: `--compact-edges`
- Optional flag: `--archive-timeline`
- Read and write targets: `intake/pending/`, `intake/processed/`, `core/meta/graph/edges.jsonl`, and `core/user/timeline/`

## Output Contract

- Console summary of archived items, backlog alerts, optional maintenance actions, and commit status
- Moved processed intake under `intake/processed/archive/YYYY/MM/` when eligible
- Rebuilt `core/meta/graph/edges.jsonl` when compaction is requested
- Moved old timeline files under `core/user/timeline/archive/` when archival is requested
- Single git commit `memory: retention YYYY-MM-DD` when staged changes exist

## Tools

- Primary executor: `{baseDir}/retention.sh`
- Local capabilities used by the script: filesystem reads, filesystem writes, date comparison, and `git`
- No LLM runtime tools are required

## Constraints

- Do not rewrite canonical record bodies during retention.
- Do not hide backlog alerts.
- Do not create more than one retention commit per run.
- Do not treat `edges.jsonl` as the graph source of truth; canonical `links[]` remain authoritative.

## Success Criteria

- Old processed intake is archived into dated folders.
- Pending backlog older than seven days is surfaced clearly.
- Optional graph compaction rebuilds the export from canonical links.
- Optional timeline archival preserves history with git moves.
- A single retention commit is created only when maintenance changes exist.

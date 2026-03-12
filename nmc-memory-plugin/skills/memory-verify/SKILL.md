---
name: memory-verify
description: Run the local verify script to rebuild manifest metadata and export valid graph edges.
metadata: {"openclaw":{"os":["darwin","linux"]}}
---

# memory-verify

`Skill ID`: `memory-verify`
`Type`: `script`
`Trigger`: `after apply` or `manual`
`Pipeline Phase`: `Phase D — Verify`
`Entrypoint`: `{baseDir}/verify.sh`

## Purpose

Validate the post-apply canon, rebuild derived metadata, append graph edges, and commit the meta update without changing canonical meaning.

## System Prompt / Execution Contract

```text
Run the verify script against the memory workspace root.

The script is responsible for Phase D only.
It reads canonical files after a successful apply commit, derives manifest metadata, extracts valid graph edges, writes meta outputs, and creates a follow-up git commit.

It must not reinterpret records, rewrite canon, or change record bodies.
Its outputs are derived artifacts only.

Expected actions:
1. Read canonical records from core/user/**/*.md and core/agents/**/*.md.
2. Collect record_ids and record counts by type.
3. Compute checksums for canonical files.
4. Extract new links[] from canonical records changed since the last manifest.
5. Rewrite core/meta/manifest.json.
6. Append valid edges to core/meta/graph/edges.jsonl.
7. Stage core/meta/ and commit with the manifest-update commit message.

Exit code 0 means success.
Exit code 1 means warnings such as dangling edges.
Exit code 2 means verification error.
```

## Input Contract

- Required argument: path to the memory workspace root, typically `workspace/system/memory`
- Canonical input set: `core/user/**/*.md` and `core/agents/**/*.md`
- Prior derived state: existing `core/meta/manifest.json` and `core/meta/graph/edges.jsonl` when present
- Precondition: Phase C apply commit already completed or canon changes are otherwise ready to verify

## Output Contract

- Rewritten `core/meta/manifest.json`
- Appended `core/meta/graph/edges.jsonl`
- Git commit for derived meta updates, typically `memory: manifest update YYYY-MM-DD`
- Warning or error status via exit code and stdout/stderr messaging

## Tools

- Primary executor: `{baseDir}/verify.sh`
- Local capabilities used by the script: filesystem reads, filesystem writes, checksums, and `git`
- No LLM reasoning is required at runtime for this skill

## Verification Rules

- `manifest.json` is a derived snapshot and may be fully rewritten
- `edges.jsonl` is a derived append log and must exclude dangling `src` or `dst` references
- Canonical `links[]` remain the source of truth; export files never override canon
- Verification warnings must not invalidate a successful Phase C canon write
- If verification fails, canon remains valid but unmanifested until the next successful verify run

## Constraints

- Do not modify canonical record bodies during verify.
- Do not generate new canon records.
- Do not backfill missing evidence or repair semantic mistakes here.
- Do not treat `edges.jsonl` as the source of truth.
- Do not fail hard for warnings that can safely be reported as exit code `1`.

## Success Criteria

- `core/meta/manifest.json` reflects current canon state.
- `core/meta/graph/edges.jsonl` gains only valid new edges.
- A follow-up git commit captures the derived meta update.
- The script exits with the correct status for success, warning, or error.

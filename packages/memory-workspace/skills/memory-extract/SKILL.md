---
name: memory-extract
description: Extract one day of transcript-backed memory claims into intake/pending.
---

# memory-extract

`Skill ID`: `memory-extract`
`Type`: `llm`
`Trigger`: `schedule` daily at `00:00` or `manual`
`Pipeline Phase`: `Phase A — Extract`
`Workspace Scope`: all paths are relative to the memory workspace root unless explicitly absolute

## Purpose

Convert one day of OpenClaw session transcripts into a clean intake batch of atomic claims.
This skill prepares material for curation; it does not judge canon-worthiness and does not write canon.

## System Prompt

```text
You are the OpenClaw Memory Extractor.

Follow the Phase A contract from core/system/curator-runbook.md.
Your job is to read session transcripts for one requested date and write atomic claims into intake/pending/YYYY-MM-DD.md.

Work transcript-first and transcript-only.
Do not load canon files, do not compare against canon, and do not perform curation.
You are not deciding duplicates against knowledge/state/identity/agents; you are only extracting observations faithfully.

Emit one atomic observation per claim.
Use deterministic claim IDs in the form claim-YYYYMMDD-NNN.
Sort source transcript paths lexicographically, preserve transcript order inside each file, and number claims sequentially.
If resuming an existing pending file for the same date, continue from the highest existing claim number and never renumber old claims.

Each claim must include claim_id, source_session, source_agent, observed_at, confidence, tags, target_layer, and target_domain.
Use target_layer only as a routing hint for later curation.
Summaries must stay faithful to the transcript and preserve enough detail for later review.

Skip greetings, filler, pure meta-conversation, formatting chatter, and other non-durable noise.
If one message contains several durable observations, split them into separate claims.
If the same observation repeats in one session, extract it once.

Use transcript timestamps when available.
Prefer RFC3339 UTC timestamps already present in the source.
Do not invent timezone conversions or stronger certainty than the transcript supports.

Your output is only the intake markdown file.
Do not annotate accept/reject/defer decisions.
Do not write canonical records.
Do not touch manifest, edges, or git.
```

## Input Contract

- Required parameter: `date` as `YYYY-MM-DD` or an equivalent runtime alias such as `today`
- Source files: `~/.openclaw/agents/*/sessions/*.jsonl` matching the requested date
- Optional resume input: existing `intake/pending/YYYY-MM-DD.md`
- Readable context is limited to transcript files and the same-date pending batch when resuming
- Expected transcript facts: session path, agent name, event order, event timestamps, user/assistant content

## Output Contract

- Primary output file: `intake/pending/YYYY-MM-DD.md`
- File format: repeated blocks of `## claim-*` heading, YAML metadata, and free-text claim body
- Claim metadata must include: `claim_id`, `source_session`, `source_agent`, `observed_at`, `confidence`, `tags`, `target_layer`, `target_domain`
- The file may be created new or appended in-place during resume
- The file must remain curation-ready and contain no curator annotations

## Tools

- `glob`: locate transcript files for the requested date and detect an existing pending batch
- `file_read`: read transcript JSONL files and inspect an existing pending batch during resume
- `file_write`: create or update `intake/pending/YYYY-MM-DD.md`

## Procedure

1. Resolve the batch date.
2. Discover matching transcript files under `~/.openclaw/agents/*/sessions/*.jsonl`.
3. If `intake/processed/YYYY-MM-DD.md` already exists, treat the date as already extracted unless explicitly rerunning.
4. If `intake/pending/YYYY-MM-DD.md` exists, read the highest existing claim number and latest captured `observed_at`.
5. Read transcripts in deterministic order and extract atomic observations only.
6. Write claims into `intake/pending/YYYY-MM-DD.md` using deterministic IDs and transcript-backed metadata.
7. Stop when every relevant transcript observation for the date is represented once.

## Constraints

- Do not load `core/user/state/current.md`.
- Do not load `core/user/identity/current.md`.
- Do not load `core/user/knowledge/*.md`.
- Do not load `core/agents/**/*.md`.
- Do not load prior timeline files for semantic comparison.
- Do not reject claims because they might later duplicate canon.
- Do not write curator decisions, draft record IDs, or final markdown envelopes.
- Do not modify anything outside `intake/pending/YYYY-MM-DD.md`.

## Success Criteria

- The batch file exists at `intake/pending/YYYY-MM-DD.md`.
- Every claim is atomic, transcript-backed, and correctly formatted.
- Claim numbering is deterministic and stable across resume.
- The batch is ready for `memory-curate` without reopening transcripts.

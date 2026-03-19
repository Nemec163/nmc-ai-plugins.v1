---
schema_version: "1.0"
life_day_timezone: "Europe/Moscow"
canon_scope: "workspace/system/memory/core/*"
single_writer: "mnemo"
created_at: "2026-03-01T00:00:00Z"
---
# Workspace Memory Canon

This file defines the normative rules for canonical memory under `workspace/system/memory/core/*`.
If prompts, scripts, indexes, or habits conflict with this file, this file wins.

## Core Principles
1. **Markdown + YAML in git is the source of truth.** Canon lives in readable markdown with machine-readable YAML. Indexes, manifests, and exports are derived caches.
2. **Single writer.** Only `mnemo` writes canon. All other agents are readers or delegated consumers.
3. **Evidence first.** No durable record is valid without anchored evidence.
4. **Append-only timeline.** L2 history is corrected by new records, not silent rewrites.
5. **Runtime is not canon.** Session context, runtime memory, and intake stay non-canonical until Mnemo consolidation.

## Record Contract
Every canonical record must be stable, anchored, and machine-readable.

### Required Fields
| Field | Required | Meaning |
|------|----------|---------|
| `record_id` | yes | Stable record identifier |
| `type` | yes | `event`, `fact`, `state`, `identity`, `competence`, or `procedure` |
| `summary` | yes | One-line human summary |
| `evidence` | yes | YAML array of anchored references |
| `confidence` | yes | `low`, `medium`, or `high` |
| `status` | yes | Lifecycle state |
| `updated_at` | yes | Last canonical write timestamp in UTC |

### Type-Specific Fields
| Field | event | fact | state | identity | competence | procedure |
|------|-------|------|-------|----------|------------|-----------|
| `as_of` | no | no | required | required | no | no |
| `supersedes` | no | optional | optional | optional | optional | optional, recommended from v2+ |
| `domain` | optional | required | optional | no | required | no |
| `links` | optional | optional | recommended | recommended | optional | optional |
| `tags` | optional | optional | optional | optional | optional | optional |
| `role` | no | no | no | no | required | required |
| `procedure_key` | no | no | no | no | no | required |
| `version` | no | no | no | no | no | required |
| `acceptance` | no | no | no | no | no | required |
| `feedback_refs` | no | no | no | no | no | optional |

### Record ID Prefixes
- `evt-` for `event`
- `fct-` for `fact`
- `st-` for `state`
- `id-` for `identity`
- `cmp-` for `competence`
- `prc-` for `procedure`

Required format: `{prefix}-{YYYY-MM-DD}-{NNN}`

Examples:
- `evt-2026-03-05-001`
- `fct-2026-03-05-004`
- `st-2026-03-05-002`
- `id-2026-03-05-001`
- `cmp-2026-03-05-003`
- `prc-2026-03-05-001`

Published identifiers are stable and must never be silently reassigned.

### Confidence
- `low`: weak or isolated signal
- `medium`: reliable inference from one strong source or several aligned signals
- `high`: multiple independent signals or very strong direct evidence

Confidence is assigned by Mnemo and may be revised when new evidence appears.

### Status
Allowed `event` statuses: `active`, `corrected`, `retracted`.
Allowed `fact`, `state`, `identity`, `competence`, `procedure` statuses: `active`, `deprecated`, `retracted`.
Status changes preserve history; they do not erase prior canonical records.

### Field Semantics
- `evidence` entries must be file paths plus `#anchor`
- `as_of` means when a state or identity statement became true
- `supersedes` points to the record replaced by the current one
- `domain` groups stable knowledge by area such as `work` or `health`
- `role` binds competence memory to an agent role
- `procedure_key` is the stable lineage key across procedure versions
- `version` is the canonical procedure version number for a given `procedure_key`
- `acceptance` lists concrete checks that keep a procedure bounded and reviewable
- `feedback_refs` preserves non-authoritative runtime feedback lineage without making runtime the source of truth
- `links` declares typed graph relationships
- `tags` are optional labels, not a substitute for `domain`

## Markdown Envelope
Every canonical record uses the same envelope shape.

```md
<a id="evt-2026-03-05-001"></a>
### evt-2026-03-05-001
---
record_id: evt-2026-03-05-001
type: event
summary: "User decided to change jobs"
evidence:
  - "intake/pending/2026-03-05.md#claim-003"
confidence: high
status: active
updated_at: "2026-03-05T10:15:30Z"
---
Details: user reviewed options, discussed trade-offs, and made a decision.
```

Envelope invariants:
- One anchor per record
- One `###` heading per record using the same `record_id`
- One YAML block between `---` markers
- Free-form markdown body after YAML for detail and context
- Anchors must be unique across the canon
- Evidence must target anchors, not headings alone

The YAML block is the machine contract. The prose body is the human and LLM context layer.

## Timestamps
All machine timestamps in canon use RFC3339 UTC with a trailing `Z`.

Examples:
- `2026-03-05T10:15:30Z`
- `2026-03-05T00:00:00Z`

Rules:
- `updated_at` is required on every canonical record
- `as_of` is required on every `state` and `identity` record
- Machine timestamps must be timezone-unambiguous
- Local time may appear in prose, but not as a replacement for machine timestamps

Partitioning:
- Timeline partitioning uses `life_day_timezone`
- Intake partitioning uses the UTC date of `observed_at`
- Manifest and graph timestamps remain UTC

Interpretation:
- `updated_at` means when the canon was written
- `as_of` means when the modeled statement became true
- A newer `updated_at` does not imply a newer real-world event

## Layer Definitions L0-L5
The memory model uses six conceptual layers. Only L2-L5 are canonical user-memory layers.

| Layer | Name | Purpose | Writer | Storage | Key Invariant |
|------|------|---------|--------|---------|---------------|
| L0 | Working Memory | Current session context | any agent | runtime only | ephemeral, never source of truth |
| L1 | Candidates Inbox | Raw extracted claims | extractor | `intake/pending/` | temporary until processed |
| L2 | Episodic Timeline | What happened | mnemo | `core/user/timeline/` | append-only event history |
| L3 | Semantic Knowledge | What is known | mnemo | `core/user/knowledge/` | durable facts require evidence |
| L4 | Identity | Who the user is | mnemo | `core/user/identity/` | rare updates with high evidence threshold |
| L5 | State | What is true now | mnemo | `core/user/state/` | evidence-backed projection of reality |

Layer notes:
- L0 may contain assumptions, plans, and temporary reasoning
- L1 may contain noise, duplicates, and unresolved claims
- L2 records events by day and never rewrites history silently
- L3 stores durable facts and supports revision through `supersedes`
- L4 stores identity statements and identity evolution
- L5 stores current canonical state, not speculative real-time truth

Freshness contract:
- `state/current.md` means current as of the last successful consolidation
- Same-day delta may still exist only in runtime or intake
- Agents answering “now” questions must distinguish canon from runtime delta

## Knowledge Graph Contracts
Graph semantics are defined inside canonical records. `meta/graph/edges.jsonl` is a derived cache, not the source of truth.

### Source of Truth
- `links[]` inside records is authoritative
- `meta/graph/edges.jsonl` is rebuildable from canonical files
- Missing or stale exports never override in-record links

### Supported Relations
Schema `1.0` recognizes:
- `derived_from`
- `supersedes`
- `supports`
- `caused`
- `updated`

Example:
```yaml
links:
  - rel: derived_from
    target: "evt-2026-03-05-001"
  - rel: supersedes
    target: "st-2026-02-10-004"
```

### Export Contract
`edges.jsonl` uses incremental append during consolidation.

```json
{"batch":"2026-03-05","src":"evt-2026-03-05-001","rel":"caused","dst":"st-2026-03-05-001","at":"2026-03-05"}
{"batch":"2026-03-05","src":"st-2026-03-05-001","rel":"derived_from","dst":"evt-2026-03-05-001","at":"2026-03-05"}
```

Graph rules:
- Export only edges whose `src` and `dst` resolve to canonical `record_id` values
- Treat dangling references as warnings, not fatal write blockers
- Do not emit dangling edges into `edges.jsonl`
- Rebuild the export quarterly from all canonical `links[]`

## Retention Policy
- L0 working memory is ephemeral and may be discarded at any time
- `intake/pending/` must not accumulate beyond 7 days without alerting
- `intake/processed/` is retained 90 days, then archived into `processed/archive/YYYY/MM/`
- Canonical `core/*` content is retained indefinitely in git history
- `meta/graph/edges.jsonl` is compacted quarterly from canonical links
- Timeline files older than 1 year may move to `timeline/archive/` with history-preserving moves
- Quarterly summaries may exist for navigation, but are not evidence sources

Archival must preserve referential integrity. If paths change because of archival, evidence links must remain valid.

## Access Model
Access control in schema `1.0` is convention-based and enforced through prompts, runbooks, and tool setup.

| Profile | Canon Read | Canon Write | Intake | Transcripts |
|--------|------------|-------------|--------|-------------|
| Mnemo (Chief Knowledge Officer) | full | full | read and write | read |
| Orchestrator | full | none | none | none |
| Role Agent | own role slice only | none | none | none |

Rules:
- `mnemo` is the only canonical writer
- Orchestrator may read the full canon to build context
- Role agents default to `core/agents/<own-role>/` only
- Access to `user/*` must be explicitly selected and passed by the orchestrator
- Future tool-level ACLs may harden enforcement without changing canonical semantics

To add a new agent role:
1. Create `core/agents/<role>/`
2. Add `COURSE.md`, `PLAYBOOK.md`, `PITFALLS.md`, and `DECISIONS.md`
3. Register the role in `core/agents/_index.md`
4. Configure the role with the correct access profile

## Migration Rules
This file is the canonical schema marker for workspace memory. `schema_version` follows `MAJOR.MINOR`.

Compatibility rules:
- Minor changes may add optional fields or clarify behavior
- Minor changes must not invalidate old records that omit new optional fields
- Major changes may rename fields, change required semantics, or require full rewrites
- Major changes require an explicit migration before the canon is valid under the new version

Major migration procedure:
1. Create git tag `pre-migration-v{OLD}`
2. Write `core/system/migrations/migrate-{OLD}-to-{NEW}.md`
3. Execute the migration with a script or controlled Mnemo session
4. Re-run verification to rebuild manifest and graph outputs
5. Commit migrated canon and create git tag `post-migration-v{NEW}`

Migration invariants:
- Preserve evidence links whenever possible
- Keep record identity stable unless the migration explicitly rewrites IDs
- Any ID rewrite must be total, deterministic, and documented
- Migration scripts must not silently drop records
- The migrated canon must pass verification under the target schema version

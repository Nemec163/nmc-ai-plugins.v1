---
role: mnemo
type: runbook
schema_version: "1.0"
updated_at: "{{INSTALL_DATE}}"
---
# Mnemo Runbook
This is the single operational document for Mnemo.
If Mnemo can read this file and `core/system/CANON.md`, it can operate the full memory consolidation pipeline after a fresh `git clone`.
Normative precedence:
1. `core/system/CANON.md` defines invariants, schema, and non-negotiable memory laws.
2. This runbook defines operating procedure, sequencing, examples, and recovery rules.
3. If this runbook and `CANON.md` ever conflict, `CANON.md` wins.
Mnemo is the single writer to canonical memory under `workspace/system/memory/core/*`.
All other agents are readers, consumers, or transcript sources.
---

## 1. Overview
### 1.1 Purpose and scope
This runbook is the full operational manual for Mnemo. It describes how to extract claims from raw transcripts, curate them against canon, apply accepted records into canonical files, recover from interruption, and maintain retention hygiene over time.
This file is intentionally self-contained. It includes the phase boundaries, file targets, formatting rules, claim examples, decision examples, conflict rules, checkpoint handling, retention duties, and the final post-apply checklist.
You should be able to use this document without hidden prompts, external playbooks, or unwritten conventions. The only normative companion document is `core/system/CANON.md`, which defines the canonical invariants and record contract.
### 1.2 What “autonomous after clone” means
After a fresh clone, Mnemo must be able to:
- find the transcript source tree at `~/.openclaw/agents/*/sessions/*.jsonl`,
- create or update `intake/pending/YYYY-MM-DD.md`,
- read relevant canon files under `core/user/` and `core/agents/`,
- write canonical records in correct markdown envelope format,
- move processed intake into `intake/processed/`,
- preserve restart safety using `intake/_checkpoint.yaml`,
- create a consolidation git commit,
- leave the repository ready for script-based verification.
Autonomy here does not mean uncontrolled creativity. It means Mnemo can run the prescribed pipeline conservatively, deterministically where possible, and without missing critical operating rules.
### 1.3 Constant operating laws
Keep these laws active in every phase:
- Markdown plus YAML in git is the source of truth.
- Only Mnemo writes canonical memory.
- Evidence is mandatory for all durable records.
- The timeline layer is append-only.
- Runtime context is not canon.
- Each LLM phase has a narrow context boundary.
- Identity changes require a higher evidence threshold than ordinary facts.
- State is a current projection, not speculative real-time truth.
- Anchors are required for canonical records because evidence targets anchors, not headings alone.
### 1.4 Memory model refresher
| Layer | Name | Meaning | Writer | Canonical |
|------|------|---------|--------|-----------|
| L0 | Working Memory | active session context | any agent | no |
| L1 | Candidates Inbox | extracted claims waiting for judgment | extractor/mnemo | no |
| L2 | Episodic Timeline | what happened | mnemo | yes |
| L3 | Semantic Knowledge | durable facts | mnemo | yes |
| L4 | Identity | who the user is | mnemo | yes |
| L5 | State | what is true now | mnemo | yes |
Fast interpretation:
- transcripts become claims in L1,
- accepted claims become records in L2 through L5 or agent competence memory,
- rejected claims never enter canon,
- deferred claims remain visible for later cycles.
### 1.5 Path map
Use these paths consistently and memory-root-relative unless a transcript path is inherently absolute:
| Purpose | Path |
|--------|------|
| Canon invariants | `core/system/CANON.md` |
| This runbook | `core/system/curator-runbook.md` |
| Raw extracted batches | `intake/pending/` |
| Completed batches | `intake/processed/` |
| Apply checkpoint | `intake/_checkpoint.yaml` |
| Timeline | `core/user/timeline/` |
| Knowledge domains | `core/user/knowledge/` |
| Current identity | `core/user/identity/current.md` |
| Identity history | `core/user/identity/changelog.md` |
| Current state | `core/user/state/current.md` |
| Agent competence memory | `core/agents/<role>/` |
| Derived manifest | `core/meta/manifest.json` |
| Derived graph export | `core/meta/graph/edges.jsonl` |
Transcript input source:
- `~/.openclaw/agents/*/sessions/*.jsonl`
### 1.6 Phase boundaries are mandatory
Phase A loads transcripts only. It does not load canon.
Phase B loads claims plus relevant canon. It does not load transcripts.
Phase C loads curated claims plus only the target files required for writing. It does not load transcripts and it does not load the full canon.
This separation is cognitive, not decorative. Extraction quality drops when canon is mixed into transcript reading. Apply quality drops when raw transcript analysis is mixed into serialization work.
### 1.7 Published identifiers
Canonical record ID prefixes are fixed:
- `evt-` for `event`
- `fct-` for `fact`
- `st-` for `state`
- `id-` for `identity`
- `cmp-` for `competence`
Required format:
- `{prefix}-{YYYY-MM-DD}-{NNN}`
Examples:
- `evt-2026-03-05-001`
- `fct-2026-03-05-002`
- `st-2026-03-05-001`
- `id-2026-03-05-001`
- `cmp-2026-03-05-001`
Claim IDs use a similar but distinct format:
- `claim-YYYYMMDD-NNN`
### 1.8 Confidence levels
Use only `low`, `medium`, or `high`.
Use `low` for tentative, isolated, weakly specified, or highly inferential signals.
Use `medium` for a strong single observation or several aligned weak signals.
Use `high` for multiple independent signals, direct explicit durable statements, or concrete strongly evidenced outcomes.
Phase A confidence is extraction confidence about the observation. Final canonical confidence is assigned by curation and carried into apply.
### 1.9 Decision vocabulary
Every claim in Phase B must end with one decision:
- `accept`
- `reject`
- `defer`
`accept` means the claim is ready to produce a canonical record draft.
`reject` means the claim should not enter canon.
`defer` means the claim may matter later but is not yet strong enough or clear enough to write safely.
### 1.10 Practical posture
Mnemo is conservative, evidence-first, and explicit about uncertainty. Do not guess missing evidence. Do not upgrade weak signals into identity changes. Do not let one malformed claim block the whole batch. Do not silently rewrite historical events.
When in doubt, prefer one of these:
- extract narrowly rather than summarize vaguely,
- reject noise rather than canonize chatter,
- defer identity changes rather than overfit mood,
- append correction events rather than rewrite the past,
- keep anchors intact rather than cleaning aggressively.
### 1.11 Startup checklist before any cycle
Before running a consolidation cycle:
1. Read `core/system/CANON.md`.
2. Read this runbook.
3. Determine the batch date.
4. Confirm transcript paths are available.
5. Confirm `intake/pending/` and `intake/processed/` exist.
6. Confirm the workspace is writable.
7. Confirm no unresolved apply checkpoint is being ignored.
If `intake/_checkpoint.yaml` exists, do not start a fresh apply blindly. Follow Section 6 first.
### 1.12 End-state of a healthy cycle
A healthy cycle leaves the repository with:
- a complete extracted intake file for the batch,
- one explicit curator decision per claim,
- accepted claims written into canon,
- unresolved work clearly marked and preserved,
- processed intake moved appropriately,
- no leftover checkpoint after successful commit,
- a valid apply commit ready for verification.
---

## 2. Phase A: Extract
### 2.1 Goal
Phase A extracts atomic claims from session transcripts. It does not compare to canon, decide duplicates, or write final records. It creates a clean intake batch so Phase B can judge without needing to reread the transcripts.
The extraction standard is simple: one atomic observation per claim, enough context to understand the observation later, and no canon reasoning mixed into the claim body.
### 2.2 Input, output, context
| Item | Value |
|------|-------|
| Goal | extract atomic claims from session transcripts |
| Input | `~/.openclaw/agents/*/sessions/*.jsonl` for a given date |
| Output | `intake/pending/YYYY-MM-DD.md` |
| Context rule | load transcripts only, not canon |
If you are extracting for `2026-03-05`, the output file is `intake/pending/2026-03-05.md`.
### 2.3 What to read before extraction
During extraction you may read:
- transcript files for the chosen date,
- an already existing `intake/pending/YYYY-MM-DD.md` if you are resuming,
- the highest existing claim number in that file,
- the latest already captured `observed_at` timestamp for that date.
During extraction you must not load:
- `core/user/state/current.md`
- `core/user/identity/current.md`
- `core/user/knowledge/*.md`
- `core/agents/**/*.md`
- prior timeline files for semantic comparison
### 2.4 Claim format
Each claim is a level-2 heading, then a YAML metadata block, then a free-text body.
Required claim fields:
- `claim_id`
- `source_session`
- `source_agent`
- `observed_at`
- `confidence`
- `tags`
- `target_layer`
- `target_domain`
Full example:

```md
## claim-20260305-001
---
claim_id: claim-20260305-001
source_session: "~/.openclaw/agents/trader/sessions/2026-03-05-abc.jsonl"
source_agent: trader
observed_at: "2026-03-05T14:30:00Z"
confidence: medium
tags: [trading, strategy, volatility]
target_layer: agent
target_domain: trader
---
Trader observed that the momentum strategy on small timeframes becomes systematically unprofitable during high-volatility periods and should not be reused without a separate volatility filter.
```

### 2.5 Meaning of claim fields
`claim_id` is the stable per-batch identifier later used in evidence links.
`source_session` is the exact session path, preferably absolute as seen under `~/.openclaw/...`, because ambiguity is harmful and shortening is not helpful.
`source_agent` is the role or agent name, usually derivable from the source path.
`observed_at` should be the most specific reliable timestamp available in the transcript event. Prefer RFC3339 UTC. If the transcript does not expose a fine-grained event time, use the best transcript-level timestamp available. Do not invent timezone conversions.
`confidence` in Phase A is about how clearly the transcript expresses the observation, not final canonical confidence.
`tags` should be sparse, lowercase, and concrete. Good tags are short handles like `work`, `health`, `interview`, `pitfall`, `identity`, `focus`, `travel`.
`target_layer` is a hint for the curator, not a commitment. It may be one of `L2`, `L3`, `L4`, `L5`, or `agent`.
`target_domain` is the probable domain or role destination, such as `work`, `health`, `finance`, `preferences`, `skills`, `social`, or a role like `trader`.
### 2.6 Extraction rules
Apply these rules in every extraction run:
1. Extract one atomic observation per claim.
2. Skip greetings, filler, and pure meta-conversation.
3. If one message contains several distinct observations, split them.
4. If the same observation is repeated several times in one session, extract it once.
5. Summarize faithfully; do not add canon reasoning or dedup language.
6. `target_layer` is a routing hint only.
7. Preserve enough context in the body to support later curation.
8. Do not suppress a meaningful claim because you suspect it may later be rejected.
9. Prefer direct wording over abstract reinterpretation.
10. Do not compress a whole session into one paragraph claim.
### 2.7 Deterministic claim IDs within a run
Claim IDs must be deterministic within a single run. Use this procedure:
1. Sort source transcript paths lexicographically.
2. Within each transcript, preserve transcript order.
3. Emit claims in the order observations appear.
4. Number sequentially using `NNN` starting at `001`.
If you are resuming an existing pending file for the same date:
- read the highest existing claim number,
- continue from the next number,
- never renumber claims already written.
Determinism matters because later evidence anchors depend on stable claim IDs.
### 2.8 Tracking the last processed session timestamp
To avoid re-extraction, track the last processed session timestamp. The minimum rule is:
1. If `intake/pending/YYYY-MM-DD.md` exists, inspect the claims already written.
2. Determine the highest `observed_at` already present for the batch.
3. Skip transcript observations already covered at or before that point unless there is a clear gap.
4. If timestamps tie, break the tie with `source_session` path and transcript order.
If `intake/processed/YYYY-MM-DD.md` already exists, treat the date as already extracted unless you were explicitly asked to re-run extraction.
### 2.9 How to choose `target_layer`
Choose `L2` when the claim is mainly a dated event, action, milestone, interaction, or decision that belongs on the timeline.
Choose `L3` when the claim is mainly a durable fact, preference, recurring pattern, or stable knowledge about the user.
Choose `L4` when the claim appears to express a broad self-concept, role identity, or durable identity shift. Use this sparingly because the curator may later defer it.
Choose `L5` when the claim appears to express current status, current condition, active obligation, current location, or present reality.
Choose `agent` when the claim is role competence memory: a lesson, procedure, pitfall, or decision rationale belonging to an agent.
### 2.10 What usually counts as extractable
Extractable observations often include:
- explicit user decisions,
- confirmed appointments,
- accepted offers, starts, endings, and milestones,
- stable preferences or constraints,
- recurring work habits,
- current obligations and active situations,
- competence lessons from role agents,
- operating procedures,
- pitfalls and anti-patterns,
- strong self-statements that may later become identity memory.
### 2.11 What usually does not count as extractable
Usually skip:
- greetings,
- politeness only,
- “thanks, that helps,”
- chain-of-thought scaffolding that adds no durable observation,
- token-limit remarks,
- formatting instructions,
- assistant restatements that add nothing new,
- vague emotional coloring with no concrete statement,
- entire session recaps masquerading as a single claim.
### 2.12 Extraction confidence guidance
Use `high` when the statement is directly and clearly expressed in the transcript.
Use `medium` when the observation is strong but partly summarized or mildly interpretive.
Use `low` when the signal is tentative, partial, or easy to overread.
A low-confidence claim is still worth extracting if it is specific enough to review later.
### 2.13 Good claim example: event

```md
## claim-20260305-004
---
claim_id: claim-20260305-004
source_session: "~/.openclaw/agents/orchestrator/sessions/2026-03-05-z7p.jsonl"
source_agent: orchestrator
observed_at: "2026-03-05T09:10:14Z"
confidence: high
tags: [work, interview, scheduling]
target_layer: L2
target_domain: work
---
User confirmed a technical interview with Northstar Labs for 2026-03-08 at 15:00 UTC.
```

Why it is good:
- one concrete event,
- specific time,
- durable later value,
- easy to curate into timeline or state.
### 2.14 Good claim example: fact

```md
## claim-20260305-007
---
claim_id: claim-20260305-007
source_session: "~/.openclaw/agents/orchestrator/sessions/2026-03-05-z7p.jsonl"
source_agent: orchestrator
observed_at: "2026-03-05T09:24:33Z"
confidence: medium
tags: [work, preference, productivity]
target_layer: L3
target_domain: preferences
---
User prefers deep technical work in uninterrupted morning blocks and avoids meetings before noon when possible.
```

Why it is good:
- a durable preference,
- not tied to one day only,
- reusable in future planning,
- specific enough for `knowledge/preferences.md`.
### 2.15 Good claim example: competence

```md
## claim-20260305-011
---
claim_id: claim-20260305-011
source_session: "~/.openclaw/agents/trader/sessions/2026-03-05-rsk.jsonl"
source_agent: trader
observed_at: "2026-03-05T14:30:00Z"
confidence: high
tags: [trader, pitfall, volatility, momentum]
target_layer: agent
target_domain: trader
---
Trader concluded that momentum entries on small timeframes should be avoided during high-volatility regimes unless a separate volatility filter confirms the setup.
```

Why it is good:
- it is durable agent memory,
- it describes a usable pitfall,
- it is neither chat filler nor a one-off emotion,
- it has a clear agent destination.
### 2.16 What not to extract: noise
Bad source text:

```text
Hello, thank you, that was helpful, let us continue tomorrow.
```

Why not:
- no durable observation,
- no future operational value,
- just session flow.
### 2.17 What not to extract: vague overreach
Bad source text:

```text
User might be changing as a person and maybe wants something different now.
```

Why not:
- too vague,
- collapses several possible meanings,
- invites identity overreach,
- should be replaced by a concrete observation or skipped.
### 2.18 Extraction procedure
Use this procedure:
1. Determine the batch date.
2. Locate matching transcripts for that date.
3. Sort transcript paths.
4. Check whether a pending batch for the same date already exists.
5. Resume numbering and watermark if needed.
6. Read transcripts in order.
7. Extract atomic claims only.
8. Write them into `intake/pending/YYYY-MM-DD.md`.
9. Confirm all required fields are present.
10. Stop. Do not curate yet.
### 2.19 Quality control before leaving Phase A
Before you leave Phase A, check:
- every claim has exactly one main observation,
- every claim has all required YAML fields,
- claim IDs are unique and sequential,
- timestamps are in RFC3339 UTC when available,
- there are no obvious greeting-only or filler claims,
- no claim body contains curation judgment like “duplicate” or “contradicts canon”.
### 2.20 Common Phase-A mistakes
Do not:
- summarize a whole session as one claim,
- mix several facts into a single claim,
- load canon to decide what matters,
- overpromote weak self-statements into identity claims without specificity,
- re-extract the same late transcript chunk because the watermark was ignored.
### 2.21 Completion criteria
Phase A is complete when the pending batch exists, contains only extracted claims, and is ready for curation without reopening the transcripts.
---

## 3. Phase B: Curate
### 3.1 Goal
Phase B evaluates claims against canon and assigns one explicit decision per claim: `accept`, `reject`, or `defer`. It prepares draft canonical intent but does not yet write canonical records.
This is the judgment phase. Its job is to separate durable memory from noise, duplication, ambiguity, and insufficient evidence.
### 3.2 Input, output, context
| Item | Value |
|------|-------|
| Goal | evaluate claims against canon and decide what to do |
| Input | `intake/pending/*.md` and relevant canon files |
| Output | annotated intake with accept/reject/defer decisions |
| Context rule | load claims plus relevant canon, not transcripts |
Relevant canon usually means only the files needed for the destination layer in question. Load narrowly.
### 3.3 What to read in Phase B
Possible inputs include:
- `core/user/state/current.md`
- `core/user/identity/current.md`
- `core/user/identity/changelog.md`
- one or more `core/user/knowledge/*.md` files
- specific timeline day files if an event duplicate or correction must be checked
- `core/agents/<role>/*.md` for competence memory
Do not reopen transcripts in this phase. If a claim lacks enough detail to judge, defer or reject based on what is available.
### 3.4 Decision contract
Every claim gets exactly one of these outcomes:
`accept` means the claim should produce a record draft with a destination type and file.
`reject` means the claim should not enter canon. Typical reasons: `noise`, `duplicate`, `insufficient_evidence`, `not_durable`.
`defer` means the claim is plausible but should wait. Typical reasons: `needs_more_evidence`, `conflict_needs_review`, `identity_threshold_not_met`.
### 3.5 Annotation format
Append the decision to each claim using a YAML block under a literal subheading:

```md
### curator-annotation
---
decision: accept
target_type: competence
target_file: "core/agents/trader/PITFALLS.md"
draft_record_id: "cmp-2026-03-05-001"
draft_summary: "Avoid momentum entries on small timeframes during high volatility without a volatility filter"
reason: "Direct durable role learning; not already represented"
supersedes: null
draft_confidence: high
links: []
notes_for_apply: "Append as PITFALLS record"
---
```

Reject example:

```md
### curator-annotation
---
decision: reject
reason: noise
existing_record_id: null
notes_for_apply: null
---
```

Defer example:

```md
### curator-annotation
---
decision: defer
reason: identity_threshold_not_met
related_record_id: "id-2026-02-10-001"
review_trigger: "Require repeated explicit evidence across sessions"
notes_for_apply: null
---
```

### 3.6 What makes a claim acceptable
A claim is usually acceptable when it is specific, durable enough for canon, not already represented without meaningful change, and has enough evidence strength for its target layer.
Accept claims when you can answer all of these positively:
- what exact record type is this,
- where exactly should it be written,
- what one-line summary should represent it,
- is it distinct from existing canon,
- is there enough evidence for that layer,
- if it changes an existing record, what does it supersede.
### 3.7 What makes a claim rejectable
Reject claims when they should not become canon even if future runs revisit them. Typical reject reasons:
- `noise` for greetings, pure politeness, or meta-flow,
- `duplicate` when the same meaning and evidence are already in canon,
- `not_durable` when the content is too fleeting to matter,
- `insufficient_evidence` when the claim as written is too weak and unlikely to improve meaningfully.
If you reject as duplicate, include the existing `record_id`.
### 3.8 What makes a claim deferrable
Defer claims when the idea may become canonical later but is not ready now. Typical defer cases:
- identity changes with only one weak signal,
- state changes with unclear recency,
- contradictory facts with similar evidence strength,
- ambiguous claims that need another confirming session,
- claims that may become durable once repeated.
### 3.9 Choosing the target type
Use `event` when the claim is best represented as something that happened at a time.
Use `fact` when the claim is a durable truth best stored in a domain knowledge file.
Use `state` when the claim changes what is true now in `state/current.md`.
Use `identity` when the claim changes how the user should be modeled at the identity layer and the evidence threshold is met.
Use `competence` when the claim belongs to agent role memory.
### 3.10 Choosing the target file
Use these mappings:
- `event` -> `core/user/timeline/YYYY/MM/DD.md`
- `fact` -> `core/user/knowledge/{domain}.md`
- `state` -> `core/user/state/current.md`
- `identity` -> `core/user/identity/current.md` plus `core/user/identity/changelog.md` during apply
- `competence` -> `core/agents/{role}/{COURSE|PLAYBOOK|PITFALLS|DECISIONS}.md`
### 3.11 Choosing the competence memory file
Use `COURSE.md` for conceptual domain knowledge and reusable understanding.
Use `PLAYBOOK.md` for procedures, checklists, and repeatable action sequences.
Use `PITFALLS.md` for mistakes, anti-patterns, unsafe conditions, and failure signatures.
Use `DECISIONS.md` for durable choices, strategy rationales, and trade-off records.
### 3.12 Conflict rules in curation
If a new fact contradicts existing canon, compare evidence strength, specificity, recency, and confidence. If the new claim clearly wins, accept it with a superseding draft. If the evidence is mixed or the conflict is not cleanly resolvable, defer.
If a claim is a semantic duplicate, reject with the existing `record_id`.
If a claim is identity-relevant but not strong enough, defer rather than accept.
### 3.13 Duplicate detection guideline
A claim is usually duplicate when the same meaning is already present with the same or stronger evidence and no new practical distinction. “Same summary + same evidence” is the strongest duplicate signal, but semantic sameness matters more than exact wording.
### 3.14 Identity threshold guideline
Identity is expensive to change. Accept an identity draft only when the wording is explicit, durable in scope, and preferably supported by multiple independent sources or repeated confirmation. One late-session remark, one emotional burst, or one highly ambiguous statement is not enough.
### 3.15 State threshold guideline
State changes require clear present-tense relevance. A dated event may imply a state change, but do not force one claim into two records unless the evidence truly supports both. If the claim is really just a dated event, accept it as an event and let later consolidation update state if needed.
### 3.16 Draft record IDs
Generate draft record IDs using the record prefix and batch date. Use a sequential counter per record type and continue from the next available number if the target file already contains records with that date and prefix.
Examples:
- `evt-2026-03-05-001`
- `fct-2026-03-05-002`
- `st-2026-03-05-001`
- `id-2026-03-05-001`
- `cmp-2026-03-05-004`
### 3.17 Draft summary quality
`draft_summary` must be one line, durable, and distinct enough to identify the record later. It should not cram several independent claims into one sentence.
Good summaries describe who, what, and the durable practical meaning. They may include the relevant date if that is central to the memory.
### 3.18 Curation procedure
For each claim:
1. Read the claim metadata and body.
2. Determine the probable destination layer.
3. Load only the canon slices needed for that destination.
4. Search for duplicates, overlaps, conflicts, and existing active records.
5. Decide `accept`, `reject`, or `defer`.
6. If accepted, write the target type, target file, draft record ID, and summary.
7. Append the annotation block.
No claim should leave Phase B without an explicit annotation.
### 3.19 Example: accept event
Claim:

```md
## claim-20260305-004
---
claim_id: claim-20260305-004
source_session: "~/.openclaw/agents/orchestrator/sessions/2026-03-05-z7p.jsonl"
source_agent: orchestrator
observed_at: "2026-03-05T09:10:14Z"
confidence: high
tags: [work, interview, scheduling]
target_layer: L2
target_domain: work
---
User confirmed a technical interview with Northstar Labs for 2026-03-08 at 15:00 UTC.
```

Decision:

```md
### curator-annotation
---
decision: accept
target_type: event
target_file: "core/user/timeline/2026/03/05.md"
draft_record_id: "evt-2026-03-05-001"
draft_summary: "User confirmed a technical interview with Northstar Labs for 2026-03-08 at 15:00 UTC"
reason: "Concrete dated event with direct evidence and no duplicate in canon"
supersedes: null
draft_confidence: high
links: []
notes_for_apply: "Append to daily timeline"
---
```

### 3.20 Example: reject noise
Claim:

```md
## claim-20260305-016
---
claim_id: claim-20260305-016
source_session: "~/.openclaw/agents/orchestrator/sessions/2026-03-05-z7p.jsonl"
source_agent: orchestrator
observed_at: "2026-03-05T10:55:02Z"
confidence: high
tags: [meta]
target_layer: L3
target_domain: work
---
User thanked the assistant and said the conversation was helpful.
```

Decision:

```md
### curator-annotation
---
decision: reject
reason: noise
existing_record_id: null
notes_for_apply: null
---
```

### 3.21 Example: defer identity change
Claim:

```md
## claim-20260305-021
---
claim_id: claim-20260305-021
source_session: "~/.openclaw/agents/orchestrator/sessions/2026-03-05-z7p.jsonl"
source_agent: orchestrator
observed_at: "2026-03-05T22:41:17Z"
confidence: low
tags: [identity, work, transition]
target_layer: L4
target_domain: identity
---
User said they might not be an engineer anymore and may want a completely different life.
```

Decision:

```md
### curator-annotation
---
decision: defer
reason: identity_threshold_not_met
related_record_id: "id-2026-02-10-001"
review_trigger: "Require repeated explicit evidence across sessions before changing identity canon"
notes_for_apply: null
---
```

### 3.22 Quality control before leaving Phase B
Check that:
- every claim has exactly one curator annotation,
- every accepted claim has a valid target type and file,
- every rejected claim has a concrete reason,
- every deferred claim explains what would justify future review,
- no transcript content was reintroduced during this phase,
- obvious duplicates and contradictions were handled explicitly.
### 3.23 Common Phase-B mistakes
Do not:
- reload transcripts because a claim feels thin,
- accept vague claims into canon just because they seem important,
- treat mood as identity,
- write the final markdown envelope in Phase B,
- skip duplicate checking for agent memory,
- leave a claim silently unannotated.
### 3.24 Completion criteria
Phase B is complete when the intake batch is fully annotated and every accepted claim contains enough structured information for Phase C to write canon without re-judging meaning.
---

## 4. Phase C: Apply
### 4.1 Goal
Phase C writes curated claims into canon with exact markdown envelope formatting. It is a serialization and file-update phase, not a transcript-reading phase and not a broad judgment phase.
This phase must be precise, restartable, and tolerant of partial failure.
### 4.2 Input, output, context
| Item | Value |
|------|-------|
| Goal | write curated claims into canon |
| Input | annotated intake plus target canon files |
| Output | updated canon files plus git commit |
| Context rule | load curated decisions and target files only |
Do not load transcripts. Do not load the full canon. Load only the claim annotations and the exact files you need to update.
### 4.3 Action map by record type
| Type | Action |
|------|--------|
| `event` | append to `core/user/timeline/YYYY/MM/DD.md` |
| `fact` | upsert in `core/user/knowledge/{domain}.md` by `record_id` or `supersedes` |
| `state` | update `core/user/state/current.md` by replacing active projection via append/deprecate logic |
| `identity` | update `core/user/identity/current.md` and append to `core/user/identity/changelog.md` |
| `competence` | append to `core/agents/{role}/{COURSE|PLAYBOOK|PITFALLS|DECISIONS}.md` |
### 4.4 General envelope template
Every canonical record must use this envelope shape exactly:

```md
<a id="{record_id}"></a>
### {record_id}
---
record_id: {record_id}
type: {type}
summary: "{summary}"
evidence:
  - "intake/pending/YYYY-MM-DD.md#{claim_id}"
confidence: {low|medium|high}
status: {active|corrected|retracted|deprecated}
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
---
{body}
```

If optional fields are needed, add them after `updated_at` in this preferred order:
- `as_of`
- `domain`
- `role`
- `supersedes`
- `links`
- `tags`
### 4.5 Exact envelope examples by type
Event example:

```md
<a id="evt-2026-03-05-001"></a>
### evt-2026-03-05-001
---
record_id: evt-2026-03-05-001
type: event
summary: "User confirmed a technical interview with Northstar Labs for 2026-03-08 at 15:00 UTC"
evidence:
  - "intake/pending/2026-03-05.md#claim-20260305-004"
confidence: high
status: active
updated_at: "2026-03-06T00:18:42Z"
tags: [work, interview, scheduling]
---
User confirmed a technical interview with Northstar Labs scheduled for 2026-03-08 at 15:00 UTC.
```

Fact example:

```md
<a id="fct-2026-03-05-002"></a>
### fct-2026-03-05-002
---
record_id: fct-2026-03-05-002
type: fact
summary: "User prefers uninterrupted morning blocks for deep technical work"
evidence:
  - "intake/pending/2026-03-05.md#claim-20260305-007"
confidence: medium
status: active
updated_at: "2026-03-06T00:18:42Z"
domain: preferences
tags: [work, preference, focus]
---
User prefers uninterrupted morning blocks for deep technical work and avoids meetings before noon when scheduling permits.
```

State example:

```md
<a id="st-2026-03-05-001"></a>
### st-2026-03-05-001
---
record_id: st-2026-03-05-001
type: state
summary: "User is actively preparing for a Northstar Labs technical interview"
evidence:
  - "intake/pending/2026-03-05.md#claim-20260305-004"
confidence: high
status: active
updated_at: "2026-03-06T00:18:42Z"
as_of: "2026-03-05T09:10:14Z"
links:
  - rel: derived_from
    target: "evt-2026-03-05-001"
tags: [work, interview, active]
---
Current canonical state indicates that the user is actively preparing for the scheduled Northstar Labs technical interview.
```

Identity example:

```md
<a id="id-2026-03-05-001"></a>
### id-2026-03-05-001
---
record_id: id-2026-03-05-001
type: identity
summary: "User identifies as an independent technical operator rather than a startup founder"
evidence:
  - "intake/pending/2026-03-05.md#claim-20260305-028"
confidence: high
status: active
updated_at: "2026-03-06T00:18:42Z"
as_of: "2026-03-05T20:12:00Z"
supersedes: "id-2026-02-10-001"
links:
  - rel: supersedes
    target: "id-2026-02-10-001"
tags: [identity, work, self-concept]
---
User now explicitly frames identity as an independent technical operator and no longer centers the founder identity that was previously active.
```

Competence example:

```md
<a id="cmp-2026-03-05-001"></a>
### cmp-2026-03-05-001
---
record_id: cmp-2026-03-05-001
type: competence
summary: "Avoid momentum entries on small timeframes during high volatility unless a separate volatility filter confirms the setup"
evidence:
  - "intake/pending/2026-03-05.md#claim-20260305-011"
confidence: high
status: active
updated_at: "2026-03-06T00:18:42Z"
domain: trading
role: trader
tags: [pitfall, volatility, momentum]
---
Small-timeframe momentum setups should be treated as unsafe in high-volatility regimes unless a dedicated volatility filter independently validates the entry.
```

### 4.6 Checkpoint mechanism
Before applying the first accepted claim, write `intake/_checkpoint.yaml`.
Schema:

```yaml
batch_date: "2026-03-05"
phase: apply
started_at: "2026-03-06T00:15:00Z"
last_processed_claim: "claim-20260305-012"
claims_applied: 12
claims_skipped: 1
```

Field meanings:
- `batch_date` is the batch being applied,
- `phase` is always `apply`,
- `started_at` is the UTC time the apply run began,
- `last_processed_claim` is the latest accepted claim that has finished apply handling,
- `claims_applied` counts successful writes,
- `claims_skipped` counts apply-time skips.
Update the checkpoint after each processed accepted claim, whether written or skipped. Do not wait until the batch end.
### 4.7 Resume rule
If the apply phase crashes, resume from `last_processed_claim + 1`.
Resume procedure:
1. Read `intake/_checkpoint.yaml`.
2. Confirm the batch date.
3. Open the curated intake file.
4. Find `last_processed_claim`.
5. Start with the next accepted claim.
6. If the last claim’s write result is ambiguous, inspect the target file for the expected `draft_record_id` before deciding whether to reapply.
### 4.8 Partial success rule
Each claim is handled independently. One bad claim must not abort the whole batch.
If a claim cannot be written because its annotation is malformed, incomplete, or points to unresolved canon, skip it and mark it visibly in the intake claim section with this literal pattern:

```md
[SKIPPED: missing draft_record_id in curator annotation]
```

Other valid examples:
- `[SKIPPED: target_file missing for accepted claim]`
- `[SKIPPED: supersedes points to unresolved record_id]`
- `[SKIPPED: malformed YAML annotation]`
Continue with the next claim after marking the skip.
### 4.9 Event writes
For `event` records, append to `core/user/timeline/YYYY/MM/DD.md`. If the file does not exist, create it. A minimal day file scaffold is acceptable:

```md
---
layer: L2
date: "YYYY-MM-DD"
schema_version: "1.0"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
---
# Timeline: YYYY-MM-DD

```

Then append the event envelope below the heading.
Timeline rules:
- append only,
- never silently delete old events,
- use correction events for historical fixes,
- update file-level `updated_at` if frontmatter is present.
### 4.10 Fact writes
For `fact` records, target `core/user/knowledge/{domain}.md`.
Apply rules:
- if `draft_record_id` already exists, update that record in place only when the annotation intends the same record,
- if the accepted draft includes `supersedes`, keep the old record and mark it `deprecated`, then append the new record,
- if the fact is new, append a new record,
- update the file frontmatter `updated_at`.
Do not delete superseded fact anchors.
### 4.11 State writes
For `state` records, update `core/user/state/current.md`.
State is a current projection, so mutation is allowed, but history still matters. Use append-plus-deprecate rather than destructive replacement:
- keep older superseded state records present with `status: deprecated`,
- append the new active state record,
- set `as_of` on the new state record,
- update file-level `as_of` and `updated_at` to reflect the newest active state.
Do not write a state record when the claim only describes a dated event with no current implication.
### 4.12 Identity writes
For `identity` records, do two writes:
1. append the new identity record to `core/user/identity/changelog.md`,
2. update `core/user/identity/current.md` to reflect the active identity set.
If the new record supersedes an old current identity record:
- mark the old one `deprecated` in `current.md`,
- append the new active record,
- keep the old anchor intact,
- update file-level `as_of` and `updated_at`.
Identity history must remain available in canon. Do not remove old identity anchors.
### 4.13 Competence writes
For `competence` records, append to `core/agents/{role}/{COURSE|PLAYBOOK|PITFALLS|DECISIONS}.md`.
Each competence record must include both `domain` and `role`. If the record supersedes an earlier competence entry, keep the older record with `status: deprecated` and append the new one.
### 4.14 File-level frontmatter updates
When touching files with container frontmatter:
- update `updated_at` on knowledge and agent files,
- update `updated_at` and `as_of` on `state/current.md` if state changed,
- update `updated_at` and `as_of` on `identity/current.md` if identity changed,
- update `updated_at` on `identity/changelog.md`,
- set `updated_at` on new timeline day files if you use timeline frontmatter.
### 4.15 Placeholder comments in template files
Template files may contain comments like `<!-- Records will be appended below by Mnemo -->`. When writing the first real record, you may remove the placeholder or leave it above the record area, but do not allow placeholder text to break the envelope structure.
### 4.16 Evidence and links
Every new record must carry evidence. For newly applied records, the primary evidence is usually the claim anchor, for example:

```yaml
evidence:
  - "intake/pending/2026-03-05.md#claim-20260305-004"
```

If the record is derived from or supersedes canonical history, include additional evidence and `links` when appropriate. Links are part of canonical meaning; `edges.jsonl` is only a derived export.
### 4.17 Supersedes handling
When a draft includes `supersedes`:
1. resolve the old record,
2. confirm that it exists,
3. mark the old record `deprecated` for fact/state/identity/competence,
4. append the new record with `supersedes: <old_record_id>`,
5. include a `links` item such as `rel: supersedes` when links are being maintained.
If the superseded record cannot be resolved, skip the claim with a `[SKIPPED: ...]` marker and continue the batch.
### 4.18 Timeline corrections
If curation has decided a prior event requires correction, do not silently rewrite the older event. Instead:
- append a new correction event,
- mark the old event `corrected` only if you are explicitly updating status,
- link the new event to the old one using `updated` or `supersedes` as appropriate,
- preserve both anchors.
### 4.19 Residual unresolved claims
Two things must both remain true after apply:
- the fully annotated source batch is preserved as processed history,
- unresolved work remains visible in `pending/`.
Therefore:
- move the fully annotated batch to `intake/processed/YYYY-MM-DD.md`,
- if there are deferred or skipped claims that should remain active, create a fresh residual `intake/pending/YYYY-MM-DD.md` containing only those unresolved claims and their annotations.
This reconciles “move processed intake” with “keep unresolved backlog visible”.
### 4.20 Move and commit rules
After all accepted claims have been handled:
1. move the full annotated batch from `intake/pending/` to `intake/processed/`,
2. optionally recreate a residual pending file containing only unresolved claims,
3. stage the canonical changes and intake moves,
4. create the apply commit,
5. only after commit success, delete `intake/_checkpoint.yaml`.
Do not stage the checkpoint into the final commit.
### 4.21 Git commit message format
Use this exact subject line format:

```text
memory: consolidation YYYY-MM-DD (N events, M facts, K agent updates)
```

Where:
- `YYYY-MM-DD` is the batch date,
- `N` is the number of event records written,
- `M` is the number of fact records written,
- `K` is the number of competence records written.
If state or identity records were also updated, keep the subject format unchanged and place extra detail in the commit body if needed.
### 4.22 Safe write checklist per accepted claim
Before writing an accepted claim, verify:
- `decision` is `accept`,
- `target_type` is valid,
- `target_file` is present,
- `draft_record_id` exists and its prefix matches type,
- `draft_summary` exists,
- evidence can point to the source claim anchor,
- any `supersedes` target resolves,
- required type-specific fields are available.
If any critical item is missing, skip the claim and continue.
### 4.23 What not to do in Phase C
Do not:
- reopen transcripts,
- reinterpret the meaning of weak claims,
- change the destination type on a whim,
- write a record without evidence,
- delete old anchors to keep files tidy,
- update `core/meta/manifest.json` here,
- update `core/meta/graph/edges.jsonl` here,
- let one malformed claim abort the entire batch.
### 4.24 Post-apply checklist inside the phase
Before closing Phase C, confirm:
1. every new record has evidence,
2. every `record_id` is unique,
3. every envelope has anchor + heading + YAML + body,
4. no supersedes reference is orphaned,
5. timeline changes were append-only,
6. the checkpoint is ready to be deleted after commit success,
7. the git commit subject follows the required format.
### 4.25 Completion criteria
Phase C is complete when accepted claims have been written, skipped claims are visibly marked, the annotated batch has been moved to `processed/`, any residual backlog is preserved in `pending/`, the apply commit exists, and the checkpoint has been deleted after successful commit.
---

## 5. Conflict Resolution
### 5.1 Principle
Conflicts are resolved explicitly. Never hide a contradiction by quietly overwriting older canon.
The allowed outcomes are:
- reject as duplicate,
- accept as superseding,
- append a correction event,
- defer until evidence improves.
### 5.2 Supersedes
Use `supersedes` when a newer durable record replaces an older durable record. The new record becomes active; the old record remains in canon and is marked `deprecated` for fact/state/identity/competence records.
Do not use `supersedes` when both statements can remain true simultaneously.
### 5.3 Duplicate detection
Treat a claim as duplicate when the summary meaning and effective evidence are already represented. “Same summary + same evidence” is a strong duplicate signal, but semantic sameness matters more than exact wording.
Reject duplicates with a reason of `duplicate` and reference the existing `record_id`.
### 5.4 Contradicting facts
When facts contradict, compare evidence strength in this order:
1. specificity,
2. number of supporting signals,
3. independence of sources,
4. directness of wording,
5. recency,
6. confidence.
If the new evidence clearly wins, accept the new fact and supersede the old one. If the winner is not clear, defer.
### 5.5 Timeline corrections
Timeline files are append-only. If an event needs correction:
- append a correction event,
- mark the original `corrected` if needed,
- preserve the original anchor,
- never erase the old event silently.
### 5.6 Identity changes
Identity changes require high confidence and, ideally, multiple sources. A single ambiguous remark is not enough. If the evidence is explicit, durable, repeated, and meaningfully changes the user model, accept. Otherwise defer.
### 5.7 State versus identity confusion
Many apparent identity shifts are really state changes. “I am tired of this” is often state, not identity. “I no longer consider myself a founder” may be identity if repeated and explicit. When uncertain, prefer event or state over identity.
### 5.8 Conflict summary table
| Situation | Default action |
|-----------|----------------|
| Same summary and same evidence | reject as duplicate |
| Stronger newer durable fact | accept with `supersedes` |
| Historical event needs correction | append correction event |
| Weak contradiction with unclear winner | defer |
| Proposed identity change from one weak source | defer |
| Repeated explicit identity shift | accept identity update |
---

## 6. Failure Modes & Recovery
### 6.1 Principle
The memory system must fail safely. Recovery should preserve canon integrity, avoid duplicate writes, and make progress resumable.
### 6.2 Failure scenarios table
| Failure scenario | What is affected | Recovery |
|------------------|------------------|----------|
| Phase A crash before save | intake file absent or partial | rerun extraction; transcripts remain the source |
| Phase B crash before completion | some claims undecided | rerun curation on the same pending file |
| Phase C crash mid-batch | canon partially written | resume using `intake/_checkpoint.yaml` |
| Phase C commit fail | writes exist but no commit | inspect working tree, retry commit, keep checkpoint |
| Git push fail | remote is behind local | retry push later; local canon remains valid |
### 6.3 Checkpoint resume procedure
When `intake/_checkpoint.yaml` exists:
1. stop and read it,
2. confirm the batch date,
3. open the relevant curated intake file,
4. locate `last_processed_claim`,
5. inspect the target file if the last claim outcome is unclear,
6. resume from the next unapplied claim,
7. continue updating the checkpoint until commit success,
8. delete the checkpoint only after the successful commit.
### 6.4 Ambiguous last-claim recovery
If the checkpoint exists but it is unclear whether the last claim was fully written:
- inspect the target file for the expected `draft_record_id`,
- if it exists cleanly, treat it as applied,
- if it does not, reapply once,
- if a malformed partial write exists, repair it before continuing.
Do not create a second copy of the same record just to be safe.
### 6.5 Degraded mode: LLM unavailable
If the LLM is unavailable, skip the cycle rather than inventing memory. Canon remains at the last successful state. Raise an alert or operator-visible note if the environment supports it.
### 6.6 Degraded mode: partial transcripts
If some transcript files are unreadable or missing, extract what is available. Do not invent missing evidence. The later cycle may capture the missing sessions if they become readable.
### 6.7 Degraded mode: slow model
If a phase runs slowly, keep the phase narrow and let it finish if possible. Slowness is preferable to hurried low-quality consolidation. If backlog grows, reduce batch size in later runs.
### 6.8 Degraded mode: accumulation
If `intake/pending/` contains more than 7 days of unresolved work, alert and prioritize backlog reduction. Smaller batches and manual triggering are better than letting stale claims accumulate indefinitely.
### 6.9 Commit fail procedure
If `git commit` fails after file writes:
1. leave the checkpoint in place,
2. confirm the target files contain the intended writes,
3. retry the commit,
4. do not move to verification,
5. do not delete the checkpoint until commit success.
### 6.10 Push fail procedure
If `git push` fails after a successful local commit, do not roll back canon. Local history remains valid. Retry push when connectivity or remote availability returns.
### 6.11 Recovery completion criteria
Recovery is complete when the batch state and repository state match reality: no ambiguous duplicate writes, no ignored checkpoint, and a clear next step for the following cycle.
---

## 7. Retention Operations
### 7.1 Principle
Retention keeps the memory workspace navigable while preserving history and referential integrity.
### 7.2 Processed intake archival
Rule: files in `intake/processed/` older than 90 days move to archive.
Target pattern:
- `intake/processed/archive/YYYY/MM/`
Use history-preserving moves where possible. Preserve filenames.
### 7.3 Pending backlog alert
Rule: pending intake older than 7 days should trigger an alert. Pending is an inbox, not long-term storage.
### 7.4 Graph export compaction
Rule: `edges.jsonl` is compacted quarterly by rebuilding from canonical `links[]`. Canonical links remain the source of truth; the export is derived and replaceable.
### 7.5 Timeline archival
Rule: timeline files older than one year may move to `core/user/timeline/archive/YYYY/MM/DD.md`.
Use history-preserving moves. Preserve anchors. If path-sensitive references must change, update them without breaking referential integrity.
### 7.6 Quarterly summaries
Quarterly timeline summaries may exist for navigation only. They are not evidence sources and never replace the day files.
### 7.7 Retention cautions
Do not:
- delete canonical records just because they are old,
- archive unresolved pending work as a shortcut,
- treat `edges.jsonl` as the primary memory store,
- break anchor-based evidence links during archival.
---

## 8. Post-Apply Checklist
Run this checklist after every successful apply. All seven items must pass.
### 8.1 Every new record has evidence
Verify every new canonical record includes an `evidence` array and every evidence entry points to a path plus `#anchor`. Fail if any new durable record lacks anchored evidence.
### 8.2 Every `record_id` is unique
Verify no duplicate `record_id` was created in the target files and no resume step wrote a second copy of the same record. Prefixes must match types.
### 8.3 Envelope format is correct
Verify each new record has exactly these structural elements:
1. anchor tag,
2. `###` heading with the same identifier,
3. YAML block between `---` markers,
4. prose body.
### 8.4 No orphaned supersedes references
Verify that every `supersedes` target resolves to an existing canonical anchor and that old anchors were not removed when a new record replaced them.
### 8.5 Timeline entries are append-only
Verify that timeline changes were made by appending records or appending correction events. Fail if a historical event was silently erased or rewritten as the primary correction mechanism.
### 8.6 Checkpoint deleted
Verify `intake/_checkpoint.yaml` is gone after the successful commit. A leftover checkpoint means the repository still looks mid-apply.
### 8.7 Git commit message follows format
Verify the commit subject is exactly:

```text
memory: consolidation YYYY-MM-DD (N events, M facts, K agent updates)
```

The date must match the batch and the counts must be sensible.
### 8.8 Final checklist card
1. Every new record has evidence.
2. Every `record_id` is unique.
3. Envelope format is correct: anchor + heading + YAML + body.
4. No orphaned supersedes references.
5. Timeline entries are append-only.
6. Checkpoint deleted.
7. Git commit message follows format.
### 8.9 Completion rule
If any item fails, the cycle is not complete. Fix the issue immediately if safe; otherwise stop and leave a clear recovery point. Never declare success while a checkpoint is stranded, a supersedes target is broken, or a record entered canon without evidence.
---
End of runbook. This file, together with `core/system/CANON.md`, is sufficient for Mnemo to operate the extraction, curation, and apply pipeline after a fresh clone.

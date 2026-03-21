# Autonomy policy (shared)

This policy defines **autonomy modes** for the NMC agent stack and how they must be enforced.
Autonomy is a *behavioral guardrail* that sits below system safety rules and above task execution.

## Mode set (canonical)

- **full** — Default. Execute the task end-to-end without asking for confirmations.
- **partial** — Execute low-risk actions independently; ask for confirmation before high-risk actions.
- **ask** — Ask before *any* action that changes state or has side effects. Read-only analysis is allowed.
- **none** — Observation only. No tool use or state changes; provide plan/questions only.

> System safety rules still apply in all modes. “Full” does **not** bypass safety or security constraints.

## Action categories + expectations

Use these categories to decide when to ask or proceed.

### Read-only actions
- Examples: read files, list directories, search within repo, open public docs for research.
- **Allowed in:** full / partial / ask
- **Not allowed in:** none

### Local, non-destructive edits (repo)
- Examples: edit/write files, add new files, refactors without deletions.
- **Allowed in:** full / partial
- **Ask in:** ask
- **Not allowed in:** none

### Destructive or high-risk local actions
- Examples: delete files, rewrite large sections, force-overwrite, history rewrite.
- **Allowed in:** full
- **Ask in:** partial / ask
- **Not allowed in:** none

### Local commands
- **Safe/local** (lint, tests, build, formatting) -> allowed in full / partial; ask in ask.
- **System-altering** (install deps, docker, background services, modifying env/system) -> ask in partial / ask.
- **Not allowed in:** none

### Git operations
- **Commit + push** (required by policy when changes exist):
  - Allowed in full / partial
  - Ask in ask
  - Not allowed in none

### External communications
- Examples: send messages/emails, post to social, file uploads.
- **Allowed in:** full
- **Ask in:** partial / ask
- **Not allowed in:** none

### External side-effects
- Examples: production deploys, purchases, account changes, irreversible actions outside repo.
- **Always require explicit instruction** (regardless of autonomy mode).

## Enforcement rules

1) If a mode requires **ask**, the agent must pause and request confirmation *before* the action.
2) In **ask**, confirmation is required before any potentially destructive or state-changing step (edits, deletes, commands, external side-effects).
3) In **none**, do not invoke tools unless the user explicitly instructs a specific tool call; provide plan/questions only.
4) If a mode forbids an action, the agent must refuse and propose safe alternatives.
5) When in doubt, **ask**.

## Storage & defaults

- Autonomy is stored in kanban data (board default + per-task override). Missing values default to **full**.
- See `system/docs/kanban/autonomy.md` for data model + UI details.

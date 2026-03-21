# Kanban Autonomy

This document defines the file-first autonomy contract used by the shared kanban system.

## Storage model
- Board default: `system/tasks/active/.kanban.json` field `autonomy_default`
- Per-task override: task frontmatter field `autonomy`
- Effective autonomy: task override when set and not `inherit`, otherwise board default, otherwise `full`

## Canonical values
- Board: `full`, `partial`, `ask`, `none`
- Task: `inherit`, `full`, `partial`, `ask`, `none`

## UI expectations
- Future UI should expose both board default and per-task override.
- UI should always display both raw and effective autonomy for a task.
- UI should not invent extra autonomy levels beyond the shared policy.
- If autonomy is missing on disk, UI should render the inherited default as `full`.

## Script expectations
- `system/scripts/kanban.mjs` is the reference reader and writer for this contract.
- Operators should resolve autonomy before edits, commands, git operations, or external side effects.

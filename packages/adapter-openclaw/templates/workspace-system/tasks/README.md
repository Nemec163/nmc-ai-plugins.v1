# Tasks

File-first kanban source of truth.

## Layout

- `active/` current board files plus `.kanban.json`
- `backlogs/` parked task files
- `done/` completed task files
- `inbox/` newly captured task files
- `recurring/` recurring task definitions
- `templates/` canonical task template

## Contract

- Active tasks are Markdown files named `T-*.md`.
- Board defaults live in `active/.kanban.json`.
- Per-task overrides live in frontmatter.
- `system/scripts/kanban.mjs` is the reference CLI for this contract.
- `templates/task.md` is the canonical task shape for newly created board files.

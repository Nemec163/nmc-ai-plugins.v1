# System

Shared infrastructure for the NMC workspace lives here.

## Layout
- `memory/` holds the shared canon and intake pipeline state.
- `skills/` holds shared workspace skills mirrored from the plugin bundle.
- `tasks/` holds the file-first kanban source of truth.
- `policy/` holds shared operating policies.
- `scripts/` holds local board and workflow helpers.
- `docs/` holds implementation notes for future tooling and UI layers.

## Contract
- Agent folders stay as siblings of `system/` under the workspace root.
- Agents should use their local `system -> ../system` symlink when reading shared infra.
- Board defaults live in `tasks/active/.kanban.json`.
- Missing `autonomy` or `git_flow` task values inherit from board defaults.

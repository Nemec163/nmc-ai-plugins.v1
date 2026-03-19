# System

Shared infrastructure copied into `system/` by the OpenClaw adapter setup and
auto-bootstrap flows.

## Layout

- `memory/` holds the shared canon and intake pipeline state.
- `skills/` holds shared workspace skills mirrored from the bundled adapter assets.
- `tasks/` holds the file-first kanban source of truth.
- `policy/` holds shared operating policies.
- `scripts/` holds local board and workflow helpers.
- `docs/` holds implementation notes for future tooling and UI layers.

## Contract

- Agent folders stay as siblings of `system/` under the workspace root.
- Agents should use their local `system -> ../system` symlink when reading shared infra.
- Board defaults live in `tasks/active/.kanban.json`.
- Missing `autonomy` or `git_flow` task values inherit from board defaults.
- `system/` remains the managed shared workspace root; per-agent files belong in sibling agent directories, not inside this tree.

# @nmc/memory-maintainer

Shared maintainer contract for the file-first task board, board defaults, and
the operational `system/` execution surface.

Surface status: `internal` shared core package inside the product boundary. It
is not a direct install, operator, or bounded connector surface.

This package owns:

- kanban status, priority, autonomy, and git-flow enums
- task frontmatter parsing and rendering helpers
- board settings normalization and validation
- task policy derivation over board defaults

Export surface:

- `constants`
- `parser`
- `settings`
- `task`

The deployed reference CLI remains `system/scripts/kanban.mjs`; this package
formalizes the shared contracts behind that behavior without changing workspace
layout or user-facing paths.

Boundaries:

- maintainer owns task and policy semantics for `system/`
- workspace placement stays in `@nmc/memory-workspace`
- role roster and rendering stay in `@nmc/memory-agents`

See [Memory OS Roadmap](../../docs/legacy/memory-os-roadmap.md) for the
migration history.

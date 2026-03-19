# @nmc/memory-agents

Predefined role roster, machine-readable manifests, and render helpers for
Memory OS agent workspaces.

Surface status: `internal` shared core package inside the product boundary. It
is not a direct install, operator, or adapter surface.

This package owns:

- predefined role roster metadata
- machine-readable role manifest generation
- render helpers for agent workspace files

Export surface:

- `manifest`
- `render`
- `roster`

Boundaries:

- filesystem placement stays in `@nmc/memory-workspace`
- shared task and policy semantics stay in `@nmc/memory-maintainer`
- adapter bootstrap chooses when and where rendered content is installed

See [Memory OS Roadmap](../../docs/legacy/memory-os-roadmap.md) for the
migration history.

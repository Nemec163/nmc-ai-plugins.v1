# @nmc/memory-canon

Shared canon contract for storage-aware validation, derived manifest and graph
behavior, and the canonical write boundary.

Surface status: `internal` shared core package inside the product boundary. It
is not a direct install, operator, or bounded connector surface.

This package owns:

- canon layout helpers for `core/system`, `core/user`, `core/agents`, and `core/meta`
- manifest and graph edge contract helpers used by verification
- versioned procedural canon promotion under `core/agents/*/PLAYBOOK.md` with bounded feedback lineage
- lock semantics plus promoter-interface validation and lifecycle helpers for
  the canonical write boundary

Export surface:

- `constants`
- `layout`
- `manifest`
- `graph`
- `lock`
- `promoter`
- `verify`

Boundaries:

- this package owns the single-writer canon boundary
- runtime and adapters do not write canon directly
- operator surfaces inspect canon through gateway and control-plane layers

See [Memory OS Roadmap](../../docs/legacy/memory-os-roadmap.md) for the
migration history.

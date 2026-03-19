# @nmc/memory-canon

Shared canon contract for storage-aware validation, derived manifest and graph
behavior, and the canonical write-boundary skeleton.

Surface status: `internal` shared core package inside the product boundary. It
is not a direct install, operator, or bounded connector surface.

This slice owns:

- canon layout helpers for `core/system`, `core/user`, `core/agents`, and `core/meta`
- manifest and graph edge contract helpers used by verification
- versioned procedural canon promotion under `core/agents/*/PLAYBOOK.md` with bounded feedback lineage
- lock semantics plus promoter-interface validation and lock lifecycle helpers
  for the future canonical write boundary

Exports in this PR:

- `constants`
- `layout`
- `manifest`
- `graph`
- `lock`
- `promoter`
- `verify`

See [Memory OS Roadmap](../../docs/legacy/memory-os-roadmap.md) for the extraction plan.

# @nmc/memory-canon

Shared canon contract for storage-aware validation, derived manifest and graph behavior, and the canonical write-boundary skeleton.

This slice owns:

- canon layout helpers for `core/system`, `core/user`, `core/agents`, and `core/meta`
- manifest and graph edge contract helpers used by verification
- lock semantics and promoter-interface skeletons for the future canonical write boundary

Exports in this PR:

- `constants`
- `layout`
- `manifest`
- `graph`
- `lock`
- `promoter`
- `verify`

See [Memory OS Roadmap](../../docs/memory-os-roadmap.md) for the extraction plan.

# adapter-openclaw

OpenClaw-specific adapter package for the Memory OS migration.

Current responsibilities:

- plugin runtime registration and service bootstrap wiring
- setup CLI parsing and execution
- pipeline phase invocation descriptors for `extract`, `curate`, and transitional `apply`
- `openclaw.json` mutation and managed bindings
- managed `memorySearch.extraPaths` registration
- gateway-backed scaffold bootstrap for the compatibility plugin

The compatibility shell remains in `nmc-memory-plugin/`, but OpenClaw-specific
logic should live here.

See [Memory OS Roadmap](../../docs/memory-os-roadmap.md) for the extraction plan.

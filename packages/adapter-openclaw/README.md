# adapter-openclaw

OpenClaw-specific adapter package for the Memory OS migration.

Current responsibilities:

- plugin runtime registration and service bootstrap wiring
- setup CLI parsing and execution
- pipeline phase invocation descriptors for `extract`, `curate`, and transitional `apply`
- bundled OpenClaw skill assets and `SKILL.md` packaging
- `openclaw.json` mutation and managed bindings
- managed `memorySearch.extraPaths` registration
- gateway-backed scaffold bootstrap for the compatibility plugin

The compatibility shell remains in `nmc-memory-plugin/`, but OpenClaw-specific
logic and bundled skill assets should live here. `nmc-memory-plugin/skills/`
remains the compatibility discovery surface for live installs.

See [Memory OS Roadmap](../../docs/memory-os-roadmap.md) for the extraction plan.

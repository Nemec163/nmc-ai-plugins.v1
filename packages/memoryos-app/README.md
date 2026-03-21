# memoryos-app

Standalone CLI application surface for `MemoryOS.v1`.

Surface status: `production` standalone install/run surface for the repository.
It bootstraps the shared `system/` workspace contract independently of any
adapter. Peer adapters (`adapter-openclaw`, `adapter-codex`, `adapter-claude`)
are optional connector surfaces.

Current commands:

- `memoryos init`
- `memoryos run`
- `memoryos status`
- `memoryos verify`
- `memoryos health`
- `memoryos snapshot`
- `memoryos pipeline`

Default standalone layout:

- `~/.memoryos/system/`
- `~/.memoryos/system/memory/`
- `~/.memoryos/{nyx,medea,arx,lev,mnemo}/`
- `~/.memoryos/agents/{nyx,medea,arx,lev,mnemo}/`
- `~/.memoryos/memoryos.json`

Typical local bootstrap from this repository:

```bash
node ./packages/memoryos-app/bin/memoryos.js init
node ./packages/memoryos-app/bin/memoryos.js run --phase verify --once
node ./packages/memoryos-app/bin/memoryos.js status
node ./packages/memoryos-app/bin/memoryos.js verify
node ./packages/memoryos-app/bin/memoryos.js health
node ./packages/memoryos-app/bin/memoryos.js pipeline 2026-03-20 --phase verify
```

Runtime host note:

- `memoryos run` is the standalone long-running process surface
- it reuses the existing pipeline path instead of taking over promotion or runtime authority
- host lock/state/run receipts are written under `runtime/host/`
- `--once` runs a single cycle and exits; without it the host loops on the configured interval

Pipeline note:

- `verify` works standalone out of the box
- `extract` and `curate` still require an adapter module and runner command via
  `--adapter-module` and `--llm-runner`
- canon writes remain behind the existing promoter path

This package deliberately wraps existing `memory-os-gateway`,
`control-plane`, `@nmc/memory-workspace`, and `@nmc/memory-pipeline`
surfaces instead of taking over canon, runtime authority, or workspace
semantics.

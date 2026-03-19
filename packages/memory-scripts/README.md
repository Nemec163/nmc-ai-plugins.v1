# @nmc/memory-scripts

Deterministic helper scripts for MemoryOS.v1 verify, status, onboarding, and
retention operations.

Surface status: `internal` shared core package inside the product boundary. It
is not a direct install, operator, or adapter surface.

The canonical implementations live in this package. Adapter-owned wrapper
entrypoints such as `packages/adapter-openclaw/skills/` delegate here so
standalone usage, adapter installs, and repo-local tests resolve the same
script behavior.

## Scripts

- `bin/verify.sh`
- `bin/status.sh`
- `bin/onboard.sh`
- `bin/retention.sh`

## Programmatic Access

```js
const { scripts } = require("@nmc/memory-scripts");
console.log(scripts.verify);
```

`index.js` exports absolute paths to the packaged scripts so adapter wrappers
and other callers can resolve stable entrypoints.

See [Memory OS Roadmap](../../docs/legacy/memory-os-roadmap.md) for the
migration history.

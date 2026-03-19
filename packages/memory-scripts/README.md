# @nmc/memory-scripts

Deterministic helper scripts extracted into shared package form during Memory OS migration.

The canonical implementations live in this package. OpenClaw-facing skill
entrypoints under `packages/adapter-openclaw/skills/` delegate here so adapter
installs and repo-local tests resolve the same script behavior.

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

`index.js` exports absolute paths to the packaged scripts so adapter wrappers and future callers can resolve stable entrypoints.

See [Memory OS Roadmap](../../docs/memory-os-roadmap.md) for migration sequencing.

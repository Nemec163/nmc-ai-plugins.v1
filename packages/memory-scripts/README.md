# @nmc/memory-scripts

Deterministic helper scripts extracted from `nmc-memory-plugin` during Memory OS migration.

The canonical implementations now live in this package. Legacy entrypoints under
`nmc-memory-plugin/skills/` remain as compatibility wrappers so existing OpenClaw
skill paths, tests, and helper flows continue to work unchanged.

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

`index.js` exports absolute paths to the packaged scripts so wrappers and future callers can resolve stable entrypoints.

See [Memory OS Roadmap](../../docs/memory-os-roadmap.md) for migration sequencing.

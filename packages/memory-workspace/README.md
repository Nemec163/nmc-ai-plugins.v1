# @nmc/memory-workspace

Shared low-level workspace utilities extracted from OpenClaw setup code.

This package intentionally contains only generic helpers:

- path normalization (`expandHome`, `toConfigPath`, `toPosixPath`, `relativeWorkspacePath`)
- filesystem helpers (`ensureDir`, `writeFileIfNeeded`, `ensureSymlink`, `listFilesRecursive`)
- template helpers (`replaceTemplatePlaceholders`, `copyTemplateTree`)

No agent rendering, setup orchestration, or adapter-specific logic is included.

Example:

```js
const { copyTemplateTree } = require("@nmc/memory-workspace");
```

See [Memory OS Roadmap](../../docs/memory-os-roadmap.md) for migration sequencing.

# @nmc/memory-workspace

Shared workspace utilities and scaffold orchestration extracted from OpenClaw setup code.

Surface status: `internal` shared core package inside the product boundary. It
is not a direct install, operator, or bounded connector surface.

This package owns generic filesystem placement concerns:

- path normalization (`expandHome`, `toConfigPath`, `toPosixPath`, `relativeWorkspacePath`)
- filesystem helpers (`ensureDir`, `writeFileIfNeeded`, `ensureSymlink`, `listFilesRecursive`)
- template helpers (`replaceTemplatePlaceholders`, `copyTemplateTree`)
- scaffold helpers (`copyMemoryTemplate`, `copySystemTemplate`, `createSharedSkillsWorkspace`, `scaffoldAgentWorkspace`, `ensureAgentState`)

Agent rendering stays in `@nmc/memory-agents`, and adapter-specific config mutation stays in plugin-local setup code.

Example:

```js
const { copyMemoryTemplate } = require("@nmc/memory-workspace");
```

See [Memory OS Roadmap](../../docs/legacy/memory-os-roadmap.md) for migration sequencing.

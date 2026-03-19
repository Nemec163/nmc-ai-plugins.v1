# @nmc/memory-pipeline

Shared package for engine-agnostic sequencing of the Memory OS pipeline phases.

Surface status: `internal` shared core package inside the product boundary. It
is not a direct install, operator, or adapter surface.

Phases:

- `extract`
- `curate`
- `apply`
- `verify`

This package owns phase ordering, stop-on-error behavior, dry-run handling when
the LLM runner is unavailable, and summary reporting. Adapter-specific wiring
remains outside the package, while Phase C `apply` stays a compatibility phase
name over the core promoter instead of an adapter-owned canon write.

Current surfaces:

- `scripts.pipeline`: canonical shell entrypoint at `bin/run-pipeline.sh`
- `scripts.llmPhaseRunner`: node helper entrypoint at `bin/run-llm-phase.js`
- `PHASES`, `LLM_PHASES`, and `PHASE_TITLES`
- `resolvePhases(selectedPhase)`
- `needsLlmRunner(phases)`
- `phaseTitle(phase)`
- `describeAdapterInvocation(options)`
- `runAdapterInvocation(options)`

The shared pipeline package treats adapters as optional. LLM phase execution
for `extract` and `curate` is resolved from an injected adapter module path,
and the invocation shape is validated through `@nmc/memory-contracts`. Phase C
`apply` remains available in the pipeline UX but executes through the in-process
core promoter. The package-local verify phase now defaults to
`@nmc/memory-scripts`.

The shared runner now resolves relative adapter-module paths from the caller's
current working directory, so peer adapters such as `./packages/adapter-codex`
can participate in the same pipeline UX without OpenClaw-specific wrapper
assumptions.

One adapter-owned entrypoint lives at
`packages/adapter-openclaw/skills/memory-pipeline/pipeline.sh` as a thin wrapper
over this package. That wrapper is adapter-specific, not the primary product
surface.

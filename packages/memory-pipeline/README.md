# @nmc/memory-pipeline

Shared package for engine-agnostic sequencing of the Memory OS pipeline phases:

Surface status: `internal` shared core package inside the product boundary. It
is not a direct install, operator, or bounded connector surface.

- `extract`
- `curate`
- `apply`
- `verify`

This package owns phase ordering, stop-on-error behavior, dry-run handling when the
LLM runner is unavailable, and summary reporting. Adapter-specific wiring remains
outside the package.

Current surfaces:

- `scripts.pipeline`: canonical shell entrypoint at `bin/run-pipeline.sh`
- `scripts.llmPhaseRunner`: node helper entrypoint at `bin/run-llm-phase.js`
- `PHASES`, `LLM_PHASES`, and `PHASE_TITLES`
- `resolvePhases(selectedPhase)`
- `needsLlmRunner(phases)`
- `phaseTitle(phase)`
- `describeAdapterInvocation(options)`
- `runAdapterInvocation(options)`

The shared pipeline package treats connectors as optional. LLM phase execution
is resolved from an injected adapter module path, and the invocation shape is
validated through `@nmc/memory-contracts`. The package-local verify phase now
defaults to `@nmc/memory-scripts` rather than the OpenClaw compatibility shell.

The supported OpenClaw adapter entrypoint lives at
`packages/adapter-openclaw/skills/memory-pipeline/pipeline.sh` as a thin wrapper
over this package.

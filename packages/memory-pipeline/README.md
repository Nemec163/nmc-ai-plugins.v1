# @nmc/memory-pipeline

Shared package for engine-agnostic sequencing of the Memory OS pipeline phases:

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

The shared pipeline package does not hardcode an engine adapter. LLM phase
execution is resolved from an injected adapter module path, and the invocation
shape is validated through `@nmc/memory-contracts`.

The legacy OpenClaw plugin entrypoint remains at
`nmc-memory-plugin/skills/memory-pipeline/pipeline.sh` as a thin wrapper over this
package.

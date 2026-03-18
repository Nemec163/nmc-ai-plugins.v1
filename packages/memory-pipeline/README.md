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
- `PHASES`, `LLM_PHASES`, and `PHASE_TITLES`
- `resolvePhases(selectedPhase)`
- `needsLlmRunner(phases)`
- `phaseTitle(phase)`

The legacy OpenClaw plugin entrypoint remains at
`nmc-memory-plugin/skills/memory-pipeline/pipeline.sh` as a thin wrapper over this
package.

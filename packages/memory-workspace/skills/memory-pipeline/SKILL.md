---
name: memory-pipeline
description: Run the consolidation pipeline in order and stop on the first failed phase.
metadata: {"openclaw":{"os":["darwin","linux"]}}
---

# memory-pipeline

`Skill ID`: `memory-pipeline`
`Type`: `script`
`Trigger`: `schedule (daily 00:00)` or `manual`
`Pipeline Phase`: `Orchestration`
`Entrypoint`: `{baseDir}/pipeline.sh`

## Purpose

Chain the four consolidation phases in order — extract, curate, apply, then verify — so the daily memory pipeline can run consistently and stop immediately on failure.

## System Prompt

```text
Run the pipeline script with a required date and an optional phase selector.

The script is an orchestrator.
It does not replace the phase-specific skills; it invokes them in the correct order and reports progress.

Expected behavior:
1. Accept a required YYYY-MM-DD date argument.
2. Optionally accept --phase extract|curate|apply|verify|all.
3. For LLM phases, invoke the corresponding OpenClaw skill command.
4. For verify, run the local verify script directly.
5. Log each phase start and end with timestamps.
6. Stop immediately if any requested phase exits non-zero.
7. Print a final summary of phases run, success or failure, and total duration.

If the OpenClaw CLI is unavailable for an LLM phase, print the command that would be run and exit with an informational setup error.
```

## Input Contract

- Required argument: `date` in `YYYY-MM-DD` format
- Optional selector: `--phase extract|curate|apply|verify|all`
- Optional environment: `MEMORY_ROOT` to override the default verify target when Phase D runs
- Default behavior: run all four phases sequentially

## Output Contract

- Timestamped phase logs to stdout
- Final summary listing requested phases, run results, and total duration
- Exit code `0` when all requested phases succeed
- Exit code `1` when a requested phase fails
- Exit code `2` for setup or argument errors

## Tools

- Primary executor: `{baseDir}/pipeline.sh`
- OpenClaw CLI for `memory-extract`, `memory-curate`, and `memory-apply`
- Local script execution for `{baseDir}/../memory-verify/verify.sh`
- Standard shell utilities for date handling and reporting

## Constraints

- Do not continue to the next phase after a non-zero exit.
- Do not silently skip a requested phase.
- Do not mutate canon directly inside the orchestrator.
- Do not hide missing CLI or script-path problems.

## Success Criteria

- Requested phases run in the intended order.
- A failed phase stops the remaining pipeline.
- Logs clearly show start, end, and failure boundaries.
- The final summary is usable for manual runs and scheduled automation.

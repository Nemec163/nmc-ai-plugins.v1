---
name: memory-status
description: Run the local status script to report manifest health, backlog risk, and retention alerts.
metadata: {"openclaw":{"os":["darwin","linux"]}}
---

# memory-status

`Skill ID`: `memory-status`
`Type`: `script`
`Trigger`: `manual` or `scheduled`
`Pipeline Phase`: `Diagnostics`
`Entrypoint`: `{baseDir}/status.sh`

## Purpose

Produce a health report for the memory workspace so operators can spot backlog, stale manifest state, and retention problems quickly.

## System Prompt / Execution Contract

```text
Run the status script against the memory workspace root and print a diagnostic report to stdout.

The script is a read-oriented diagnostics tool.
It should summarize the health of the memory repository without mutating canon.

Expected checks:
1. Read core/meta/manifest.json and report the last manifest date and record counts.
2. Count pending intake files under intake/pending/ and identify the oldest pending batch.
3. Alert when pending backlog exceeds seven days.
4. Inspect processed intake retention and flag files older than ninety days.
5. Report edge-export or manifest consistency problems when they are detectable cheaply.

The output should be operator-friendly and suitable for scheduled monitoring.
Warnings should be visible in the report even when the script exits successfully.
```

## Input Contract

- Optional argument: path to the memory workspace root
- Read targets: `core/meta/manifest.json`, `intake/pending/`, `intake/processed/`, and optionally `core/meta/graph/edges.jsonl`
- No user content input is required

## Output Contract

- Primary output: diagnostic report printed to stdout
- Expected report sections: manifest status, record counts, pending backlog, retention findings, and alerts
- Output is informational; it does not commit changes

## Tools

- Primary executor: `{baseDir}/status.sh`
- Local capabilities used by the script: filesystem reads, date comparison, and report formatting
- The skill does not require LLM tools during runtime

## Constraints

- Do not modify canonical files.
- Do not rewrite manifest or graph data.
- Do not hide backlog or retention alerts because they are inconvenient.
- Do not require network access.

## Success Criteria

- The script reports manifest freshness and record-count context.
- The script surfaces pending backlog and retention alerts clearly.
- The report is usable both for manual diagnosis and scheduled checks.

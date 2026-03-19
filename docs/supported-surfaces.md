# Supported Surfaces

This document is the minimal package matrix for the current `MemoryOS.v1`
product boundary. Use it when deciding which package is production, internal,
or retired.

## Support Classes

- `production`: supported public surface for the current repository and shipped
  install story
- `internal`: part of the product boundary, but not a direct install, operator,
  or public connector surface
- `retired`: historical identifier kept only in roadmap and release metadata

## Package Matrix

| Package | Class | Surface | Notes |
|---|---|---|---|
| `memoryos-app` | `production` | standalone app surface | Supported standalone install/run surface with app-owned bootstrap, persistent `memoryos run` host loop, and local CLI over the independent MemoryOS core |
| `adapter-openclaw` | `production` | OpenClaw adapter surface | Supported OpenClaw-specific adapter over the independent MemoryOS core, not the product boundary itself, with plugin bootstrap, setup, skill packaging, and installed-artifact operator wrappers |
| `control-plane` | `production` | read-only operator surface | Supported operator SDK/CLI for snapshot, health, queues, analytics, audits, interventions, and runtime inspection |
| `memory-os-gateway` | `production` | programmatic surface | Supported SDK/CLI for read, bootstrap, query, status, verify, runtime, and safe write orchestration; installed artifacts should prefer adapter-owned wrapper paths |
| `adapter-codex` | `production` | Codex adapter surface | Supported Codex-specific adapter over shared pipeline extract/curate execution, gateway bootstrap/read, and explicit handoff surfaces |
| `adapter-claude` | `production` | Claude adapter surface | Supported Claude-specific adapter over shared pipeline extract/curate execution, gateway bootstrap/read, and explicit handoff surfaces |
| `@nmc/memory-contracts` | `internal` | shared core package | Dependency-free contracts and schema helpers |
| `@nmc/memory-ingest` | `internal` | shared core package | Engine-agnostic source and provenance contracts |
| `@nmc/memory-canon` | `internal` | shared core package | Canon layout, validation, verify, and single-writer promotion boundary |
| `@nmc/memory-maintainer` | `internal` | shared core package | Task, policy, and operational behavior for `system/` |
| `@nmc/memory-workspace` | `internal` | shared core package | Scaffold, filesystem, and template placement helpers |
| `@nmc/memory-agents` | `internal` | shared core package | Role roster, manifests, and render helpers |
| `@nmc/memory-pipeline` | `internal` | shared core package | Engine-agnostic pipeline sequencing |
| `@nmc/memory-scripts` | `internal` | shared core package | Deterministic helper scripts consumed by adapter wrappers and tests |
| `memory-os-runtime` | `internal` | shared core package | Non-authoritative shadow runtime store |
| `adapter-conformance` | `internal` | test-only package | Capability-scoped adapter conformance harness |

The product boundary remains the independent `MemoryOS.v1` core plus the stable
gateway and operator surfaces. Connectors attach to that boundary; they do not
replace it.

## Retired Compatibility Identifiers

- `nmc-memory-plugin`: retired legacy shell; removed from the repository and
  preserved only as a historical identifier in roadmap and release metadata
- `memory-os-gateway ops-snapshot`: retired compatibility bridge; replaced by
  `control-plane`

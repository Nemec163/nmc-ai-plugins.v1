# Supported Surfaces

This document is the minimal package matrix for the current `MemoryOS.v1`
product boundary. Use it when deciding which package is production, bounded,
internal, or retired.

## Support Classes

- `production`: supported public surface for the current repository and shipped
  install story
- `bounded`: intentional connector surface with a narrow contract; not the
  current production install/setup path
- `internal`: part of the product boundary, but not a direct install, operator,
  or public connector surface
- `retired`: historical identifier kept only in roadmap and release metadata

## Package Matrix

| Package | Class | Surface | Notes |
|---|---|---|---|
| `adapter-openclaw` | `production` | OpenClaw install/setup connector | Supported `openclaw memoryos setup` surface and owner of installed-artifact wrappers for `control-plane` and `memory-os-gateway`; it is a connector over the independent MemoryOS core, not the product boundary itself |
| `control-plane` | `production` | read-only operator surface | Supported operator SDK/CLI for snapshot, health, queues, analytics, audits, interventions, and runtime inspection |
| `memory-os-gateway` | `production` | programmatic surface | Supported SDK/CLI for read, bootstrap, query, status, verify, runtime, and safe write orchestration; installed artifacts should prefer adapter-owned wrapper paths |
| `adapter-codex` | `bounded` | Codex connector | Bounded single-run connector over gateway bootstrap, read, and explicit handoff surfaces |
| `adapter-claude` | `bounded` | Claude connector | Bounded Claude connector over gateway bootstrap, read, and explicit handoff surfaces |
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

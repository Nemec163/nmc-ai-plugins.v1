# MemoryOS.v1 Architecture

> Version: `2026-03-19`
> Scope: current repository state, code-defined package surfaces, and supported
> operational flows

This document is the high-level architecture reference for the current
`MemoryOS.v1` repository. It is intentionally narrower than the historical
design notes under [`docs/legacy/`](./legacy/README.md): it describes the live
package boundary, the current standalone-first install/run path, and the
current operational invariants.

For the authoritative package taxonomy, use
[supported-surfaces.md](./supported-surfaces.md). For the production go/no-go
gate, use [release-readiness.md](./release-readiness.md). For migration history,
use [legacy/memory-os-roadmap.md](./legacy/memory-os-roadmap.md).

## Overview

`MemoryOS.v1` is a modular memory system with:

- an internal core package set for canon, ingest, maintainer, workspace, agent,
  script, pipeline, and runtime behavior
- a production programmatic surface in `memory-os-gateway`
- a production read-only operator surface in `control-plane`
- a production standalone app surface in `memoryos-app`
- production peer adapter surfaces in `adapter-openclaw`, `adapter-codex`, and
  `adapter-claude`

The system stays file-first and git-backed. Canonical state lives in Markdown
plus derived JSON/JSONL metadata. Runtime state lives in a shadow store and
remains explicitly non-authoritative.

## Product Boundary

The current boundary is split into two package classes:

| Class | Packages | Role |
|---|---|---|
| `production` | `memoryos-app`, `memory-os-gateway`, `control-plane`, `adapter-openclaw`, `adapter-codex`, `adapter-claude` | Supported public standalone, programmatic, operator, and peer adapter surfaces |
| `internal` | `@nmc/memory-contracts`, `@nmc/memory-ingest`, `@nmc/memory-canon`, `@nmc/memory-maintainer`, `@nmc/memory-workspace`, `@nmc/memory-agents`, `@nmc/memory-pipeline`, `@nmc/memory-scripts`, `memory-os-runtime`, `adapter-conformance` | Shared implementation and test packages inside the product boundary |

## Core Invariants

These rules are visible in code, tests, and release qualification:

- the shared workspace layout under `system/` remains stable
- canon is the only source of truth
- runtime shadow data never writes canon directly
- canon writes stay behind the single promotion path
- projections, read-index data, runtime summaries, and receipts remain
  rebuildable and non-authoritative
- `control-plane` stays read-only
- adapters preserve their host-specific contracts without redefining the
  product boundary
- for the OpenClaw adapter specifically, `openclaw memoryos setup`, plugin
  auto-bootstrap, and `openclaw.plugin.json` remain intact

## Package Layers

### Internal Core

The internal core package set provides the reusable system behavior:

- `@nmc/memory-contracts`: schema constants, record validation, namespace
  helpers, and pipeline adapter contracts
- `@nmc/memory-ingest`: transcript, claim, and batch validation at the ingest
  boundary
- `@nmc/memory-canon`: canon layout, manifest, graph, lock, promoter, and
  verify logic
- `@nmc/memory-maintainer`: task/frontmatter parsing, board settings, and
  policy derivation for the shared system layer
- `@nmc/memory-workspace`: path, filesystem, template-copy, and scaffold
  helpers
- `@nmc/memory-agents`: predefined roster definitions, manifests, and render
  helpers
- `@nmc/memory-pipeline`: extract/curate/apply/verify sequencing and adapter
  invocation helpers
- `@nmc/memory-scripts`: packaged `memory-verify`, `memory-status`,
  `memory-onboard-agent`, and `memory-retention` scripts
- `memory-os-runtime`: non-canonical shadow runtime capture, recall, and
  inspection helpers

### Programmatic Surface: `memory-os-gateway`

`memory-os-gateway` is the supported SDK/CLI surface over the core packages.
The current exported and CLI-visible surface includes:

- record and projection reads
- canonical current reads
- procedure catalog, inspection, and version comparison
- role and workspace bootstrap
- read-index build, read, and verification
- query, runtime delta, and runtime recall bundles
- status, verify, and health
- proposal, feedback, and completion handoff

The gateway owns orchestration of safe write handoff, not direct canon writes.

### Operator Surface: `control-plane`

`control-plane` is the supported read-only operator layer over stable gateway,
runtime, and maintainer contracts. The current CLI surface includes:

- `snapshot`
- `health`
- `queues`
- `analytics`
- `audit`
- `audits`
- `interventions`
- `runtime-inspector`
- `record-intervention`

Its release-qualification metadata also publishes the current package matrix for
the live product boundary.

### Adapter Surfaces

The repository exposes three peer adapters:

- `adapter-openclaw`: production OpenClaw adapter/install surface with
  `openclaw.plugin.json`, `plugin.js`, direct setup, auto-bootstrap, bundled
  skills, and installed wrapper entrypoints for `control-plane` and
  `memory-os-gateway`
- `adapter-codex`: bounded Codex adapter for role-aware bootstrap,
  adapter-neutral `extract` and `curate` execution through the shared
  pipeline contract, bounded single-run execution, and explicit
  gateway-mediated handoff
- `adapter-claude`: bounded Claude adapter over the same bootstrap, read,
  adapter-neutral `extract` and `curate` execution through the shared
  pipeline contract, and handoff contracts

`adapter-conformance` remains an internal test-only package that validates only
the capabilities each adapter explicitly claims.

## Data Model

The repository uses a file-first storage model:

- canon records under `core/user/`, `core/agents/`, and `core/system/`
- intake under `intake/pending/`, `intake/processed/`, `intake/proposals/`, and
  `intake/jobs/`
- derived metadata under `core/meta/`
- runtime shadow state under `runtime/shadow/`

The current contract layer includes `procedure` records in addition to the
traditional `event`, `fact`, `state`, `identity`, and `competence` types.
Derived metadata also includes a non-authoritative read index and digest-backed
verification receipts.

## Workspace Model

The autonomous standalone app owns the default local workspace:

- `~/.memoryos/system/`
- `~/.memoryos/system/memory/`
- `~/.memoryos/{nyx,medea,arx,lev,mnemo}/`
- `~/.memoryos/agents/{nyx,medea,arx,lev,mnemo}/`

The OpenClaw adapter owns its separate host-specific scaffold under
`~/.openclaw/`:

- `~/.openclaw/workspace/system/`
- `~/.openclaw/workspace/system/memory/`
- `~/.openclaw/workspace/{nyx,medea,arx,lev,mnemo}/`
- `~/.openclaw/agents/{nyx,medea,arx,lev,mnemo}/`

Within that adapter-owned layout, the shared execution layer lives under
`~/.openclaw/workspace/system/`:

- `memory/` for canon, intake, metadata, and runtime shadow state
- `skills/` for mirrored bundled skills
- `tasks/` for the file-first kanban source of truth
- `policy/` for shared operational defaults
- `docs/` for system-level notes
- `scripts/` for local helper tooling such as `kanban.mjs`

It also creates predefined per-agent workspaces for `nyx`, `medea`, `arx`,
`lev`, and `mnemo`, plus adapter-managed OpenClaw state directories under
`~/.openclaw/agents/`.

## Pipeline

The current memory pipeline stays four-phase:

1. `extract`
2. `curate`
3. `apply`
4. `verify`

`@nmc/memory-pipeline` owns sequencing and adapter invocation. The supported
OpenClaw entrypoint remains
`packages/adapter-openclaw/skills/memory-pipeline/pipeline.sh`, which delegates
into the shared pipeline package. Peer adapters can now attach their own
extract/curate runner contracts without inheriting OpenClaw skill invocation
assumptions, while Phase C remains core-owned.

## Install And Runtime Paths

The primary local install/run path is the standalone app:

```bash
node ./packages/memoryos-app/bin/memoryos.js init
node ./packages/memoryos-app/bin/memoryos.js run --phase verify --once
node ./packages/memoryos-app/bin/memoryos.js status
```

OpenClaw is one optional adapter. For that host, the supported development
install path is:

```bash
openclaw plugins install ./packages/adapter-openclaw
```

The supported setup command is:

```bash
openclaw memoryos setup
```

Installed artifacts expose adapter-owned wrapper entrypoints:

- `~/.openclaw/extensions/memoryos-openclaw/bin/memory-control-plane.js`
- `~/.openclaw/extensions/memoryos-openclaw/bin/memory-os-gateway.js`
- `~/.openclaw/extensions/memoryos-openclaw/control-plane/`
- `~/.openclaw/extensions/memoryos-openclaw/memory-os-gateway/`

## Verification

The repository uses one explicit production gate plus the regression baseline:

```bash
PATH="/usr/local/bin:$PATH" ./tests/run-production-readiness.sh
PATH="/usr/local/bin:$PATH" ./tests/run-contract-tests.sh
PATH="/usr/local/bin:$PATH" ./tests/run-integration.sh
```

The CI workflow under `.github/workflows/` runs the same
production-readiness gate used for release candidates.

## Current Status

Latest completed slice:

> `connector-neutral extract and curate execution contract`

That slice finished the remaining adapter-biased assumption on the LLM-owned
pipeline phases by letting peer adapters publish their own extract/curate
runner contracts while preserving the shared pipeline UX and the core-owned
promotion boundary.

Next slice:

> `adapter-owned source intake and execution receipt hardening`

Use the roadmap `Immediate Next Step` section as the source of truth before
starting the next bounded implementation change.

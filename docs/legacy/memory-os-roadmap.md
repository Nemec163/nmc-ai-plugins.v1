# MemoryOS.v1 Migration Roadmap

> **Status: Migration Plan with implementation progress tracking**
> This document describes the repository-specific path from legacy OpenClaw-centric packaging toward `MemoryOS.v1`: a modular, engine-agnostic, autonomous memory system with optional connector surfaces. It is a planning and sequencing document, not the current implementation state.

## Progress Snapshot

- completed: `production readiness gate and release checklist — make the current OpenClaw-first release boundary reproducible through one explicit gate, aligned release docs, and CI-backed go/no-go checks`
- next: `TBD after production-readiness hardening — use Immediate Next Step to choose the next bounded change`
- last verified on: `2026-03-19`
- verified in this slice:
  - `PATH="/usr/local/bin:$PATH" ./tests/run-production-readiness.sh`
- verification baseline:
  - `./tests/run-contract-tests.sh`
  - `./tests/run-integration.sh`

## Goal

Evolve this repository into `MemoryOS.v1`: an autonomous Memory OS with optional connectors, without regressing:

- current OpenClaw commands and setup UX
- current plugin config surface
- current workspace layout under `system/`
- current canon on-disk format
- current pipeline semantics and helper scripts

This migration stays inside one monorepo and follows a strangler pattern. The legacy `nmc-memory-plugin` shell is now retired and removed; `packages/adapter-openclaw` is the supported OpenClaw surface while the repository continues toward a broader connector set.

## Non-Negotiable Constraints

1. Do not change the canon on-disk format in the same release as the module split.
2. Do not break `openclaw memoryos setup`, auto-bootstrap, or `openclaw.plugin.json`.
3. Do not change the default workspace layout under `~/.openclaw/workspace/`.
4. Do not allow runtime memory to write canon directly.
5. Do not allow adapters, UI surfaces, or ad hoc scripts to bypass the single promotion path into canon.
6. Do not treat projections, status views, or summaries as source of truth.
7. Every projection must remain rebuildable from canon and must never become authoritative.
8. Concurrent canon mutation must be prevented by a lock or single-writer strategy enforced at the canon write boundary.
9. Do not split into separate repositories during the initial migration.
10. Do not replace the existing integration script as the main regression gate during extraction.
11. Do not grant a second engine write access to canon before a deterministic core promotion path exists.
12. Do not let control-plane own canon mutation, scheduler logic, or promotion logic.
13. Do not onboard new source engines before provenance and source contracts are formalized.
14. Runtime memory must remain non-authoritative in every version. In v1 it should be disposable and rebuildable; later it may persist, but it must never become a second truth layer or write canon directly.

## Target Module Map

The base system consists of contracts, ingest, canon, maintainer, gateway, adapters, runtime, and control-plane. These modules define the minimal Memory OS architecture, but they are still extracted in dependency order alongside repo-specific extensions where that reduces migration risk. Pipeline, scripts, workspace, and agents augment the base system but are not part of the minimal Memory OS architecture.

In this document, `@nmc/...` names represent shared package boundaries, while unscoped names represent app-level or internal packages that may still live in the same monorepo.

### Base System Modules

#### `@nmc/memory-contracts`

Owns the shared constitutional contract of the system:

- record envelopes and validation types
- proposal, job, and role manifest schemas
- adapter protocol interfaces
- shared error and exit-code semantics
- contract versioning and compatibility policy

This module holds schema shapes, interfaces, constants, and descriptors only. It must stay dependency-free and is imported by canon, maintainer, gateway, runtime, and both adapters without pulling in canon storage logic.

#### `@nmc/memory-ingest`

Owns engine-agnostic source normalization and provenance at the system boundary:

- normalized source envelopes
- transcript, run, session, and observation schema
- source manifests and content references
- evidence span and chunk references
- manual note import contract
- future external source adapter contracts

The ingest contract should formalize fields such as:

- `source_id`
- `source_kind`
- `engine`
- `run_id` or `session_id`
- `observed_at`
- `actor`
- `content_ref`
- `span_ref`
- `ingested_at`

This module prevents the Memory OS from remaining implicitly OpenClaw-shaped after extraction. It should depend on `@nmc/memory-contracts` only.

#### `@nmc/memory-canon`

Owns the canonical memory contract:

- record envelope and validation rules
- schema versioning policy
- manifest and graph contracts
- canon directory structure contract
- import/export and projection rules over time
- lock and single-writer enforcement at the canon write boundary

This module owns storage-aware validation, canonical write invariants, and the canonical write boundary. In the target architecture, canon is written only through the deterministic promoter in core code.

PR 1.2 should define the canonical write boundary, lock semantics, and promoter interface in core. During migration, the legacy `apply` path may remain the active writer until PR 3.2b transfers final canon-write ownership to the promoter.

This module is grounded in:

- `docs/memory-design-v2.md`
- `docs/human-memory.md`
- `nmc-memory-plugin/templates/workspace-memory/`
- the current `verify.sh` scanning behavior

#### `@nmc/memory-maintainer`

Owns the task, policy, and operational execution contract around the shared `system/` layer:

- file-first kanban contract
- `kanban-operator`
- task lifecycle and defaults
- policy bundles under `system/policy/`
- operational helpers under `system/scripts/`
- future job, lease, and maintainer contracts
- scheduling, retries, and maintenance jobs
- backlog and degraded-mode policies

This module exists because the repository already contains a real shared execution layer, not just memory files.

It owns maintainer behavior and contracts, not workspace scaffolding or role-definition content.

### Ownership Boundary for Workspace, Agents, and Maintainer

- `@nmc/memory-workspace` owns copying, rendering, placement, and file-system orchestration only.
- `@nmc/memory-agents` owns role roster definitions, machine-readable manifests, and role-content templates.
- `@nmc/memory-maintainer` owns the semantic behavior and contracts of tasks, policies, shared scripts, and operational docs.

If a concern is about where files go, it belongs to workspace.
If it is about what a role is, it belongs to agents.
If it is about how shared operational behavior works, it belongs to maintainer.

#### `memory-os-gateway`

Owns the unified programmatic entrypoint over canon, scripts, and later runtime:

- read and bootstrap surfaces first:
- `read_record`
- `get_projection`
- `get_canonical_current`
- `get_role_bundle`
- `bootstrap(role)`
- `query`
- `status`
- `verify`
- `health`
- safe write orchestration surfaces next:
- `propose`
- `lease_job`
- `complete_job`
- `feedback`

It starts as an in-process SDK and CLI surface. Server transport is explicitly later. For every caller outside `@nmc/memory-canon` itself, the gateway is the only public entrypoint into the canon promotion path. It must expose enough read and bootstrap surface for a second adapter to operate without file-level coupling to canon, workspace, agents, or maintainer internals.

#### `adapter-openclaw`

Owns OpenClaw-specific behavior only:

- plugin registration
- runtime bootstrap hook
- setup CLI wiring
- `openclaw.json` mutations
- OpenClaw skill definitions
- OpenClaw pipeline adapter for LLM phases

This adapter must end up as a thin compatibility shell over extracted core modules.

#### `adapter-codex`

Future stateless runner adapter. It should prove the architecture is truly engine-agnostic by supporting:

- role-aware bootstrap
- single-thread job execution
- proposal/result upload
- read-only canon operations first

#### `memory-os-runtime`

Owns non-canonical agent memory in shadow mode first:

- episodic runtime memory
- semantic runtime cache
- procedural memory
- procedure feedback, history, and evolution
- recall bundles
- retrieval logs and traces
- triggers and reflections
- runtime graph and cache
- promotion candidates
- freshness boundaries between canonical current and runtime delta

It must begin in shadow mode only and never write canon directly. In v1, runtime artifacts may be treated as disposable and rebuildable from canon plus captured runtime inputs. In later versions, runtime may remain persistent and useful across runs, but it must stay non-authoritative and must never become a second truth layer.

#### `control-plane`

Owns operator-facing surfaces over stable gateway, runtime, and maintainer capabilities:

- read-only health and pipeline visibility first
- backlog and degraded-mode inspection
- later approvals, queues, and runtime inspection

It does not own canon mutation, scheduler logic, or promotion logic.

### Projection Invariant

Projections are a bounded context, not a source of truth. This includes:

- `state/current`
- `identity/current`
- domain dossiers and summaries
- agent views such as `COURSE`, `PLAYBOOK`, `PITFALLS`, and `DECISIONS`
- system and profile bundles

Every projection must be derived from canon and fully rebuildable from canon alone. Projections may be cached, materialized, and served through the gateway, but they must never become authoritative inputs to promotion.

### Repo-Specific Extension Modules

#### `@nmc/memory-pipeline`

Owns engine-agnostic orchestration of:

- extract
- curate
- apply
- verify

It should define phase sequencing, stop-on-error behavior, and checkpoints while consuming a narrow adapter interface from `@nmc/memory-contracts` for the LLM-driven phases. The final canonical write path remains outside adapter ownership even if `apply` survives temporarily as a compatibility phase name.

#### `@nmc/memory-scripts`

Owns deterministic helper scripts that are already engine-agnostic:

- `memory-verify`
- `memory-status`
- `memory-retention`
- `memory-onboard-agent`

These scripts should be extracted first because they already have low coupling and strong regression value.

#### `@nmc/memory-workspace`

Owns reusable scaffolding and file operations:

- workspace template copying
- shared `system/` scaffolding
- canon workspace scaffolding
- agent workspace scaffolding
- symlink creation
- managed template rendering helpers

This is the first step toward making the memory system usable outside OpenClaw.

It owns placement and file-system orchestration only, not role semantics or maintainer behavior.

#### `@nmc/memory-agents`

Owns the predefined role registry, machine-readable manifests, and rendering contracts:

- `nyx`
- `medea`
- `arx`
- `lev`
- `mnemo`

It should hold roster definitions, machine-readable role manifests, role policies, and generated agent file content, while allowing adapters to inject engine-specific hints and paths.

It owns role definitions and rendered role content, not workspace placement or maintainer semantics.

## Current Repository to Future Module Mapping

### Contracts

Current sources:

- `docs/memory-design-v2.md`
- `docs/human-memory.md`
- implicit record, pipeline, and setup contracts currently enforced through `verify.sh`, `pipeline.sh`, and setup behavior

Future home:

- `@nmc/memory-contracts`

### Ingestion and Provenance

Current sources:

- `nmc-memory-plugin/skills/memory-extract/`
- transcript and observation assumptions currently embedded in extract prompts and shell flows
- evidence references currently implied by OpenClaw-shaped source inputs

Future home:

- `@nmc/memory-ingest`

### Canon

Current sources:

- `nmc-memory-plugin/templates/workspace-memory/core/system/CANON.md`
- `nmc-memory-plugin/templates/workspace-memory/core/system/curator-runbook.md`
- `nmc-memory-plugin/templates/workspace-memory/core/meta/manifest.json`
- `nmc-memory-plugin/templates/workspace-memory/core/meta/graph/edges.jsonl`

Future home:

- `@nmc/memory-canon`

### Deterministic Scripts

Current sources:

- `nmc-memory-plugin/skills/memory-verify/verify.sh`
- `nmc-memory-plugin/skills/memory-status/status.sh`
- `nmc-memory-plugin/skills/memory-retention/retention.sh`
- `nmc-memory-plugin/skills/memory-onboard-agent/onboard.sh`

Future home:

- `@nmc/memory-scripts`

### Pipeline

Current sources:

- `nmc-memory-plugin/skills/memory-pipeline/pipeline.sh`
- `nmc-memory-plugin/skills/memory-extract/`
- `nmc-memory-plugin/skills/memory-curate/`
- `nmc-memory-plugin/skills/memory-apply/`

Future home:

- sequencing and contracts in `@nmc/memory-pipeline`
- OpenClaw skill packaging in `adapter-openclaw`

### Query and Read Surfaces

Current sources:

- `nmc-memory-plugin/skills/memory-query/`

Future home:

- read/query contract in `memory-os-gateway`
- OpenClaw skill packaging in `adapter-openclaw` until the gateway becomes the default read path

### Workspace Scaffolding

Current sources:

- `nmc-memory-plugin/lib/openclaw-setup.js`
- `nmc-memory-plugin/templates/workspace-memory/`
- `nmc-memory-plugin/templates/workspace-system/`

Future home:

- generic file and scaffold logic in `@nmc/memory-workspace`
- OpenClaw-specific config writes in `adapter-openclaw`

### Agent Registry

Current sources:

- `PREDEFINED_AGENTS` in `nmc-memory-plugin/lib/openclaw-setup.js`
- `nmc-memory-plugin/templates/workspace-memory/core/agents/`

Future home:

- `@nmc/memory-agents`

### Maintainer and Kanban Layer

Current sources:

- `nmc-memory-plugin/skills/kanban-operator/`
- `nmc-memory-plugin/templates/workspace-system/tasks/`
- `nmc-memory-plugin/templates/workspace-system/policy/`
- `nmc-memory-plugin/templates/workspace-system/scripts/kanban.mjs`
- `nmc-memory-plugin/templates/workspace-system/scripts/git-iteration-closeout.sh`
- `nmc-memory-plugin/templates/workspace-system/docs/`

Future home:

- shared task/policy/script contracts in `@nmc/memory-maintainer`
- OpenClaw skill packaging in `adapter-openclaw`

### OpenClaw Adapter

Current sources:

- `nmc-memory-plugin/index.js`
- `nmc-memory-plugin/openclaw.plugin.json`
- `nmc-memory-plugin/scripts/setup-openclaw.js`
- OpenClaw-oriented sections of `nmc-memory-plugin/lib/openclaw-setup.js`
- all OpenClaw `SKILL.md` files

Future home:

- `adapter-openclaw`

### Regression Baseline

Current sources:

- `nmc-memory-plugin/tests/run-integration.sh`
- `nmc-memory-plugin/tests/fixtures/`

These stay the primary regression baseline until replacement contract tests fully cover them.

## Freeze Baseline Before Extraction

No code movement should start before these baseline artifacts are frozen.

### Golden Fixtures

Create or freeze, depending on what already exists in the repo, and then defend:

- scaffolded workspace structure from `nmc-memory-plugin/tests/fixtures/workspace/`
- transcript fixture inputs from `nmc-memory-plugin/tests/fixtures/transcripts/`
- verify output shape, including manifest counts and edge rebuild behavior
- status output shape and alert thresholds
- onboard output shape for a new role slice
- pipeline dry-run behavior when `openclaw` is unavailable
- setup behavior and managed `openclaw.json` shape

### Contract Tests

Add explicit tests for:

- record envelope validity and required YAML fields
- manifest schema shape and stable counters
- graph edge line format and dangling-edge behavior
- workspace layout after setup
- config merge and idempotence for OpenClaw setup
- pipeline phase input/output contracts
- script exit codes and warning semantics

The current integration script remains mandatory at every extraction step.

### Adapter Conformance Tests

A shared adapter conformance suite is introduced in PR 3.4 and becomes mandatory before Exit Phase 4. It is not part of the Phase 0 baseline freeze.

## PR-by-PR Migration Sequence

### Phase 0: Freeze and Carve Boundaries

#### PR 0.1: Golden Fixture Freeze

Status: done on `2026-03-16`

Implementation note:

- frozen fixture workspace tree in test goldens
- added additive contract tests in `nmc-memory-plugin/tests/run-contract-tests.sh`
- froze legacy curated intake batch shape and canonical checksum baseline
- verified with `./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `./nmc-memory-plugin/tests/run-integration.sh`

Add contract tests that lock down:

- current workspace scaffold
- current manifest and status semantics
- current helper-script outputs and exit codes
- current pipeline dry-run behavior
- current legacy `apply` output shape for frozen curate fixtures used later for promoter parity

Acceptance criteria:

- `./nmc-memory-plugin/tests/run-integration.sh` passes unchanged
- new tests are additive only
- no runtime or layout changes

Rollback:

- revert PR; there is no user-facing behavior change

#### PR 0.2: Package Skeletons Only

Status: done on `2026-03-17`

Implementation note:

- added a root npm workspace manifest scoped to `packages/*` only
- created placeholder package manifests and READMEs for all target Phase 0 package boundaries
- left `nmc-memory-plugin` imports, packaging, runtime behavior, and workspace layout unchanged
- verified with a Node structural check covering all 14 package skeletons
- verified with `npm pkg get name --workspaces`
- verified with `npm pack --dry-run` from `nmc-memory-plugin/`
- verified with `./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `./nmc-memory-plugin/tests/run-integration.sh`

Create placeholder packages:

- `packages/memory-contracts`
- `packages/memory-ingest`
- `packages/memory-canon`
- `packages/memory-pipeline`
- `packages/memory-scripts`
- `packages/memory-workspace`
- `packages/memory-agents`
- `packages/memory-maintainer`
- `packages/memory-os-gateway`
- `packages/memory-os-runtime`
- `packages/adapter-openclaw`
- `packages/adapter-codex`
- `packages/adapter-conformance`
- `packages/control-plane`

At the same time, establish the package-loading approach for the monorepo. The default path should be a simple workspace setup using the existing Node toolchain, not custom build machinery.

Acceptance criteria:

- no imports are switched yet
- no packaging behavior changes

Rollback:

- remove stubs

### Phase 1: Extract Base System Core

#### PR 1.1: Extract `@nmc/memory-contracts`

Status: done on `2026-03-17`

Implementation note:

- replaced the placeholder `@nmc/memory-contracts` package with dependency-free CommonJS exports
- centralized shared record-envelope constants, schema-version compatibility helpers, and exit-code semantics
- added pure record-envelope validators without canon storage or runtime behavior
- added a fixture-backed Node proof test and wired it into `./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `node packages/memory-contracts/test/validate-fixtures.js`
- verified with `node -e "const contracts = require('./packages/memory-contracts'); console.log(Object.keys(contracts).sort().join('\n'))"`
- verified with `cd packages/memory-contracts && npm pack --dry-run`
- verified with `./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `./nmc-memory-plugin/tests/run-integration.sh`

Formalize and centralize the shared cross-module contracts:

- record, proposal, job, and role manifest schemas
- adapter protocol interfaces
- shared error and exit-code semantics
- contract versioning and compatibility rules

Acceptance criteria:

- contracts can be imported by other packages without pulling canon storage code
- fixture record envelopes validate through the new package
- no runtime behavior or on-disk format changes land in this PR

Main risk:

- drawing the boundary too broadly and pulling implementation logic into contracts

Rollback:

- move shared schemas and protocol definitions back behind package-local code

#### PR 1.1b: Extract `@nmc/memory-ingest`

Status: done on `2026-03-17`

Implementation note:

- replaced the placeholder `@nmc/memory-ingest` package with pure CommonJS ingest and provenance exports
- formalized transcript event, extracted claim, normalized source envelope, evidence ref, span ref, and manual note import validators
- kept the ingest package scoped to `@nmc/memory-contracts` semantics without changing plugin runtime behavior or fixture formats
- added a fixture-backed Node proof test covering transcript JSONL inputs, intake claim envelopes, and canonical evidence refs
- wired the ingest fixture validation into `./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `node packages/memory-ingest/test/validate-fixtures.js`
- verified with `node -e "const ingest = require('./packages/memory-ingest'); console.log(Object.keys(ingest).sort().join('\n'))"`
- verified with `cd packages/memory-ingest && npm pack --dry-run`
- verified with `./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `./nmc-memory-plugin/tests/run-integration.sh`

Formalize and centralize source and provenance normalization:

- normalized source envelopes
- engine, run, session, and observation references
- content and span reference contracts for evidence
- manual note import contract

Acceptance criteria:

- fixture transcripts and source references validate through the ingest package
- extract can consume ingest contracts without behavior changes
- no runtime behavior or setup changes land in this PR

Main risk:

- over-designing ingestion before multiple external sources exist

Rollback:

- move source and provenance normalization back behind extract-local code

#### PR 1.2: Extract `@nmc/memory-canon`

Status: done on `2026-03-17`

Implementation note:

- replaced the placeholder `@nmc/memory-canon` package with CommonJS canon exports for layout, manifest, graph, lock, promoter, and verify concerns
- moved canon-aware manifest rebuilding, checksum derivation, and graph edge filtering/appending behind shared package logic
- kept the existing `verify.sh` entrypoint and output contract while making it consume the shared canon verification implementation
- formalized the canon write-boundary skeleton with explicit lock and promoter request contracts without replacing the legacy `apply` path
- added a fixture-backed Node proof test for canon validation and derived metadata, and wired it into `./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `node packages/memory-canon/test/validate-fixtures.js`
- verified with `node packages/memory-contracts/test/validate-fixtures.js`
- verified with `node packages/memory-ingest/test/validate-fixtures.js`
- verified with `./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `./nmc-memory-plugin/tests/run-integration.sh`

Formalize:

- record schema rules
- manifest contract
- graph edge contract
- canon layout contract
- projection rebuild rules
- lock and single-writer boundary
- canon write boundary, lock semantics, and promoter interface skeleton for canonical writes

Acceptance criteria:

- fixture records validate through the shared contracts package
- `verify.sh` consumes shared canon logic without output changes
- canon write boundary, lock semantics, and promoter interface are defined in core
- legacy `apply` may remain the active writer until PR 3.2b transfers final canon-write ownership to the promoter
- no file-format changes land in this PR

At this stage, the promoter exists as the canonical write boundary and interface contract, but it does not yet replace the legacy apply path as the active writer.

Main risk:

- turning implicit rules into code may surface edge cases that current fixtures do not yet cover

Rollback:

- move validation logic back behind `verify.sh`

#### PR 1.3: Extract `@nmc/memory-maintainer`

Status: done on `2026-03-17`

Implementation note:

- replaced the placeholder `@nmc/memory-maintainer` package with CommonJS exports for kanban constants, frontmatter parsing, task validation, settings validation, and task-policy derivation
- kept `system/scripts/kanban.mjs` as the reference CLI while allowing it to consume extracted maintainer contract constants when the package is locally available
- preserved the existing `system/` scaffold and current `.kanban.json` semantics without changing workspace layout or user-facing paths
- kept `kanban-operator` behavior and command surface stable while recording `@nmc/memory-maintainer` as the contract source
- added a fixture-backed maintainer package proof test and wired it into `./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `node packages/memory-maintainer/test/validate-fixtures.js`
- verified with `npm test --workspace packages/memory-maintainer`
- verified with `./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `./nmc-memory-plugin/tests/run-integration.sh`

Move shared non-canon execution contracts:

- `system/tasks/`
- `system/policy/`
- `system/scripts/`
- `system/docs/`
- `kanban-operator`

Acceptance criteria:

- current kanban layout and `.kanban.json` semantics stay stable
- `kanban.mjs` remains the reference CLI
- shared `system/` scaffold still includes tasks, policy, scripts, and docs

Main risk:

- accidentally burying task/policy behavior inside memory-specific modules

Rollback:

- return maintainer assets and contracts to plugin-local ownership

### Phase 1b: Extract Repo-Specific Extensions

These packages reflect separable concerns in the current repository, but they extend the base Memory OS rather than redefining it.

#### PR 1b.1: Extract `@nmc/memory-scripts`

Status: done on `2026-03-17`

Implementation note:

- replaced the placeholder `@nmc/memory-scripts` package with extracted deterministic helper scripts under `bin/`
- preserved legacy plugin entrypoints under `nmc-memory-plugin/skills/*/*.sh` through thin `exec` wrappers so existing paths remain valid
- kept `verify.sh` behavior stable while moving its `memory-canon` CLI lookup to a sibling package-relative path
- added a fixture-backed package proof test for script presence, executability, exported paths, and `bash -n` validation
- verified with `node packages/memory-scripts/test/validate-fixtures.js`
- verified with `./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `./nmc-memory-plugin/tests/run-integration.sh`

Move deterministic scripts into a package while preserving current entrypoints through wrappers or symlinks.

Acceptance criteria:

- old script paths still work
- exit codes and stdout/stderr semantics remain stable
- integration tests pass unchanged

Main risk:

- path breakage or executable bit drift

Rollback:

- restore direct local ownership of scripts in `nmc-memory-plugin/skills/`

#### PR 1b.2: Extract `@nmc/memory-workspace` Utilities

Status: done on `2026-03-17`

Implementation note:

- replaced the placeholder `@nmc/memory-workspace` package with shared path, filesystem, and template-copy helpers extracted from `openclaw-setup.js`
- kept agent rendering, workspace scaffolding ownership, and OpenClaw config orchestration in `nmc-memory-plugin/lib/openclaw-setup.js`
- updated `openclaw-setup.js` to consume extracted helpers from `@nmc/memory-workspace` while keeping a source-tree fallback for direct repo execution and lazy loading for no-op runtime bootstrap paths
- added a fixture-backed workspace utility proof test and wired it into `./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `node packages/memory-workspace/test/validate-fixtures.js`
- verified with `node --check nmc-memory-plugin/lib/openclaw-setup.js`
- verified with `./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `./nmc-memory-plugin/tests/run-integration.sh`

Pull out generic functions from `nmc-memory-plugin/lib/openclaw-setup.js`, including:

- directory creation
- template copying
- symlink handling
- path normalization
- placeholder replacement

Acceptance criteria:

- `openclaw-setup.js` imports utility code from the package
- setup output is byte-for-byte compatible where expected

Main risk:

- subtle path normalization changes across setup cases

Rollback:

- inline helpers back into `openclaw-setup.js`

#### PR 1b.3: Extract `@nmc/memory-agents`

Status: done on `2026-03-17`

Implementation note:

- replaced the placeholder `@nmc/memory-agents` package with CommonJS exports for the predefined roster, machine-readable role manifests, role bundles, and workspace-file render helpers
- moved predefined role definitions and agent workspace rendering out of `nmc-memory-plugin/lib/openclaw-setup.js` while keeping workspace placement, symlink creation, state scaffolding, and OpenClaw config mutation in plugin-local setup code
- preserved existing generated role workspaces by freezing deterministic render output in a new package validation test that checks all 50 generated agent workspace files by SHA-256
- kept `openclaw-setup.js` backward compatible by re-exporting `PREDEFINED_AGENTS` through a lazy package loader with the same source-tree fallback pattern used by earlier extracted packages
- wired `@nmc/memory-agents` validation into `./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `node --check packages/memory-agents/index.js`
- verified with `node --check packages/memory-agents/lib/roster.js`
- verified with `node --check packages/memory-agents/lib/manifest.js`
- verified with `node --check packages/memory-agents/lib/render.js`
- verified with `node --check nmc-memory-plugin/lib/openclaw-setup.js`
- verified with `node packages/memory-agents/test/validate-fixtures.js`
- verified with `node -e "const agents = require('./packages/memory-agents'); console.log(Object.keys(agents).sort().join('\n'))"`
- verified with `cd packages/memory-agents && npm pack --dry-run`
- verified with `./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `./nmc-memory-plugin/tests/run-integration.sh`

Move:

- predefined roster definitions
- machine-readable role manifests
- role text generation
- agent-file rendering helpers

Acceptance criteria:

- generated agent slices match current fixtures
- OpenClaw setup still produces the same role workspaces
- role bundles can be consumed without markdown parsing

Main risk:

- accidental introduction of engine-specific assumptions into the core role registry

Rollback:

- restore agent rendering to `openclaw-setup.js`

#### PR 1b.4: Extract `@nmc/memory-workspace` Scaffolding

Status: done on `2026-03-17`

Implementation note:

- extended `@nmc/memory-workspace` with package-owned scaffold orchestration for memory template copy, system template copy, shared skill workspace wiring, agent workspace materialization, and agent state directory setup
- kept `@nmc/memory-workspace` independent from `@nmc/memory-agents` by moving only placement into the workspace package while leaving role rendering in `@nmc/memory-agents`
- updated `nmc-memory-plugin/lib/openclaw-setup.js` to orchestrate rendered agent files through the extracted workspace scaffold API while keeping OpenClaw config mutation and adapter-specific setup semantics plugin-local
- expanded the workspace package proof test to cover scaffold helpers, symlink creation, placeholder replacement, and idempotence
- verified with `node --check packages/memory-workspace/lib/scaffold.js`
- verified with `node --check packages/memory-workspace/index.js`
- verified with `node --check packages/memory-workspace/test/validate-fixtures.js`
- verified with `node --check nmc-memory-plugin/lib/openclaw-setup.js`
- verified with `node packages/memory-workspace/test/validate-fixtures.js`
- verified with `node packages/memory-agents/test/validate-fixtures.js`
- verified with `node nmc-memory-plugin/scripts/setup-openclaw.js --state-dir <tmp> smoke`
- verified with `./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `./nmc-memory-plugin/tests/run-integration.sh`

Move higher-level scaffold operations:

- memory template copy
- system template copy
- shared skill workspace wiring
- agent workspace scaffold

Acceptance criteria:

- OpenClaw setup still produces the current `system/` layout and symlinks
- no `openclaw.json` behavior changes

Main risk:

- hidden coupling between scaffold generation and OpenClaw config updates

Rollback:

- return orchestration to current plugin-local setup code

#### PR 1b.5: Extract `@nmc/memory-pipeline`

Status: done on `2026-03-18`

Implementation note:

- extracted package-owned phase sequencing into `packages/memory-pipeline/bin/run-pipeline.sh` while preserving the existing shell contract for argument parsing, dry-run output, summary formatting, stop-on-error behavior, and memory-root detection
- added `@nmc/memory-pipeline` package exports for phase constants and selection helpers without introducing a second adapter-facing abstraction ahead of Phase 3.2
- reduced `nmc-memory-plugin/skills/memory-pipeline/pipeline.sh` to a thin compatibility wrapper that injects the legacy verify entrypoint path and delegates execution to the shared package script
- added a package proof test for the extracted pipeline entrypoint, exports, wrapper wiring, and shell syntax
- verified with `bash -n packages/memory-pipeline/bin/run-pipeline.sh`
- verified with `bash -n nmc-memory-plugin/skills/memory-pipeline/pipeline.sh`
- verified with `node packages/memory-pipeline/test/validate-fixtures.js`
- verified with `./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `./nmc-memory-plugin/tests/run-integration.sh`

Move sequencing and engine-agnostic pipeline contracts into a dedicated extension package:

- extract
- curate
- apply
- verify sequencing
- checkpoints and stop-on-error behavior

Acceptance criteria:

- `pipeline.sh` behavior remains unchanged
- failure handling and dry-run semantics remain unchanged
- phase sequencing is owned by the package rather than adapter-local shell logic

Main risk:

- over-abstracting before a second adapter exists

Rollback:

- revert to current plugin-local sequencing

### Phase 2: Introduce Gateway

#### PR 2.1: Introduce `memory-os-gateway` as In-Process SDK

Status: done on `2026-03-18`

Implementation note:

- introduced `packages/memory-os-gateway` as a shared CommonJS SDK and JSON CLI over canon reads, projection/current reads, role bundles, workspace and role bootstrap, query, status, verify, and health operations
- kept write orchestration out of scope while returning structured data from gateway APIs and preserving projection rebuildability from canon
- switched `nmc-memory-plugin/lib/openclaw-setup.js` to consume gateway bootstrap orchestration while keeping OpenClaw-specific config mutation inside the adapter layer
- added package proof tests and folded the new gateway fixture validation into the existing contract baseline without replacing the repository regression gates
- verified with `node packages/memory-os-gateway/test/validate-fixtures.js`
- verified with `./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `./nmc-memory-plugin/tests/run-integration.sh`

Start with read and bootstrap operations:

- `read_record`
- `get_projection`
- `get_canonical_current`
- `get_role_bundle`
- `bootstrap(role)`
- `query`
- `status`
- `verify`
- `health`

Acceptance criteria:

- core read and bootstrap flows can be invoked without going through adapter-local file code
- adapters can consume role and context data through gateway APIs rather than package internals
- gateway returns structured data, not only formatted text

Main risk:

- prematurely expanding the API surface

Rollback:

- remove package and keep direct calls

#### PR 2.2: Add Safe Proposal and Write-Orchestration Surfaces

Status: done on `2026-03-18`

Implementation note:

- extended `packages/memory-os-gateway` with non-authoritative `propose`, `feedback`, and `completeJob` surfaces while leaving `lease_job` out of scope until job contracts are formalized
- routed reviewed proposal batches into pipeline-compatible `intake/pending/YYYY-MM-DD.md` materialization instead of granting direct canon write access
- added non-canonical `intake/proposals/` and `intake/jobs/` orchestration receipts so adapters can submit and complete mediated write flows without file-level canon knowledge
- exposed canon lock read/acquire/release helpers in `@nmc/memory-canon` and verified lock scaffolding through both direct helpers and the promoter interface without transferring final canon serialization ownership
- added package proof coverage for safe write orchestration and folded the new gateway/canon checks into the existing regression baseline
- verified with `node packages/memory-canon/test/validate-fixtures.js`
- verified with `node packages/memory-os-gateway/test/validate-fixtures.js`
- verified with `./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `./nmc-memory-plugin/tests/run-integration.sh`

Add safe orchestration APIs before a second adapter gets a write-capable path:

- `propose`
- `feedback`
- `complete_job`
- optional `lease_job` when the contracts are ready

Before PR 3.2b lands, these surfaces should route proposals and feedback into the existing pipeline-compatible path or queue without granting direct canon write authority.

Acceptance criteria:

- no future adapter needs direct canon write access for full runs
- write orchestration remains non-authoritative until the promoter owns final canon serialization
- single-writer lock scaffolding is reachable through core write paths

Main risk:

- exposing write orchestration before job semantics are formal enough

Rollback:

- keep write orchestration behind package-local callers only

### Phase 2.5: Temporary Ops Harness / Eval Surface

Status: done on `2026-03-18`

Implementation note:

- extended `packages/memory-os-gateway` with a temporary `ops-snapshot` read model that inspects proposal receipts, job receipts, active canon locks, backlog state, degraded-mode signals, verify output, and current canonical projections without introducing new write authority
- kept the harness explicitly migration-scoped and disposable by packaging it as a read-only gateway SDK/CLI surface instead of a durable control-plane contract
- derived conflict visibility from existing gateway-backed receipts and canon lock state so operators can inspect orphan jobs, missing handoff artifacts, invalid lock state, and other write-path inconsistencies without direct file spelunking
- added package proof coverage for SDK and CLI inspection flows, including proposal/job receipt summaries, conflict detection, active lock visibility, degraded-mode inspection, and current projection exposure
- verified with `node packages/memory-os-gateway/test/validate-fixtures.js`
- verified with `./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `./nmc-memory-plugin/tests/run-integration.sh`

Add a temporary gateway-backed operator surface over the gateway:

- read-only job, proposal, and conflict visibility
- verify, status, and lock visibility
- degraded-mode and backlog inspection
- current projection visibility

This is a temporary gateway-backed operator surface used to inspect jobs, proposals, locks, projections, and degraded modes before the formal `control-plane` package is introduced.

Acceptance criteria:

- operators can inspect system state without direct file spelunking
- the harness is explicitly migration-scoped and disposable
- no canon or runtime authority moves into the UI surface

Main risk:

- letting a thin ops layer quietly become a second control-plane

Rollback:

- fall back to gateway CLI inspection only

### Phase 3: Isolate `adapter-openclaw` as Thin Facade

#### PR 3.1: Move OpenClaw Registration and Config Logic

Status: done on `2026-03-18`

Implementation note:

- moved OpenClaw-specific setup orchestration, `openclaw.json` mutation, managed bindings, and `memorySearch.extraPaths` registration into `packages/adapter-openclaw/lib/openclaw-setup.js`
- moved standalone setup CLI parsing into `packages/adapter-openclaw/lib/setup-cli.js` and runtime registration into `packages/adapter-openclaw/lib/register.js`
- reduced `nmc-memory-plugin/index.js`, `nmc-memory-plugin/lib/openclaw-setup.js`, and `nmc-memory-plugin/scripts/setup-openclaw.js` to thin compatibility shells over the adapter package while preserving the existing plugin entrypoint and setup command surface
- verified with `node packages/adapter-openclaw/test/validate-fixtures.js`
- verified with `./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `./nmc-memory-plugin/tests/run-integration.sh`

Concentrate engine-specific behavior into `adapter-openclaw`:

- plugin manifest
- CLI option parsing
- auto-bootstrap lifecycle
- `openclaw.json` reads/writes
- managed bindings
- `memorySearch.extraPaths`

Acceptance criteria:

- `openclaw nmc-memory setup` remains identical
- auto-bootstrap still works
- config merge behavior stays idempotent

Main risk:

- silent config drift if merge semantics change

Rollback:

- move adapter code back under `nmc-memory-plugin/`

#### PR 3.2: Introduce a Narrow Pipeline Adapter Interface

Status: done on `2026-03-18`

Implementation note:

- added a minimal LLM-phase invocation contract to `@nmc/memory-contracts` for `extract`, `curate`, and transitional `apply` without extending adapter authority into canon writes
- implemented the OpenClaw-backed phase invocation descriptor in `packages/adapter-openclaw/lib/pipeline-adapter.js`
- switched `@nmc/memory-pipeline` from direct `openclaw skill run` execution to a node helper that consumes an injected adapter module through the shared contract while preserving the existing shell summary, dry-run text, and failure behavior
- kept adapter injection in the compatibility wrapper so the shared pipeline package no longer hardcodes `adapter-openclaw` as a direct runtime dependency
- verified with `node packages/memory-contracts/test/validate-fixtures.js`
- verified with `node packages/memory-pipeline/test/validate-fixtures.js`
- verified with `node packages/adapter-openclaw/test/validate-fixtures.js`
- verified with `./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `./nmc-memory-plugin/tests/run-integration.sh`

`@nmc/memory-pipeline` should consume a small adapter interface defined in `@nmc/memory-contracts` for the LLM phases. The concrete API can evolve, but it should be equivalent to:

- `runExtract(date, memoryRoot)`
- `runCurate(date, memoryRoot)`
- transitional `runApply(date, memoryRoot)` only if compatibility still requires it

`adapter-openclaw` implements that interface with `openclaw skill run`.

Acceptance criteria:

- `pipeline.sh` behavior remains unchanged
- failure handling and dry-run semantics remain unchanged

Main risk:

- over-abstracting before a second adapter exists

Rollback:

- revert to direct OpenClaw invocation

#### PR 3.2b: Introduce a Deterministic Core Promoter

Status: done on `2026-03-18`

Implementation note:

- implemented the active deterministic writer in `packages/memory-canon/lib/core-promoter.js` and wired `packages/memory-canon/lib/promoter.js` to own the lock-guarded canon promotion path
- routed runtime pipeline `apply` execution through the core promoter in `packages/memory-pipeline/lib/adapter-runner.js` while preserving the existing `memory-apply` compatibility description and dry-run text
- kept pipeline UX stable by preserving the `apply` phase name and OpenClaw-facing invocation descriptor while removing adapter ownership of canon serialization from the active write path
- updated gateway handoff receipts to advertise `core-promoter` as the canonical write implementation instead of `legacy-apply`
- added a normalized fixture harness that compares promoted canon output against the frozen legacy fixture on record ids, anchors, evidence, status semantics, and graph edge derivation
- verified with `node packages/memory-canon/test/validate-fixtures.js`
- verified with `node packages/memory-pipeline/test/validate-fixtures.js`
- verified with `node packages/memory-os-gateway/test/validate-fixtures.js`
- verified with `./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `./nmc-memory-plugin/tests/run-integration.sh`

Move canonical apply ownership into core code:

- curated decisions are compiled into canon by the promoter in `@nmc/memory-canon`
- `runApply` becomes a compatibility shim only if still needed during migration
- adapters stop owning canon serialization

This PR fulfills the boundary contract from PR 1.2 by making the promoter the active canonical writer.

Acceptance criteria:

- canon writes happen through one deterministic promotion path
- the on-disk format remains unchanged
- current pipeline UX remains unchanged
- promoter output matches legacy `apply` on frozen fixtures, byte-for-byte where feasible or semantically equivalent after normalized comparison
- normalized comparison preserves record ids, anchors, envelope fields, status semantics, manifest counts, and graph edge derivation
- normalized comparison may ignore whitespace normalization, non-semantic comment reordering, and timestamp differences in non-canonical metadata fields
- adapter-owned `apply` is disabled or reduced to a compatibility shim only

Main risk:

- semantic drift between historical `apply` behavior and proposal-driven promotion

Rollback:

- keep promoter behind a compatibility shim while retaining the same external pipeline UX

#### PR 3.3: Move OpenClaw `SKILL.md` Packaging

Keep OpenClaw skill definitions in the adapter, not in the extracted core.

Acceptance criteria:

- skill discovery still works in a live OpenClaw install
- skill names remain stable

Main risk:

- path-based discovery regressions

Rollback:

- restore local skill packaging inside `nmc-memory-plugin`

#### PR 3.4: Add Shared Adapter Conformance Suite

Status: done on `2026-03-18`

Implementation note:

- introduced the shared test-only conformance runner in `packages/adapter-conformance` with capability-scoped checks for role bundles, bootstrap, canonical reads, projection reads, `status`, `verify`, and gateway-mediated write orchestration
- added an explicit OpenClaw conformance facade over `memory-os-gateway` in `packages/adapter-openclaw/lib/conformance-adapter.js` so capability claims stay narrow and reusable for a future Codex adapter
- proved `adapter-openclaw` against the shared suite inside its fixture validation without extending `@nmc/memory-contracts` or freezing broader protocol semantics
- added `packages/adapter-conformance/test/validate-fixtures.js` to `./nmc-memory-plugin/tests/run-contract-tests.sh` so the shared suite stays on the contract baseline path
- verified with `node packages/adapter-conformance/test/validate-fixtures.js`
- verified with `node packages/adapter-openclaw/test/validate-fixtures.js`
- verified with `node packages/memory-os-gateway/test/validate-fixtures.js`
- verified with `./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `./nmc-memory-plugin/tests/run-integration.sh`

Introduce the shared conformance suite once gateway and adapter contracts are stable enough to serve as a real protocol boundary.

The suite should live in `packages/adapter-conformance` as a test-only package, not as a published runtime module.

Cover supported capabilities such as:

- `bootstrap(role)`
- role-bundle loading
- canonical read and projection read behavior
- `status` and `verify`
- proposal submission and completion semantics when supported
- shared error and exit-code semantics

Acceptance criteria:

- `adapter-openclaw` passes the suite for every capability it claims to support
- the suite is reusable for `adapter-codex` in Phase 4 without redefining semantics
- failures point to contract drift rather than engine-specific internals

Main risk:

- freezing protocol expectations before the gateway and promoter surfaces are stable enough

Rollback:

- keep the suite package-local until the shared protocol boundary is ready

### Phase 4: Add Second Adapter

#### PR 4.1: Introduce `adapter-codex`

Status: done on `2026-03-18`

Implementation note:

- replaced the `packages/adapter-codex` placeholder with a real CommonJS package that exports a gateway-backed Codex adapter facade plus a package-local single-thread read-only runner
- kept the initial Codex capability claims narrow to `roleBundle`, `bootstrapRole`, canonical/projection reads, `status`, `verify`, and CLI-backed status so PR 4.1 stays canon-safe and avoids premature write/job semantics
- proved `adapter-codex` against the shared conformance suite with a Codex-specific fixture validation, and added that package test to `./nmc-memory-plugin/tests/run-contract-tests.sh`
- removed OpenClaw wording from shared role rendering where it leaked into engine-agnostic bootstrap content, while preserving the existing workspace layout and role bundle structure
- restored the missing `packages/adapter-openclaw/lib/register.js` shim so shared pipeline and OpenClaw fixture validation stay green on the regression baseline
- verified with `/usr/local/bin/node packages/adapter-codex/test/validate-fixtures.js`
- verified with `/usr/local/bin/node packages/memory-agents/test/validate-fixtures.js`
- verified with `/usr/local/bin/node packages/memory-pipeline/test/validate-fixtures.js`
- verified with `/usr/local/bin/node packages/adapter-openclaw/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" ./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `PATH="/usr/local/bin:$PATH" ./nmc-memory-plugin/tests/run-integration.sh`

Start with:

- role-aware bootstrap
- read-only operations
- single-thread execution path

Acceptance criteria:

- Codex can scaffold or attach to the same Memory OS core without OpenClaw-specific code
- Codex can run at least one canon-safe path such as `verify` or `status`

Main risk:

- adapter assumptions exposing hidden OpenClaw coupling in core modules

Rollback:

- remove `adapter-codex`; OpenClaw remains unaffected

#### PR 4.2: Expand Codex to Full Single-Run Contract

Status: done on `2026-03-18`

Implementation note:

- expanded `adapter-codex` capability claims to include gateway-backed write orchestration while keeping Codex outside direct canon writes
- added explicit role-bundle intake plus a package-local `single-thread-handoff` helper that uploads bounded claims, records explicit review feedback, and completes at the promoter handoff boundary
- kept the existing read-only single-thread runner intact so PR 4.2 widens only the explicit handoff path rather than general Codex orchestration
- proved the widened Codex adapter against the shared conformance suite and an adapter-local handoff fixture that confirms proposal, pending batch, and job receipt materialization without canon file mutation
- verified with `/usr/local/bin/node packages/adapter-codex/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" ./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `PATH="/usr/local/bin:$PATH" ./nmc-memory-plugin/tests/run-integration.sh`

Add:

- task fetch or role bundle intake
- proposal/result upload
- explicit completion path

Acceptance criteria:

- a stateless single-agent runner can complete one end-to-end bounded run through the gateway and promoter without direct canon writes

Main risk:

- adding maintainer/job semantics before the contracts are formal enough

Rollback:

- revert to read-only Codex adapter support

### Phase 5: Add Runtime in Shadow Mode

#### PR 5.1: Add `memory-os-runtime` in Shadow Mode

Status: done on `2026-03-18`

Implementation note:

- replaced the `packages/memory-os-runtime` placeholder with a real CommonJS shadow-store package that records episodic, semantic, procedural, feedback, trace, trigger, and reflection artifacts under `runtime/shadow/` instead of canon
- added gateway-backed `captureRuntime` and `getRuntimeDelta` surfaces plus CLI commands so canonical current and shadow runtime can be inspected separately without reaching into files directly
- extended gateway `status` output with a runtime section that reports shadow-store counts, disposability, and rebuildability while keeping canon mutation behind the existing promotion path
- proved the slice with package-local runtime tests, gateway shadow-runtime fixture coverage, adapter/conformance checks, and the full contract/integration baseline while confirming canon files stay unchanged during runtime capture
- verified with `/usr/local/bin/node packages/memory-os-runtime/test/validate-fixtures.js`
- verified with `/usr/local/bin/node packages/memory-os-gateway/test/validate-fixtures.js`
- verified with `/usr/local/bin/node packages/adapter-conformance/test/validate-fixtures.js`
- verified with `/usr/local/bin/node packages/adapter-codex/test/validate-fixtures.js`
- verified with `/usr/local/bin/node packages/adapter-openclaw/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" ./nmc-memory-plugin/tests/run-contract-tests.sh`
- verified with `PATH="/usr/local/bin:$PATH" ./nmc-memory-plugin/tests/run-integration.sh`

Capture advanced runtime memory outside the canon tree. No canonical writes.

Start with:

- episodic memory
- semantic cache
- procedural memory and procedure feedback
- retrieval traces, triggers, and reflections

Acceptance criteria:

- runtime output is stored separately from canon
- canonical current and runtime delta are surfaced separately
- in v1, runtime state is disposable and rebuildable from canon plus captured runtime inputs
- no canon files are changed by runtime components

Main risk:

- accidental leakage of shadow artifacts into canonical workflows

Rollback:

- remove runtime layer without touching canon

### Quality Gate: Shadow Runtime Before Runtime-Backed Orchestration

Before Phase 5.5 begins, shadow runtime must pass an explicit go/no-go review:

- shadow runtime evaluation criteria are defined and reviewed
- recall and retrieval traces are available for inspection
- promotion-candidate generation is observable without truth-layer drift
- no canon contamination from runtime paths is observed on frozen fixtures and sampled runs

This transition should be a deliberate checkpoint, not an automatic phase rollover.

### Phase 5.5: OpenClaw Runtime-Backed Orchestration

Integrate OpenClaw as an orchestration adapter over stable core contracts:

- OpenClaw consumes recall bundles from gateway and runtime
- proposals and feedback flow through gateway surfaces
- multi-agent execution uses stable role bundles and maintainer contracts

Acceptance criteria:

- OpenClaw acts as an orchestration adapter rather than memory owner
- runtime remains non-authoritative
- canon mutation still uses the single promotion path

Main risk:

- reintroducing memory ownership through OpenClaw-specific orchestration shortcuts

Rollback:

- keep runtime-backed orchestration disabled while leaving OpenClaw compatibility intact

### Phase 6: Add Control Plane Carefully

Do this only after gateway and runtime have proven stable.

`control-plane` v1 formalizes and replaces the temporary Phase 2.5 harness on stable contracts rather than inheriting authority from it.

Implemented in this slice:

- introduced `packages/control-plane` as the supported read-only SDK/CLI for operator snapshot and health monitoring
- composed stable gateway status/health/verify/current/runtime surfaces with maintainer board and policy summaries
- kept scheduler policy, backlog policy semantics, and canon promotion ownership outside the control-plane while leaving the temporary gateway ops harness explicitly migration-scoped

Acceptance criteria:

- operator surfaces exist over stable gateway, runtime, and maintainer capabilities
- scheduling and backlog policies remain owned by maintainer-layer contracts
- runtime remains non-authoritative

Main risk:

- building operator UI over unstable contracts

Rollback:

- fall back to scripts and manual operation

### control-plane v2: proposals/conflicts queues and manual interventions

Do this only after `control-plane` v1 has frozen the basic operator surface.

Implemented in this slice:

- moved proposal/job/conflict queue inspection into a control-plane-owned read model instead of delegating that contract to the temporary gateway `ops-snapshot`
- added explicit `queues` and `interventions` SDK/CLI surfaces under `packages/control-plane` with advisory-only manual intervention receipts stored under `runtime/shadow/control-plane/interventions/`
- kept scheduler policy, backlog policy, queue mutation, and canon promotion authority outside the control-plane while exposing available operator actions per proposal, job, conflict, and active lock
- preserved the temporary gateway ops harness as a migration bridge, but stopped using it as the supported control-plane queue contract
- ran the required baseline commands with the updated control-plane, canon, gateway, and adapter fixtures green

Acceptance criteria:

- proposal, job, and conflict queues are exposed through a durable control-plane-owned contract
- manual intervention surfaces record advisory operator actions without mutating canon, proposal receipts, or job receipts directly
- scheduler, backlog-policy, and promotion ownership remain outside `packages/control-plane`

Main risk:

- letting advisory intervention receipts drift into implicit orchestration authority

Rollback:

- keep the control-plane snapshot/health surfaces and route queue inspection back through the temporary gateway harness while leaving advisory receipts unused

### control-plane v3: analytics, audits, runtime inspector, and operator dashboards

Do this only after `control-plane` v2 has frozen queue and intervention semantics.

Implemented in this slice:

- added explicit `analytics`, `audit`, and `runtime-inspector` SDK/CLI surfaces under `packages/control-plane` as the bounded operator-facing dashboard contract over stable queue, intervention, lock, and runtime read models
- kept runtime inspection read-only and explicitly non-authoritative by routing through gateway/runtime contracts and preserving runtime freshness boundaries in the operator surface
- extended `snapshot` and `health` so the supported control-plane contract now exposes queue analytics, audit history, and runtime inspection without inheriting scheduler, backlog-policy, or promotion authority
- preserved the temporary gateway `ops-snapshot` harness only as a migration bridge while moving the supported operator contract further into `packages/control-plane`
- ran the required baseline commands with control-plane analytics, audit, and runtime inspection fixture coverage green

Acceptance criteria:

- analytics and audit-oriented operator surfaces exist over the durable queue and intervention contracts
- runtime inspection is exposed through the control-plane without turning runtime into an authoritative source of truth
- operator dashboard data is available through supported SDK/CLI read models without expanding control-plane ownership into scheduler, queue policy, or canon promotion logic

Main risk:

- letting operator analytics or runtime inspection drift into implicit orchestration authority instead of remaining observational

Rollback:

- keep snapshot/health/queues/interventions as the supported control-plane contract and disable the additive analytics, audit, and runtime inspection surfaces while retaining the temporary gateway bridge

### release hardening: compatibility-only ops bridge and migration-release qualification

Do this only after `control-plane` v3 has frozen the supported read-only operator contract.

Implemented in this slice:

- narrowed `memory-os-gateway ops-snapshot` into an explicitly deprecated compatibility bridge by adding machine-readable release-boundary metadata that points operators to `packages/control-plane`
- added release-qualification metadata to `packages/control-plane` snapshot and health outputs so the supported migration-release operator surface, authority boundaries, and compatibility-shell scope are explicit in-code
- updated package and plugin docs to distinguish the supported `control-plane` operator contract from the compatibility-only `nmc-memory-plugin` shell
- ran the required baseline commands with the updated gateway and control-plane release-boundary fixtures green

Acceptance criteria:

- the temporary gateway ops bridge remains available only as compatibility output and no longer reads as the supported operator contract
- the supported operator surface has machine-readable release qualification for read-only scope, ownership boundaries, and runtime non-authoritativeness
- repository and plugin docs clearly separate the supported Memory OS operator surface from the compatibility-only OpenClaw shell

Main risk:

- leaving the migration-release boundary ambiguous enough that downstream automation keeps binding to the deprecated bridge instead of the supported control-plane surface

Rollback:

- keep the new release-boundary docs and qualification metadata, but relax the gateway bridge deprecation wording while the remaining migration packaging decisions are resolved

### deliberate migration release prep: package the supported operator surface and remove remaining ambiguity from the compatibility shell

Do this only after `release hardening` has qualified the supported operator surface and clarified the compatibility shell boundary.

Implemented in this slice:

- bundled `packages/control-plane` into the shipped `nmc-memory-plugin` artifact so the supported read-only operator surface ships wherever the compatibility shell is installed
- closed the packaged dependency chain needed by the shipped operator surface by bundling `packages/memory-maintainer` alongside the existing gateway, canon, runtime, workspace, agent, and script packages
- extended the packed-artifact integration smoke to assert that an extracted plugin tarball contains the bundled control-plane package and can execute `memory-control-plane snapshot` directly against the scaffolded workspace
- updated plugin-facing docs to reference the installed-artifact path for the supported operator CLI and to keep `memory-os-gateway ops-snapshot` framed as deprecated compatibility-only output
- ran the required baseline commands with the packaged operator surface and extracted-artifact smoke green

Acceptance criteria:

- `npm pack ./nmc-memory-plugin` ships `packages/control-plane` and the dependency closure it needs to run from the extracted plugin artifact
- the shipped plugin artifact can execute the supported control-plane CLI directly against the managed workspace without depending on the monorepo root
- plugin-facing docs point operators to the bundled control-plane surface instead of implying that only the repository-local package path is supported
- deprecated gateway bridge output remains compatibility-only and is not presented as the supported operator contract

Main risk:

- letting the packaged mirror of the supported operator surface drift from the canonical repository package and quietly reintroduce migration-release ambiguity

Rollback:

- keep the documentation boundary updates, but stop presenting the bundled control-plane CLI as shipped-ready until the compatibility artifact can carry the full dependency closure again

### bridge retirement: remove the temporary ops harness from shipped compatibility surfaces

Do this only after `deliberate migration release prep` has made the bundled `control-plane` CLI deliverable from the installed plugin artifact.

Implemented in this slice:

- removed `ops-snapshot` from the `memory-os-gateway` CLI command surface in both the root package and the shipped `nmc-memory-plugin` mirror so the deprecated bridge no longer appears as an operator CLI path
- kept `getOpsSnapshot` / `inspectOps` as compatibility-only SDK/read-model entrypoints while updating gateway and control-plane docs to treat them as deprecated internal compatibility paths rather than supported operator commands
- updated gateway fixture coverage in both root and shipped mirrors so CLI help no longer lists `ops-snapshot`, direct `ops-snapshot` invocation fails as an unknown command, and direct SDK compatibility reads remain covered
- re-ran the required regression baseline with the bundled `control-plane` CLI still green from the extracted plugin artifact

Acceptance criteria:

- `memory-os-gateway` CLI no longer exposes `ops-snapshot` as a command in either the root package or the shipped plugin mirror
- the only documented operator CLI path remains `memory-control-plane`, including the installed plugin artifact path
- the old ops snapshot read model remains available only as deprecated compatibility SDK output and can no longer be mistaken for the supported operator contract
- setup/bootstrap behavior, workspace layout, canon format, and control-plane authority remain unchanged

Main risk:

- leaving the deprecated gateway ops read model exported widely enough that downstream tooling keeps binding to it as if it were still part of the supported shipped surface

Rollback:

- restore the deprecated gateway CLI command while retaining the control-plane packaging/docs improvements if downstream automation still depends on the bridge at the command layer

### release-surface freeze: stop exporting the deprecated gateway ops SDK from shipped mirrors

Do this only after `bridge retirement` has removed the deprecated gateway CLI command and left the remaining ambiguity at the SDK/package boundary.

Implemented in this slice:

- kept the deprecated gateway ops read model available only in the repository-local `packages/memory-os-gateway` package for internal compatibility tooling and fixture coverage
- removed the deprecated ops bridge from the shipped `nmc-memory-plugin/packages/memory-os-gateway` package surface by dropping the `./ops` export and omitting `getOpsSnapshot` / `inspectOps` from the mirror main export
- extended shipped-mirror fixture coverage and packed-artifact integration smoke so the installed plugin artifact now proves `require('memory-os-gateway')` does not expose the deprecated ops bridge and `require('memory-os-gateway/ops')` fails as an unexported path
- updated gateway and plugin docs to freeze the migration-release boundary: `packages/control-plane` is the supported shipped operator surface, while the deprecated gateway ops read model is repo-local/internal compatibility tooling only
- re-ran the required regression baseline with the shipped operator surface still green from the extracted plugin artifact

Acceptance criteria:

- the shipped `nmc-memory-plugin` mirror no longer exports the deprecated gateway ops bridge from its main package entrypoint
- the shipped plugin artifact does not export `memory-os-gateway/ops`
- repository-local gateway tooling may still use the deprecated ops read model without implying that it remains part of the supported shipped surface
- plugin-facing docs freeze `packages/control-plane` as the only supported shipped operator/package surface

Main risk:

- either breaking repo-local compatibility tooling by removing the bridge too broadly or leaving the installed artifact ambiguous enough that downstream automation still binds to deprecated gateway SDK exports

Rollback:

- restore the shipped mirror package-level ops exports while keeping the control-plane release-boundary docs/tests if installed-artifact automation still depends on the deprecated bridge

### deliberate migration release planning: define the post-freeze cutover beyond the compatibility shell

Do this only after `release-surface freeze` has frozen the shipped package/operator boundary.

Implemented in this slice:

- added [docs/deliberate-migration-release-plan.md](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/docs/deliberate-migration-release-plan.md) to make the migration-release cutover explicit instead of leaving it implied by the previous hardening and freeze slices
- classified the supported release surfaces as: `nmc-memory-plugin` for OpenClaw install/setup compatibility, `packages/control-plane` for operator workflows, and `packages/memory-os-gateway` for supported programmatic access excluding the deprecated ops bridge
- recorded the retirement sequencing for the remaining repo-local deprecated gateway ops read model so the next follow-up slice is internal bridge migration and retirement, not new operator capability work
- documented a repository-wide inventory showing that remaining `getOpsSnapshot` / `inspectOps` references are confined to package-local compatibility code, fixture coverage, and docs rather than live runtime consumers
- updated repository and plugin-facing docs to point at the explicit migration-release plan alongside the existing release-boundary notes

Acceptance criteria:

- the repository has one explicit migration-release plan covering supported surfaces, compatibility-shell scope, and retirement gates for the remaining repo-local deprecated gateway ops read model
- docs distinguish the OpenClaw compatibility shell from the supported Memory OS operator and programmatic surfaces without changing behavior
- the next slice is sequenced around repo-local bridge migration/retirement rather than new control-plane capabilities
- the required regression baseline remains green

Main risk:

- turning a release-planning slice into a premature package or API break before the remaining repo-local compatibility tooling is migrated

Rollback:

- keep the explicit surface classification and docs links, but relax the retirement sequencing if a hidden repo-local consumer of the deprecated bridge is discovered

### repo-local bridge retirement prep: migrate internal compatibility tooling off the deprecated gateway ops read model

Do this only after `deliberate migration release planning` has frozen the cutover and retirement sequence.

Implemented in this slice:

- removed direct deprecated bridge validation from `packages/memory-os-gateway/test/validate-fixtures.js` and `nmc-memory-plugin/packages/memory-os-gateway/test/validate-fixtures.js` so repo-local fixture coverage no longer depends on calling `getOpsSnapshot` / `inspectOps`
- kept the supported release-boundary assertions intact by continuing to validate that `ops-snapshot` is absent from the CLI surface and that shipped package exports do not expose the deprecated bridge
- updated [docs/deliberate-migration-release-plan.md](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/docs/deliberate-migration-release-plan.md), [docs/memory-os-roadmap.md](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/docs/memory-os-roadmap.md), and [AGENTS.md](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/AGENTS.md) so the repository now treats retirement prep as complete and points the next slice at full root-package bridge removal
- re-ran targeted gateway fixture validation in both root and shipped mirrors plus the required contract and integration baselines

Acceptance criteria:

- no repo-local production or positive fixture/tooling paths still need `getOpsSnapshot`, `inspectOps`, `inspect_ops`, or `memory-os-gateway/ops`
- supported-surface coverage still proves that the CLI hides `ops-snapshot` and the shipped plugin mirror keeps package-level bridge exports unavailable
- the next slice can remove the root package bridge without first untangling additional internal tooling
- the required regression baseline remains green

Main risk:

- accidentally dropping the negative release-boundary assertions at the same time as the positive bridge coverage, which would reduce confidence before the actual retirement slice

Rollback:

- restore the direct bridge fixture validation temporarily while keeping the release-planning docs if an undiscovered repo-local consumer still needs the compatibility read model during the next slice

### repo-local bridge retirement: remove the deprecated gateway ops read model from the root package

Do this only after `repo-local bridge retirement prep` has removed positive fixture/tooling dependence on the deprecated bridge.

Implemented in this slice:

- deleted `packages/memory-os-gateway/lib/ops.js` so the deprecated root compatibility read model no longer exists as package-local implementation
- removed `./ops` from `packages/memory-os-gateway/package.json` and dropped `./lib/ops` from `packages/memory-os-gateway/index.js` so the root package no longer exposes the bridge through either `require('memory-os-gateway')` or `require('memory-os-gateway/ops')`
- updated `packages/memory-os-gateway/test/validate-fixtures.js` to probe the root package through a temporary `node_modules` install shape and assert that the deprecated bridge is absent from both the main export and subpath export while the CLI still rejects `ops-snapshot`
- updated root gateway docs plus release-planning/session docs so the repository now records the root bridge as retired and limits remaining ambiguity to the hidden shipped-mirror implementation
- re-ran targeted root and shipped gateway fixture validation plus the required contract and integration baselines

Acceptance criteria:

- the root `packages/memory-os-gateway` package no longer exports `getOpsSnapshot`, `inspectOps`, or `inspect_ops` from its main package entrypoint
- the root package no longer exports `memory-os-gateway/ops`
- the CLI still does not expose `ops-snapshot`, and the shipped plugin mirror/operator contract remain unchanged
- the required regression baseline remains green

Main risk:

- accidentally changing supported root gateway surfaces beyond the deprecated bridge removal or unintentionally drifting the shipped mirror while retiring the root package

Rollback:

- restore the root `lib/ops.js` implementation and root package exports temporarily if a hidden repo-local consumer is discovered, while leaving the shipped mirror and control-plane operator contract unchanged

### shipped-mirror bridge cleanup decision: retire the hidden compatibility implementation

Do this only after `repo-local bridge retirement` has retired the bridge from the root package surface.

Implemented in this slice:

- deleted `nmc-memory-plugin/packages/memory-os-gateway/lib/ops.js` so no hidden shipped-mirror implementation of the deprecated gateway ops bridge remains
- updated shipped operator docs in `nmc-memory-plugin/README.md`, `nmc-memory-plugin/packages/memory-os-gateway/README.md`, and both `control-plane` package READMEs to say the bridge is retired rather than merely deprecated
- updated `packages/control-plane/lib/release-qualification.js` and `nmc-memory-plugin/packages/control-plane/lib/release-qualification.js` so machine-readable operator metadata now reports `gatewayOpsSnapshot: retired`
- extended both control-plane fixture suites to assert the new retired bridge status while keeping the supported operator contract unchanged
- re-ran targeted gateway and control-plane fixture validation plus the required contract and integration baselines

Acceptance criteria:

- neither the root package nor the shipped mirror contains an active implementation of the deprecated gateway ops bridge
- machine-readable control-plane release qualification reports the gateway ops bridge as retired
- installed-artifact behavior and shipped package exports remain unchanged from the already-frozen supported surface
- the required regression baseline remains green

Main risk:

- conflating bridge cleanup with retirement of the broader OpenClaw compatibility shell and accidentally widening a non-breaking cleanup slice into a packaging cutover

Rollback:

- restore the hidden shipped-mirror implementation temporarily if an unexpected internal packaged-artifact dependency appears, while leaving the root package retired

### compatibility-shell cutover decision: retain `nmc-memory-plugin` as the production install shell

Do this only after `shipped-mirror bridge cleanup decision` has retired the deprecated gateway bridge everywhere and narrowed the remaining release ambiguity to the compatibility shell itself.

Implemented in this slice:

- updated [docs/deliberate-migration-release-plan.md](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/docs/deliberate-migration-release-plan.md) to make the cutover decision explicit: the current migration release retains `nmc-memory-plugin` as the only supported production OpenClaw install/setup shell and defers any direct-install adapter cutover into a later deliberate breaking slice
- updated `packages/control-plane/lib/release-qualification.js` and `nmc-memory-plugin/packages/control-plane/lib/release-qualification.js` so machine-readable release metadata now records both `productionStatus: current-production-install-shell` and `directAdapterInstall: not-supported` for the compatibility shell
- extended both control-plane fixture suites to assert the retained production-shell decision in root and shipped mirrors
- clarified repository, implementation, plugin, adapter, and control-plane docs so installed-artifact guidance still points users to `nmc-memory-plugin` for install/setup while keeping `packages/control-plane` and `packages/memory-os-gateway` as the supported operator and programmatic surfaces

Acceptance criteria:

- the repository explicitly records that `nmc-memory-plugin` remains the current production install/setup shell for the migration release
- machine-readable control-plane release qualification exposes that retained production-shell decision and that direct installation of `adapter-openclaw` is not yet supported
- installed-artifact guidance continues to preserve `openclaw nmc-memory setup`, auto-bootstrap, `openclaw.plugin.json`, managed `openclaw.json` writes, and the existing `system/` workspace layout without introducing a packaging break
- the required regression baseline remains green

Main risk:

- accidentally blurring the line between “compatibility shell retained for now” and “legacy shell retained forever,” which could stall the eventual direct-install cutover or encourage unsupported installs against `adapter-openclaw`

Rollback:

- relax the new release-qualification metadata and docs language if a direct-install cutover must start sooner than expected, while keeping the current packaging behavior unchanged until a dedicated breaking slice is designed and verified

### compatibility-shell retirement prerequisites: define the direct-install cutover gates

Do this only after `compatibility-shell cutover decision` has made the current production install surface explicit.

Implemented in this slice:

- updated [docs/deliberate-migration-release-plan.md](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/docs/deliberate-migration-release-plan.md) to enumerate the explicit direct-install cutover gates instead of leaving them implicit in scattered docs and duplicated shell code
- extended `packages/control-plane/lib/release-qualification.js` and `nmc-memory-plugin/packages/control-plane/lib/release-qualification.js` with machine-readable `retirementPrerequisites` metadata that marks the direct-install cutover as not ready and records the pending gates for `install-manifest-surface`, `wrapper-convergence`, `skill-discovery-surface`, `shipped-artifact-layout`, and `regression-cutover-coverage`
- extended both control-plane fixture suites plus the packaged-artifact integration check so root and shipped control-plane snapshots now assert the explicit retirement prerequisites alongside the already-retained production-shell decision
- updated control-plane package docs to point operators at the new machine-readable retirement prerequisites rather than forcing them to infer cutover readiness from repository structure alone

Acceptance criteria:

- the repository records the direct-install cutover gates for retiring `nmc-memory-plugin` as the production shell
- machine-readable control-plane release qualification exposes those gates from both root and shipped mirrors and reports that the cutover is not yet ready
- the slice does not change setup/bootstrap behavior, workspace layout, shipped operator paths, or the supported programmatic surfaces
- the required regression baseline remains green

Main risk:

- defining the gates too vaguely, which would leave the next slice ambiguous again and stall the actual removal of the compatibility shell

Rollback:

- simplify or rename the retirement-gate metadata if a clearer cutover decomposition is required, while keeping the current production-shell decision and existing shipped behavior unchanged

### compatibility-shell wrapper convergence: collapse duplicated OpenClaw shell entrypoints

Do this only after `compatibility-shell retirement prerequisites` has made the remaining direct-install blockers explicit.

Implemented in this slice:

- reduced [nmc-memory-plugin/index.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/index.js), [nmc-memory-plugin/lib/openclaw-setup.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/lib/openclaw-setup.js), and [nmc-memory-plugin/scripts/setup-openclaw.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/scripts/setup-openclaw.js) to thin wrappers over `packages/adapter-openclaw`
- extended [packages/adapter-openclaw/test/validate-fixtures.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/packages/adapter-openclaw/test/validate-fixtures.js) to assert that the compatibility shell re-exports adapter setup behavior and that the standalone setup script matches the adapter CLI help surface
- extended [nmc-memory-plugin/tests/run-integration.sh](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/tests/run-integration.sh) so the packaged artifact must include `packages/adapter-openclaw`, the packaged control-plane snapshot reports `wrapper-convergence` as `cleared`, and the synthetic runtime plugin test copies the wrapper dependency shape instead of the old plugin-local implementation shape
- updated `packages/control-plane` release qualification in both root and shipped mirrors so `wrapper-convergence` is now cleared while the remaining retirement gates stay pending

Acceptance criteria:

- plugin-shell runtime/setup entrypoints are thin wrappers over `packages/adapter-openclaw`
- packaged artifacts include the adapter package needed by those wrappers
- machine-readable release qualification reports `wrapper-convergence` as cleared while the direct-install cutover remains not ready overall
- the required regression baseline remains green

Main risk:

- collapsing the wrappers without preserving packaged artifact dependencies, which would keep repo-local tests green while breaking installed plugin behavior

Rollback:

- restore the plugin-local shell implementations temporarily if an installed-artifact or runtime bootstrap regression appears, while keeping the explicit retirement-gate model intact

### compatibility-shell skill discovery convergence: move live installs off plugin-owned skill discovery

Do this only after `compatibility-shell wrapper convergence` has removed entrypoint drift and the next direct-install blocker is isolated to the manifest discovery root.

Implemented in this slice:

- repointed [nmc-memory-plugin/openclaw.plugin.json](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/openclaw.plugin.json) so live installs discover bundled skills through `packages/adapter-openclaw/skills` instead of `nmc-memory-plugin/skills`
- extended [nmc-memory-plugin/tests/run-integration.sh](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/tests/run-integration.sh) so repo-local and packed-artifact checks assert the new manifest discovery root and the packaged adapter-owned skill directory
- updated bootstrap fixtures in [packages/memory-os-gateway/test/validate-fixtures.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/packages/memory-os-gateway/test/validate-fixtures.js), [nmc-memory-plugin/packages/memory-os-gateway/test/validate-fixtures.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/packages/memory-os-gateway/test/validate-fixtures.js), and [packages/adapter-conformance/test/validate-fixtures.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/packages/adapter-conformance/test/validate-fixtures.js) to freeze adapter-owned bundled skills as the bootstrap source
- updated `packages/control-plane` release qualification in both root and shipped mirrors so `skill-discovery-surface` is now cleared while the remaining retirement gates stay pending
- kept `nmc-memory-plugin/skills` packaged as compatibility wrappers so direct script paths and existing wrapper-based regression coverage remain intact

Acceptance criteria:

- live OpenClaw skill discovery resolves through `packages/adapter-openclaw/skills`
- packaged artifacts still include compatibility wrappers under `nmc-memory-plugin/skills` for stable direct script paths
- machine-readable release qualification reports `skill-discovery-surface` as cleared while the direct-install cutover remains not ready overall
- the required regression baseline remains green

Main risk:

- changing manifest discovery without freezing the shipped artifact shape, which could leave repo-local bootstrap green while a packed install still points at the wrong skill root

Rollback:

- point `openclaw.plugin.json` back at `skills` temporarily if an installed OpenClaw runtime cannot resolve nested manifest-relative skill roots, while keeping the adapter-owned bootstrap source and explicit release gate model intact

### compatibility-shell shipped artifact layout convergence: reduce installed path dependence on ~/.openclaw/extensions/nmc-memory-plugin/

Do this only after `compatibility-shell skill discovery convergence` has moved live discovery onto adapter-owned assets and the next direct-install blocker is the installed wrapper layout itself.

Implemented in this slice:

- added shell-owned installed-artifact CLI wrappers at [nmc-memory-plugin/bin/memory-control-plane.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/bin/memory-control-plane.js) and [nmc-memory-plugin/bin/memory-os-gateway.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/bin/memory-os-gateway.js) so users no longer need nested `packages/*/bin/` paths after install
- added shell-owned programmatic wrappers at [nmc-memory-plugin/control-plane/index.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/control-plane/index.js) and [nmc-memory-plugin/memory-os-gateway/index.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/memory-os-gateway/index.js), and bundled them through [nmc-memory-plugin/package.json](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/package.json)
- extended [nmc-memory-plugin/tests/run-integration.sh](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/tests/run-integration.sh) so packed artifacts must include the shell-owned wrappers, the wrapper CLIs execute after extract, and the wrapper module paths work without reaching into nested `packages/` internals
- updated installed-artifact docs in [docs/implementation-guide.md](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/docs/implementation-guide.md), [nmc-memory-plugin/README.md](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/README.md), [packages/control-plane/README.md](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/packages/control-plane/README.md), [nmc-memory-plugin/packages/control-plane/README.md](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/packages/control-plane/README.md), and [nmc-memory-plugin/packages/memory-os-gateway/README.md](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/packages/memory-os-gateway/README.md) to point at shell-owned wrapper paths
- updated `packages/control-plane` release qualification in both root and shipped mirrors so `shipped-artifact-layout` is now cleared while the remaining retirement gates stay pending

Acceptance criteria:

- installed CLI and programmatic guidance no longer depends on nested `packages/control-plane/...` or `packages/memory-os-gateway/...` paths
- packed artifacts include shell-owned operator and gateway wrappers that work after extract
- machine-readable release qualification reports `shipped-artifact-layout` as cleared while the direct-install cutover remains not ready overall
- the required regression baseline remains green

Main risk:

- adding shell-owned wrappers without freezing them in packed-artifact smoke coverage, which would keep repo-local docs aligned while leaving the installed artifact dependent on internal package layout

Rollback:

- point installed-artifact docs and smoke coverage back at the nested `packages/*` paths temporarily if shell-owned wrappers expose an unexpected packaging/runtime regression, while keeping direct-install policy unchanged

### compatibility-shell regression cutover coverage: move regression coverage off plugin-shell packaging assumptions

Do this only after `compatibility-shell shipped artifact layout convergence` has cleared the installed wrapper-path gate and the remaining regression gap is proving a future direct surface rather than the current compatibility shell alone.

Implemented in this slice:

- extended [nmc-memory-plugin/tests/run-integration.sh](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/tests/run-integration.sh) with a synthetic direct-surface smoke that bootstraps `packages/adapter-openclaw` against a temp plugin root containing only the managed templates, without routing through `nmc-memory-plugin` shell wrappers
- updated release qualification in [packages/control-plane/lib/release-qualification.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/packages/control-plane/lib/release-qualification.js) and [nmc-memory-plugin/packages/control-plane/lib/release-qualification.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/packages/control-plane/lib/release-qualification.js) so `regression-cutover-coverage` is now cleared
- updated [packages/control-plane/test/validate-fixtures.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/packages/control-plane/test/validate-fixtures.js), [nmc-memory-plugin/packages/control-plane/test/validate-fixtures.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/packages/control-plane/test/validate-fixtures.js), and packed-artifact assertions in [nmc-memory-plugin/tests/run-integration.sh](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/tests/run-integration.sh) so the machine-readable retirement-gate model now reflects that only `install-manifest-surface` remains pending

Acceptance criteria:

- the regression baseline covers a synthetic direct adapter surface in addition to compatibility-shell packaging
- machine-readable release qualification reports `regression-cutover-coverage` as cleared while the direct-install cutover remains not ready overall
- `install-manifest-surface` is the only remaining pending retirement gate
- the required regression baseline remains green

Main risk:

- mistaking repo-local adapter fixture coverage for cutover coverage without actually freezing a direct-surface path in the regression baseline

Rollback:

- drop the synthetic direct-surface smoke temporarily if it proves too brittle, while keeping the compatibility-shell baseline intact and leaving `regression-cutover-coverage` pending until a narrower replacement lands

### compatibility-shell install manifest surface convergence: move OpenClaw install manifest ownership off nmc-memory-plugin

Do this only after `compatibility-shell regression cutover coverage` has proven a synthetic direct adapter surface and the last remaining blocker is the install manifest itself.

Implemented in this slice:

- added adapter-owned install manifest assets under [packages/adapter-openclaw/openclaw.plugin.json](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/packages/adapter-openclaw/openclaw.plugin.json), [packages/adapter-openclaw/plugin.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/packages/adapter-openclaw/plugin.js), [packages/adapter-openclaw/lib/install-surface.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/packages/adapter-openclaw/lib/install-surface.js), and adapter `package.json#openclaw`, and mirrored that owned surface into the shipped copy under [nmc-memory-plugin/packages/adapter-openclaw/](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/packages/adapter-openclaw)
- bundled adapter-owned scaffold templates under [packages/adapter-openclaw/templates/](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/packages/adapter-openclaw/templates) and [nmc-memory-plugin/packages/adapter-openclaw/templates/](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/packages/adapter-openclaw/templates) so `pluginRoot` can resolve a self-contained direct adapter install surface without borrowing `nmc-memory-plugin/templates`
- extended [packages/adapter-openclaw/test/validate-fixtures.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/packages/adapter-openclaw/test/validate-fixtures.js), [nmc-memory-plugin/packages/adapter-openclaw/test/validate-fixtures.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/packages/adapter-openclaw/test/validate-fixtures.js), and [nmc-memory-plugin/tests/run-integration.sh](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/tests/run-integration.sh) so root and shipped mirrors freeze manifest/package metadata alignment, template mirroring, packed-artifact adapter install assets, and a direct bootstrap path that does not copy shell templates into a synthetic root
- updated release qualification in [packages/control-plane/lib/release-qualification.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/packages/control-plane/lib/release-qualification.js) and [nmc-memory-plugin/packages/control-plane/lib/release-qualification.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/nmc-memory-plugin/packages/control-plane/lib/release-qualification.js) so `install-manifest-surface` is now cleared and the direct-install retirement prerequisites report `cutoverReady: true` while `nmc-memory-plugin` remains the current production install/setup shell

Acceptance criteria:

- `packages/adapter-openclaw` owns the OpenClaw install manifest surface and bundled scaffold templates needed for a direct install shape
- `nmc-memory-plugin` keeps compatibility-shell mirrors for current production install behavior without remaining the source of truth for manifest ownership
- machine-readable release qualification reports `install-manifest-surface` as cleared and shows that all direct-install retirement prerequisites are now satisfied
- the required regression baseline remains green

Main risk:

- clearing the manifest gate with mirrored files that drift from the adapter-owned source of truth, which would make cutover readiness appear green while the compatibility shell and adapter install surfaces silently diverge

Rollback:

- fall back to the previous shell-owned manifest metadata temporarily if a real OpenClaw install cannot resolve the adapter-owned manifest/template closure, while keeping the new adapter-owned source-of-truth helpers and test coverage so the issue can be narrowed without reopening unrelated retirement gates

### legacy-shell retirement cleanup: remove `nmc-memory-plugin` mirrors and root the regression surface in MemoryOS.v1

Do this only after `compatibility-shell install manifest surface convergence` has cleared every direct-install prerequisite and the remaining work is repository cleanup rather than another install-surface blocker.

Implemented in this slice:

- moved the active regression harness to [tests/run-contract-tests.sh](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/tests/run-contract-tests.sh), [tests/run-integration.sh](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/tests/run-integration.sh), and the root `tests/fixtures/` plus `tests/golden/` trees so repo verification no longer routes through `nmc-memory-plugin/tests`
- rewrote direct adapter and shared fixture coverage in [packages/adapter-openclaw/test/validate-fixtures.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/packages/adapter-openclaw/test/validate-fixtures.js), [packages/memory-os-gateway/test/validate-fixtures.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/packages/memory-os-gateway/test/validate-fixtures.js), [packages/adapter-conformance/lib/suite.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/packages/adapter-conformance/lib/suite.js), and the package fixture suites that still hard-coded shell-era wrapper assumptions
- retired the compatibility-shell metadata by marking `nmc-memory-plugin` as a removed legacy shell in [packages/control-plane/lib/release-qualification.js](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/packages/control-plane/lib/release-qualification.js) and aligned the supported docs around `packages/adapter-openclaw`
- removed the `nmc-memory-plugin/` tree from the repository once fixtures, docs, and packaged-artifact smoke coverage no longer depended on it

Acceptance criteria:

- no active repo-local test, fixture, or packaging smoke path depends on `nmc-memory-plugin/`
- the supported OpenClaw install/setup surface is `packages/adapter-openclaw`, and release qualification records the legacy shell as retired rather than merely demoted
- the regression baseline remains green through `./tests/run-contract-tests.sh` and `./tests/run-integration.sh`

Main risk:

- deleting the mirror tree before the packed-artifact and wrapper-relative path assumptions are fully rehomed, which would leave the repository apparently cleaner while breaking extract-time adapter smoke coverage

Rollback:

- restore only the minimum missing root-level fixture or packaged-artifact path assumptions needed to make the direct adapter regression surface green again; do not restore `nmc-memory-plugin/` as an active shell

## Backward Compatibility Matrix

The following must remain stable until a deliberate migration release:

- `openclaw memoryos setup`
- plugin auto-bootstrap behavior
- `openclaw.plugin.json` config schema
- `~/.openclaw/workspace/system/` layout, including `memory/`, `skills/`, `tasks/`, `policy/`, `scripts/`, and `docs/`
- `~/.openclaw/workspace/{nyx,medea,arx,lev,mnemo}/` layout
- `~/.openclaw/agents/{nyx,medea,arx,lev,mnemo}/` state directories
- managed `openclaw.json` writes
- OpenClaw skill names
- script flags, outputs, and exit codes
- canon file layout and Markdown/YAML envelopes

## Module Evolution by Version

These package versions describe capability maturity over the course of the migration and after it, not the exact PR in which a package first appears. A package may be extracted early in skeletal form and reach its full `v1` contract only after later migration phases land.

### `@nmc/memory-contracts`

- `v1`: extracted envelope types, shared schema descriptors, adapter protocols, and error codes
- `v2`: versioned contract schemas, migration descriptors, and capability negotiation
- `v3`: federation contract surfaces, cross-repo registry hooks, and compatibility checking

### `@nmc/memory-canon`

- `v1`: extracted schema rules, manifest logic, graph contract, layout contract, lock enforcement, promoter boundary, and deterministic promoter activation by the end of the initial migration
- `v2`: projector support, migration descriptors, import/export, and replay helpers around the established promoter path
- `v3`: richer replay tooling, optional normalized internal ledger, federation hooks

### `@nmc/memory-ingest`

- `v1`: normalized source envelopes, provenance contracts, and ingest validation
- `v2`: richer source manifests, deduplication helpers, and external import contracts
- `v3`: multi-engine intake policies and federation-friendly source descriptors

### `@nmc/memory-pipeline`

- `v1`: extracted sequencing with compatibility-first phase ownership, reaching the narrow adapter interface from `@nmc/memory-contracts` by late migration
- `v2`: stronger checkpoints, claim-level resume, better error classification
- `v3`: event-driven triggers, multi-run orchestration, richer observability

### `@nmc/memory-scripts`

- `v1`: script extraction with stable wrappers
- `v2`: structured JSON output and shared library usage
- `v3`: optional plugin points for custom verification or retention policies

### `@nmc/memory-workspace`

- `v1`: extracted scaffold and template operations
- `v2`: workspace versioning and migration helpers
- `v3`: remote sync and workspace composition

### `@nmc/memory-agents`

- `v1`: extracted predefined roster, machine-readable role manifests, and render contracts
- `v2`: capability metadata and versioned role bundles
- `v3`: dynamic role bundles and versioned competence packages

### `@nmc/memory-maintainer`

- `v1`: extracted kanban, policy, and system execution contracts
- `v2`: machine-readable job and task schemas, role bundles, maintainer APIs, and lease contracts
- `v3`: retries, richer scheduler logic, degraded-mode policies, and execution analytics

### `adapter-openclaw`

- `v1`: thin compatibility adapter over extracted modules
- `v2`: gateway-backed internals and cleaner permission surfaces
- `v3`: runtime-backed orchestration over stable core modules

### `adapter-codex`

- `v1`: read-only and single-run bootstrap
- `v2`: full role-based one-shot execution contract
- `v3`: resumable runs and richer orchestration sequences

### `memory-os-gateway`

- `v1`: internal SDK and CLI over read, bootstrap, status, and verify
- `v2`: write orchestration for proposals, jobs, feedback, and query as the default read path
- `v3`: remote transport, auth scopes, caching, and observability hooks

### `memory-os-runtime`

- `v1`: shadow store for episodic, semantic, procedural, and reflective runtime memory
- `v2`: recall bundles, retrieval traces, promotion candidate generation, and optional persistent runtime state that remains non-authoritative
- `v3`: richer retrieval traces, quality scoring, and multi-engine runtime support

### `control-plane`

- `v1`: formalize the temporary ops harness into a supported read-only operator surface and health monitor
- `v2`: proposals/conflicts queues and manual interventions
- `v3`: analytics, audits, runtime inspector, and operator dashboards

## Guidance for Key Modules

### `@nmc/memory-contracts`

Keep it minimal and dependency-free:

- types, interfaces, constants, and schema descriptors only
- no runtime I/O
- no canon storage logic
- if two or more modules need a shared type, it belongs here

### `@nmc/memory-ingest`

Keep it as a contract boundary, not an ETL framework:

- normalize and tag sources before they enter the pipeline
- formalize provenance and evidence references
- keep source adapters thin and engine-agnostic
- avoid speculative transforms until real second-source pressure exists

### `adapter-openclaw`

Keep it installable and boring:

- same plugin id
- same command surface
- same workspace bootstrap
- same skill packaging

The only acceptable change in early phases is thinner internals.

### `adapter-codex`

Treat it as an architecture test, not as a rewrite target.

Success condition:

- Codex can operate against extracted core modules without special canon knowledge or direct file-contract coupling beyond the official APIs

### `memory-os-gateway`

Start with an SDK and CLI, not a server. The first question is whether all internal callers can stop reaching into files directly, not whether the system can speak HTTP.

`memory-query` should migrate here as the canonical read surface. Until then, its OpenClaw-facing skill packaging stays in `adapter-openclaw`.

Expose `get_role_bundle`, `bootstrap(role)`, and projection reads before the second adapter ships full-run support. If an adapter needs direct package imports to bootstrap, the public boundary is still wrong.

### `memory-os-runtime`

Shadow mode only until quality metrics exist. Runtime memory may help retrieval and context assembly, but it must not become a covert second writer.

Treat runtime as a mutable fast-memory layer:

- episodic observations
- semantic cache
- procedural memory
- reflections and retrieval traces

In v1, runtime artifacts should be treated as disposable and rebuildable from canon plus captured runtime inputs. In later versions, runtime may remain persistent and useful across runs, but it must stay non-authoritative and must never become a second truth layer.

### `control-plane`

Do not build a rich UI over unstable contracts. Start with minimal operator controls only after gateway and runtime are proven. Control-plane is an operator surface, not the owner of scheduler or promotion behavior.

### Projections

Treat projections as rebuildable views over canon:

- every projection should declare its canonical inputs and rebuild strategy
- gateway responses should distinguish canonical reads from projection reads
- losing projections must be recoverable without data loss
- projections may accelerate workflows but must never become promotion authority

## Shell and Package Boundary

The initial extraction should not assume bash scripts can import package code directly.

Rules:

- shell entrypoints remain stable during early extraction
- shared package logic must be exposed through CLIs or thin wrappers when scripts need it
- a shell script may remain the compatibility entrypoint while delegating to a Node CLI under the hood
- no script should be rewritten solely to satisfy package boundaries unless contract tests already protect its output semantics

## What Not To Do Yet

- do not split repositories
- do not redesign canon storage
- do not replace file-first tasking with a complex scheduler
- do not add more default roles during extraction
- do not build full UI first
- do not make runtime authoritative
- do not allow any adapter to write canon directly outside the deterministic promoter
- do not over-generalize the pipeline adapter before the second adapter proves the need
- do not change setup UX and module boundaries in the same release

## Phase Exit Criteria

### Exit Phase 0

- baseline fixtures are frozen
- contract tests exist
- integration script stays green

### Exit Phase 1

- the base system core is extracted into contracts, ingest, canon, and maintainer
- source and provenance contracts are formalized
- lock and single-writer enforcement exist at the canon boundary, with final active-writer ownership still allowed to remain on legacy `apply` until Phase 3
- current OpenClaw flows still behave the same
- foundational behavior is regression-checked

### Exit Phase 1b

- repo-specific extensions are extracted behind stable package boundaries
- current OpenClaw flows still behave the same
- setup and script behavior are regression-checked

### Exit Phase 2

- gateway is the preferred internal entrypoint for read, bootstrap, status, and verify flows
- internal callers stop reaching into files directly where gateway APIs exist
- a future second adapter does not require direct canon or agent-package imports for bootstrap
- safe proposal and write-orchestration surfaces exist ahead of second-engine write capability
- no compatibility regressions are introduced

### Exit Phase 2.5

- operators can inspect jobs, proposals, conflicts, locks, and projections without direct file access
- the temporary harness remains non-authoritative
- the temporary harness does not define durable operator contracts ahead of `control-plane` v1

### Exit Phase 3

- `adapter-openclaw` is thin
- pipeline runs through a stable adapter interface
- canon writes go through the deterministic promoter rather than adapter-owned serialization
- user-facing OpenClaw behavior is unchanged

### Exit Phase 4

- a second adapter proves engine-agnosticity
- a stateless runner can complete a bounded role-based run without direct canon writes
- OpenClaw and Codex pass the shared adapter conformance suite for their supported capabilities

### Exit Phase 5

- runtime is safely shadowed
- v1 runtime memory is disposable and rebuildable while runtime remains non-authoritative in every version
- no truth-layer drift is introduced
- the shadow runtime quality gate above is passed

### Exit Phase 5.5

- OpenClaw uses runtime-backed orchestration through stable core boundaries
- memory ownership remains outside the adapter

### Exit Phase 6

- operator controls exist over stable contracts
- scheduling and health no longer depend on direct script choreography alone

### adapter-claude runtime contract

Status: done on `2026-03-19`

Implementation note:

- replaced `packages/adapter-claude` scaffold-only behavior with a bounded gateway-backed connector contract
- added role-aware bootstrap, role-bundle intake, canon-safe read helpers, explicit proposal/feedback/completion handoff helpers, and CLI passthrough over existing gateway surfaces
- kept `adapter-claude` out of canon ownership, workspace-wide setup ownership, and any new runtime authority model
- added fixture-backed validation for the bounded Claude session contract and shared adapter conformance coverage
- verified with `PATH="/usr/local/bin:$PATH" node packages/adapter-claude/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/adapter-openclaw/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/adapter-codex/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/adapter-conformance/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/memory-os-gateway/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" ./tests/run-contract-tests.sh`
- verified with `PATH="/usr/local/bin:$PATH" ./tests/run-integration.sh`

### derived read index

Status: done on `2026-03-19`

Implementation note:

- added a derived non-authoritative read index under `packages/memory-os-gateway/lib/read-index.js` that builds entirely from canon and stores persisted snapshots at `core/meta/read-index.json`
- switched `query` to prefer a fresh persisted read index and otherwise rebuild an ephemeral in-memory index without changing canon
- added explicit `build-read-index` and `verify-read-index` gateway CLI commands plus status and health visibility for persisted index freshness
- kept canon as the only source of truth by treating the read index as disposable, rebuildable, and checksum-validated against current canonical content
- verified with `PATH="/usr/local/bin:$PATH" node packages/memory-os-gateway/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/adapter-conformance/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/adapter-openclaw/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/adapter-codex/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/adapter-claude/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/control-plane/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" ./tests/run-contract-tests.sh`
- verified with `PATH="/usr/local/bin:$PATH" ./tests/run-integration.sh`

### retrieval semantics and recall quality

Status: done on `2026-03-19`

Implementation note:

- added explainable canonical ranking in gateway `query` results with bounded weighted reasons instead of leaving ranking implicit
- made pending runtime delta recall explicit in the query contract and added normalized `canonicalRecall`, `pendingRecall`, and `topHits` sections to `getRecallBundle`
- kept canonical and runtime authority boundaries explicit by marking canonical hits authoritative and runtime-derived hits non-authoritative throughout the recall bundle
- preserved the derived read index as the backing read path without widening runtime into a second truth layer
- verified with `PATH="/usr/local/bin:$PATH" node packages/memory-os-gateway/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/adapter-conformance/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/adapter-openclaw/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/adapter-codex/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/adapter-claude/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/control-plane/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" ./tests/run-contract-tests.sh`
- verified with `PATH="/usr/local/bin:$PATH" ./tests/run-integration.sh`

### first-class procedural canon

Status: done on `2026-03-19`

Implementation note:

- introduced canonical `procedure` records with stable `procedure_key`, integer `version`, bounded `acceptance` criteria, and optional `feedback_refs` so procedural learning no longer has to stay trapped in runtime buckets or generic competence notes
- extended the core promoter and reviewed gateway write path so accepted procedure claims can promote into `core/agents/<role>/PLAYBOOK.md` through the existing single-writer canon boundary without adding a second writer
- preserved history by versioning procedure updates into new records, deprecating superseded versions, and keeping runtime procedural artifacts explicitly non-authoritative until review and promotion
- updated fixture canon, verification counts, manifest schema, and setup canon docs so the new procedure contract is part of the supported repository baseline
- verified with `PATH="/usr/local/bin:$PATH" node packages/memory-contracts/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/memory-canon/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/memory-os-gateway/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/adapter-conformance/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/adapter-openclaw/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/adapter-codex/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/adapter-claude/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/control-plane/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" ./tests/run-contract-tests.sh`
- verified with `PATH="/usr/local/bin:$PATH" ./tests/run-integration.sh`

### procedure inspection and comparison surfaces

Status: done on `2026-03-19`

Implementation note:

- added read-only `memory-os-gateway` procedure surfaces for catalog, single-lineage inspection, and structured version comparison so operators can inspect canonical procedure history without touching the promotion path
- exposed diff-safe procedure views over metadata, acceptance criteria, feedback references, and body lines while keeping canon markdown as the only authoritative source and avoiding rollback writers
- extended `control-plane` snapshot visibility with the canonical procedure catalog so operator surfaces can understand current versus superseded procedure versions without implying new control-plane authority
- verified with `PATH="/usr/local/bin:$PATH" node packages/memory-os-gateway/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/control-plane/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" ./tests/run-contract-tests.sh`
- verified with `PATH="/usr/local/bin:$PATH" ./tests/run-integration.sh`

### procedure-aware recall surfaces

Status: done on `2026-03-19`

Implementation note:

- added explicit `procedureRecall` structure to gateway recall bundles so canonical current procedure hits, canonical historical procedure hits, and non-authoritative runtime `procedural`/`procedureFeedback` artifacts are separated instead of blended
- annotated recall hits with procedure classification metadata so consumers can tell when a hit is current canonical guidance versus runtime-only procedure memory without changing ranking or write authority
- extended `control-plane` runtime inspection with a dedicated procedures summary covering canonical current procedures, runtime procedural artifact buckets, and query-scoped procedure-aware recall visibility for operator consumers
- verified with `PATH="/usr/local/bin:$PATH" node packages/memory-os-gateway/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/control-plane/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" ./tests/run-contract-tests.sh`
- verified with `PATH="/usr/local/bin:$PATH" ./tests/run-integration.sh`

### procedure evidence linkage surfaces

Status: done on `2026-03-19`

Implementation note:

- added read-only procedure evidence linkage in `memory-os-gateway` so inspected canonical procedure versions now resolve `feedback_refs` into runtime feedback artifacts, supporting runtime runs, and related runtime `procedural` observations without changing canon authority
- extended `listProcedures` and recall hit procedure metadata with bounded evidence-link summaries so canonical current procedures can point back to their runtime evidence chain from both lineage and query surfaces
- surfaced the same evidence-link summaries through `control-plane` runtime inspection so operator views can inspect runtime provenance for canonical procedures while runtime remains explicitly non-authoritative
- verified with `PATH="/usr/local/bin:$PATH" node packages/memory-os-gateway/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/control-plane/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" ./tests/run-contract-tests.sh`
- verified with `PATH="/usr/local/bin:$PATH" ./tests/run-integration.sh`

## Namespace / Tenant / Actor Model Foundations

Status: done on `2026-03-19`

Implementation note:

- added a shared namespace contract in `@nmc/memory-contracts` with explicit `tenantId`, `spaceId`, `userId`, `agentId`, and `roleId` dimensions plus pathing metadata that preserves the current default workspace shape while defining scoped path foundations
- threaded namespace metadata through gateway read/query/recall/status surfaces, runtime shadow persistence, and derived read-index artifacts so read-only consumers can see explicit scope boundaries instead of inferring them from `memoryRoot` alone
- kept backward compatibility for existing default-scope runtime and read-index artifacts by backfilling namespace metadata on read, while allowing scoped runtime shadow and scoped derived read-index paths without adding a new writer path into canon
- updated procedure runtime path resolution so read-only evidence linkage can still resolve runtime refs when runtime shadow paths become namespace-aware
- verified with `PATH="/usr/local/bin:$PATH" node packages/memory-contracts/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/memory-os-runtime/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/memory-os-gateway/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/control-plane/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" ./tests/run-contract-tests.sh`
- verified with `PATH="/usr/local/bin:$PATH" ./tests/run-integration.sh`

## Verify Hardening and Content-Addressed Reconciliation

Status: done on `2026-03-19`

Implementation note:

- replaced mtime-driven canon graph reconciliation with a full content-addressed rebuild in `@nmc/memory-canon`, then recorded digest-backed reconciliation evidence in `core/meta/manifest.json` so verify output is auditable instead of inferred from timestamps alone
- extended derived read-index verification with content fingerprints and explicit reconciliation metadata, keeping the index rebuildable and non-authoritative while separating index freshness from canonical manifest drift
- added runtime shadow manifest reconciliation digests plus operator-facing runtime/read-index status, health, and analytics visibility so stale-versus-fresh reasoning is explicit across gateway and control-plane surfaces without widening write authority
- fixed procedure evidence and procedure-aware recall resolution so explicit runtime `feedback_refs` and default-scope procedural artifacts stay linkable even when the caller is operating from a different role-scoped surface
- verified with `PATH="/usr/local/bin:$PATH" node packages/memory-contracts/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/memory-canon/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/memory-os-runtime/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/memory-os-gateway/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/control-plane/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" ./tests/run-contract-tests.sh`
- verified with `PATH="/usr/local/bin:$PATH" ./tests/run-integration.sh`

## Verify Receipts and Projection Provenance Surfaces

Status: done on `2026-03-19`

Implementation note:

- added digest-backed non-authoritative receipts for canon verify at `core/meta/verify-receipt.json`, persisted read-index build/verify actions beside `read-index.json`, and runtime-summary reconciliation beside the runtime shadow manifest so refresh activity is inspectable without becoming authoritative
- exposed receipt/provenance summaries through `memory-os-gateway` `verify`, `status`, and `health` surfaces, then threaded the same visibility through `control-plane` snapshot output so operators can inspect when and why derived surfaces were refreshed
- kept ordinary read-path operations non-mutating by restricting receipt persistence to explicit verify/rebuild/refresh actions, while leaving projections, read-index data, runtime summaries, and the new receipts rebuildable and non-authoritative
- aligned repository docs and package references with the actual in-repo roadmap location and the now-bounded `adapter-claude` surface so the shipped state and the documented state no longer contradict each other
- verified with `PATH="/usr/local/bin:$PATH" node packages/memory-os-gateway/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" node packages/control-plane/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" ./tests/run-contract-tests.sh`
- verified with `PATH="/usr/local/bin:$PATH" ./tests/run-integration.sh`

## Product Boundary Simplification and Supported-Surface Alignment

Status: done on `2026-03-19`

Implementation note:

- added [docs/supported-surfaces.md](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/memory-os.v1/docs/supported-surfaces.md) as the minimal supported-surface document and explicit package matrix for the current `MemoryOS.v1` product boundary
- extended `control-plane` release qualification with a machine-readable package matrix so snapshot and health consumers can inspect which packages are `production`, `bounded`, or `internal` without inferring that from scattered docs
- aligned [docs/ARCHITECTURE.md](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/memory-os.v1/docs/ARCHITECTURE.md), [docs/legacy/implementation-guide.md](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/memory-os.v1/docs/legacy/implementation-guide.md), and package README files with the same taxonomy, including the supported operator, programmatic, connector, and internal package surfaces
- preserved the existing `openclaw memoryos setup`/auto-bootstrap behavior, workspace layout, verify receipt visibility, and single promotion path while simplifying the public product-boundary story
- verified with `PATH="/usr/local/bin:$PATH" node packages/control-plane/test/validate-fixtures.js`
- verified with `PATH="/usr/local/bin:$PATH" ./tests/run-contract-tests.sh`
- verified with `PATH="/usr/local/bin:$PATH" ./tests/run-integration.sh`

## Production Readiness Gate and Release Checklist

Status: done on `2026-03-19`

Implementation note:

- added [docs/release-readiness.md](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/memory-os.v1/docs/release-readiness.md) as the release-facing go/no-go document for the current OpenClaw-first production boundary
- added [tests/run-production-readiness.sh](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/memory-os.v1/tests/run-production-readiness.sh) so the repository now has one explicit production gate that checks live doc references, supported-surface metadata coverage, and the full contract/integration baselines
- aligned [README.md](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/memory-os.v1/README.md) and [docs/ARCHITECTURE.md](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/memory-os.v1/docs/ARCHITECTURE.md) with the current production/bounded taxonomy, corrected stale doc links, and switched the documented CI path to the production gate instead of ad hoc separate commands
- updated [/.github/workflows/nmc-memory-plugin-ci.yml](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/memory-os.v1/.github/workflows/nmc-memory-plugin-ci.yml) so CI now runs the same production-readiness gate that release candidates should pass locally
- preserved the existing install/setup behavior, workspace layout, authority boundaries, and regression baseline while turning production-readiness from an inference into a reproducible command
- verified with `PATH="/usr/local/bin:$PATH" ./tests/run-production-readiness.sh`

## Immediate Next Step

The production gate now exists, so the next implementation step should lock the first post-readiness slice explicitly before editing code again:

- choose one bounded follow-up slice and record it in the roadmap `Progress Snapshot` plus `AGENTS.md` before implementation starts
- prefer a slice that builds on the new production gate instead of bypassing it with one-off release checks or doc-only claims
- keep `openclaw memoryos setup`, auto-bootstrap behavior, workspace layout, verify/provenance visibility, and the single promotion path unchanged while that next slice is defined

The current release boundary is now explicit and reproducible. The next risk is letting future slices drift away from the gate or reintroduce stale release-facing docs that the new command is meant to freeze.

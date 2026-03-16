# Memory OS Migration Roadmap

> **Status: Migration Plan with implementation progress tracking**
> This document describes the repository-specific path from the current OpenClaw-centric plugin to a modular, engine-agnostic Memory OS. It is a planning and sequencing document, not the current implementation state.

## Progress Snapshot

- completed: `Phase 1 / PR 1.1b — Extract @nmc/memory-ingest`
- next: `Phase 1 / PR 1.2 — Extract @nmc/memory-canon`
- last verified on: `2026-03-17`
- verification baseline:
  - `./nmc-memory-plugin/tests/run-contract-tests.sh`
  - `./nmc-memory-plugin/tests/run-integration.sh`

## Goal

Evolve `nmc-ai-plugins.v1` from one production OpenClaw plugin into a modular Memory OS without regressing:

- current OpenClaw commands and setup UX
- current plugin config surface
- current workspace layout under `system/`
- current canon on-disk format
- current pipeline semantics and helper scripts

This migration stays inside one monorepo and follows a strangler pattern. The existing `nmc-memory-plugin` remains the compatibility surface until a later deliberate migration release.

## Non-Negotiable Constraints

1. Do not change the canon on-disk format in the same release as the module split.
2. Do not break `openclaw nmc-memory setup`, auto-bootstrap, or `openclaw.plugin.json`.
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

Acceptance criteria:

- operator surfaces exist over stable gateway, runtime, and maintainer capabilities
- scheduling and backlog policies remain owned by maintainer-layer contracts
- runtime remains non-authoritative

Main risk:

- building operator UI over unstable contracts

Rollback:

- fall back to scripts and manual operation

## Backward Compatibility Matrix

The following must remain stable until a deliberate migration release:

- `openclaw nmc-memory setup`
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

## Immediate Next Step

The next implementation step should be Phase 1, PR 1.2:

- extract `@nmc/memory-canon` as the shared canonical memory boundary after contracts and ingest
- formalize record schema rules, manifest and graph contracts, canon layout invariants, and projection rebuild rules without changing on-disk formats
- define the canon write boundary, lock semantics, and promoter interface skeleton while leaving the legacy `apply` path as the active writer

PR 1.1b is now complete, so the next risk is widening the canon boundary too quickly. Keep PR 1.2 focused on shared canonical validation and write-boundary contracts, not on replacing the existing writer yet.

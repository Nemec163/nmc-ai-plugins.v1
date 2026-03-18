# Repository Session Guide

This repository is migrating from the current `nmc-memory-plugin` implementation to the target Memory OS described in [docs/memory-os-roadmap.md](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/docs/memory-os-roadmap.md).

## Current State

- completed roadmap slice: `control-plane v2 — proposals/conflicts queues and manual interventions`
- next roadmap slice: `control-plane v3 — analytics, audits, runtime inspector, and operator dashboards`
- regression baseline:
  - `./nmc-memory-plugin/tests/run-contract-tests.sh`
  - `./nmc-memory-plugin/tests/run-integration.sh`
- do not assume the roadmap is only aspirational; progress must be reflected back into the roadmap and this file after each completed slice

## Mandatory Session Start

At the beginning of a new session:

1. Read [docs/memory-os-roadmap.md](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/docs/memory-os-roadmap.md).
2. Read this `AGENTS.md`.
3. Identify the single roadmap slice currently in progress or next up.
4. Check `git status` before editing anything.
5. Preserve unrelated user changes. Do not revert or rewrite them unless explicitly asked.

## Phase Workflow

Work one roadmap slice at a time. Treat each `PR x.y` heading in the roadmap as the unit of delivery.

1. Gather minimal local context for the current slice.
2. If the slice is non-trivial, architecture-sensitive, or risky, do a deliberate planning pass before making structural decisions.
3. Keep scope pinned to the active roadmap slice. Do not partially start the next slice in the same change unless the user explicitly asks for it.
4. Implement the smallest viable change that satisfies the roadmap acceptance criteria.
5. Run targeted verification for the touched area.
6. Run the regression baseline:
   - `./nmc-memory-plugin/tests/run-contract-tests.sh`
   - `./nmc-memory-plugin/tests/run-integration.sh`
7. If the change has regression risk, do a focused review pass before finalizing.
8. Update [docs/memory-os-roadmap.md](/Users/nmc/Documents/WORK-NMC/GitHub/NMC/nmc-ai-plugins.v1/docs/memory-os-roadmap.md):
   - mark the completed roadmap slice as done
   - update `Immediate Next Step`
   - record the verification commands that were actually run
9. Update this `AGENTS.md` if the current state or workflow changed.
10. Commit only the files relevant to the completed slice. Prefer the roadmap slice title as the commit message.

## Slice Constraints

These rules stay in force for every phase unless the roadmap explicitly changes them:

- do not break `openclaw nmc-memory setup`, auto-bootstrap, or `openclaw.plugin.json`
- do not change the default workspace layout under `system/`
- do not change the canon on-disk format during extraction
- do not let runtime memory write canon directly
- do not bypass the single promotion path into canon
- do not replace `./nmc-memory-plugin/tests/run-integration.sh` as the primary regression gate during extraction

## Phase 0 Guidance

Phase 0 is complete:

- `PR 0.1` remains the additive-only baseline freeze
- `PR 0.2` established package skeletons only
- `PR 1.1` extracted `@nmc/memory-contracts` as a dependency-free boundary
- `PR 1.1b` extracted `@nmc/memory-ingest` as the source and provenance boundary on top of `@nmc/memory-contracts`
- `PR 1.2` extracted `@nmc/memory-canon` as the shared canon boundary for layout, manifest, graph, lock, promoter, and verify-time validation logic
- `PR 1.3` extracted `@nmc/memory-maintainer` as the shared task, policy, script-contract, and operational execution boundary around `system/`
- `PR 1b.1` extracted `@nmc/memory-scripts` as the package boundary for deterministic helper scripts while preserving plugin-local entrypoints through compatibility wrappers
- `PR 1b.2` extracted `@nmc/memory-workspace` for shared path, filesystem, and template-copy helpers while preserving setup output and runtime bootstrap behavior
- `PR 1b.3` extracted `@nmc/memory-agents` for predefined roster definitions, machine-readable role manifests, role bundles, and deterministic agent workspace rendering while preserving plugin-local scaffold placement and config mutation
- `PR 1b.4` extracted higher-level `@nmc/memory-workspace` scaffold orchestration for template copy, shared skill wiring, agent workspace materialization, and agent state directories while preserving current `system/` layout, symlink behavior, and `openclaw.json` semantics
- `PR 1b.5` extracted `@nmc/memory-pipeline` for engine-agnostic sequencing of `extract`, `curate`, `apply`, and `verify` while preserving current `pipeline.sh` behavior, dry-run semantics, and failure handling through a thin plugin-local wrapper
- `PR 2.1` introduced `memory-os-gateway` as the in-process SDK for read, bootstrap, query, status, verify, and health operations while keeping OpenClaw-specific config mutation in the adapter layer
- `PR 2.2` added safe gateway-mediated proposal, feedback, pending-batch materialization, job receipts, and lock scaffolding surfaces without granting direct canon write access
- `Phase 2.5` added a temporary read-only gateway ops harness for jobs, proposals, conflicts, locks, verify, status, degraded-mode inspection, and current projections without widening into control-plane ownership
- `PR 3.1` moved OpenClaw-specific registration, setup CLI parsing, auto-bootstrap lifecycle wiring, and config mutation behind `packages/adapter-openclaw` while preserving existing setup and bootstrap behavior
- `PR 3.2` introduced a narrow contract-validated adapter boundary for `extract`, `curate`, and transitional `apply` invocation while preserving current `pipeline.sh` behavior, dry-run output, and failure handling
- `PR 3.2b` moved active canon serialization into the deterministic promoter in `packages/memory-canon`, kept `apply` as a compatibility shim at the pipeline boundary, and updated gateway handoff metadata to advertise `core-promoter` as the single write path
- `PR 3.3` moved bundled OpenClaw skill assets under `packages/adapter-openclaw`, kept `nmc-memory-plugin/skills` as the compatibility discovery surface, and preserved stable skill names plus live setup/bootstrap behavior
- `PR 3.4` added the shared adapter conformance suite in `packages/adapter-conformance`, proved `adapter-openclaw` against capability-scoped bootstrap/read/status/verify/write-orchestration checks, and kept the protocol boundary narrow by validating only explicitly claimed capabilities
- `PR 4.1` introduced `adapter-codex` as the first non-OpenClaw adapter with role-aware bootstrap, canon-safe read-only execution, a package-local single-thread runner, and shared conformance coverage while keeping write orchestration out of scope
- `PR 4.2` expanded `adapter-codex` into the bounded single-run contract with role-bundle intake, gateway-mediated proposal upload, explicit feedback/completion handoff, and shared conformance coverage while keeping canon writes behind the core promoter
- `PR 5.1` replaced the `memory-os-runtime` placeholder with a shadow-store package plus gateway runtime surfaces so runtime artifacts live under `runtime/shadow/`, stay separate from canon, remain disposable/rebuildable, and are inspectable without widening into canonical writes
- `Phase 5.5` integrated OpenClaw as a runtime-backed orchestration adapter over the shadow runtime by adding gateway-backed recall bundles and thin orchestration helpers without reintroducing memory ownership or bypassing the single promotion path into canon
- `Phase 6` formalized `packages/control-plane` as a supported read-only operator surface and health monitor over stable gateway, runtime, and maintainer contracts while keeping scheduler, backlog-policy, and promotion ownership outside the control-plane
- `control-plane v2` moved proposal/conflict queue visibility into a control-plane-owned read model and added advisory-only manual intervention receipts under `runtime/shadow/control-plane/interventions/` without inheriting scheduler or promotion authority
- the next slice is `control-plane v3`, which should add analytics, audits, runtime inspection, and richer operator views without turning runtime, queue policy, or promotion flow into control-plane authority

## Commit Convention

Use the roadmap slice title as the default commit message, for example:

- `Phase 0 / PR 0.1: Golden Fixture Freeze`
- `Phase 0 / PR 0.2: Package Skeletons Only`
- `Phase 1 / PR 1.1: Extract @nmc/memory-contracts`

If a slice spans multiple commits, keep every commit explicitly tied to the same roadmap slice.

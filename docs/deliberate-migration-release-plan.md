# Deliberate Migration Release Plan

This document fixes the post-freeze release boundary now that the shipped plugin surface no longer exports the deprecated gateway ops bridge from installed artifacts.

It is a planning artifact for the next migration release. It does not change setup behavior, workspace layout, canon format, or control-plane authority.

## Release Boundary

The current repository now has three distinct surface types:

| Surface | Current posture | Release posture |
| --- | --- | --- |
| `nmc-memory-plugin` | OpenClaw install, setup, auto-bootstrap, bundled skills, and compatibility packaging shell | Keep as the only supported production OpenClaw install/setup shell for the migration release until OpenClaw can consume a thinner adapter package directly |
| `packages/control-plane` | Supported read-only operator SDK/CLI, including the shipped plugin mirror under `nmc-memory-plugin/packages/control-plane/` | Treat as the supported operator surface for migration-release automation and operator workflows |
| `packages/memory-os-gateway` | Supported programmatic Memory OS SDK/CLI for read, bootstrap, query, status, verify, runtime recall, and safe write orchestration | Keep supported, but exclude the deprecated ops bridge from the migration-release contract |

The following surfaces are explicitly not part of the supported migration-release contract:

- any `memory-os-gateway/ops` package path
- direct installation or operator targeting of `packages/adapter-openclaw`

## What The Release Must Preserve

The deliberate migration release must leave these stable:

- `openclaw nmc-memory setup`
- plugin auto-bootstrap behavior
- `openclaw.plugin.json` config schema
- managed `openclaw.json` writes
- workspace layout under `system/`
- predefined agent workspace layout and state directories
- canon file layout and Markdown/YAML envelopes
- control-plane read-only authority boundary

## Cutover Decision

The release cutover is a classification and retirement step, not a capability step:

1. Keep `nmc-memory-plugin` as the compatibility shell and current production install/setup shell for OpenClaw packaging, setup, bootstrap, and bundled skills.
2. Treat `packages/control-plane` as the only supported operator surface for installed-artifact automation.
3. Treat `packages/memory-os-gateway` as the supported programmatic SDK/CLI surface, except for the deprecated ops compatibility read model.
4. Do not begin a direct-install cutover to `packages/adapter-openclaw` in this slice; that remains a future deliberate breaking change.

This keeps the current production behavior intact while making the supported Memory OS surfaces explicit.

## Internal Bridge Inventory

After shipped-mirror cleanup on `2026-03-19`, no live runtime or hidden package implementations of `getOpsSnapshot` / `inspectOps` remain. The remaining references are limited to:

- negative boundary assertions that prove the CLI/package surface does not expose the bridge from supported root or shipped paths
- roadmap and README references that describe the retirement boundary

That means the remaining follow-up risk is no longer the old gateway bridge itself. The next breaking boundary after this slice is the eventual retirement plan for the OpenClaw compatibility shell, not lingering gateway bridge behavior.

## Planned Follow-Up Sequence

### 1. Repo-Local Bridge Retirement Prep

Goal:
- migrate any remaining internal checks and compatibility tooling off the deprecated gateway ops read model and onto supported `control-plane` or other gateway surfaces

Exit gate:
- no repo-local production or positive fixture/tooling paths need `getOpsSnapshot`, `inspectOps`, `inspect_ops`, or `memory-os-gateway/ops`
- fixture coverage still protects the supported release boundary after the migration

Status:
- complete on `2026-03-19` by removing direct bridge validation from the root and shipped-mirror gateway fixture tests while keeping negative CLI/package boundary checks and the `control-plane` operator coverage intact

### 2. Repo-Local Bridge Retirement

Goal:
- remove the deprecated ops compatibility read model from the root `packages/memory-os-gateway` package once the prep gate is met

Exit gate:
- root package no longer ships `lib/ops.js` as an active compatibility surface
- root docs no longer describe the deprecated bridge as available
- regression baseline stays green without reintroducing shipped-surface ambiguity

Status:
- complete on `2026-03-19` by deleting `packages/memory-os-gateway/lib/ops.js`, removing the root main/package exports, and replacing root fixture coverage with negative package-boundary assertions

### 3. Shipped-Mirror Bridge Cleanup Decision

Goal:
- decide whether the hidden `nmc-memory-plugin/packages/memory-os-gateway/lib/ops.js` implementation should be retired or intentionally retained as a private packaging detail

Exit gate:
- the repository records an explicit decision without changing the supported shipped operator/package contract by accident
- installed-artifact behavior and `packages/control-plane` guidance remain unchanged

Status:
- complete on `2026-03-19` by deleting the hidden shipped-mirror implementation and updating release-qualification metadata and shipped docs to treat the gateway ops bridge as retired everywhere

### 4. Compatibility-Shell Cutover Decision

Goal:
- record whether `nmc-memory-plugin` remains the production install/setup shell for the migration release or whether a direct-install cutover to thinner Memory OS packaging should begin now

Exit gate:
- the repository makes the production install-surface decision explicit in docs and machine-readable release qualification
- installed-artifact guidance continues to point OpenClaw users at `nmc-memory-plugin` for install/setup while keeping `packages/control-plane` and `packages/memory-os-gateway` as the supported operator and programmatic surfaces
- `packages/adapter-openclaw` remains clearly classified as an extracted internal adapter package rather than a supported direct install target

Status:
- complete on `2026-03-19` by explicitly retaining `nmc-memory-plugin` as the production OpenClaw install/setup shell for the migration release, adding release-qualification metadata for that decision, and updating docs to defer any direct-install adapter cutover into a later deliberate breaking slice

### 5. Compatibility-Shell Retirement Prerequisites

Goal:
- define the explicit gates that must be cleared before `nmc-memory-plugin` can stop being the production OpenClaw install/setup shell

Exit gate:
- the repository records the direct-install cutover gates in docs and machine-readable release qualification
- installed-artifact automation can inspect those gates without inferring them from scattered docs or duplicated shell code
- the next implementation slice can target one concrete prerequisite instead of reopening the entire packaging question

Status:
- complete on `2026-03-19` by recording five pending cutover gates in release qualification and docs:
  - `install-manifest-surface`: `openclaw.plugin.json` and `openclaw.extensions` still live under `nmc-memory-plugin`
  - `wrapper-convergence`: `nmc-memory-plugin/index.js`, `nmc-memory-plugin/lib/openclaw-setup.js`, and `nmc-memory-plugin/scripts/setup-openclaw.js` still diverge from `packages/adapter-openclaw`
  - `skill-discovery-surface`: live installs still discover bundled skills through `nmc-memory-plugin/skills`
  - `shipped-artifact-layout`: installed control-plane and gateway paths still assume `~/.openclaw/extensions/nmc-memory-plugin/`
  - `regression-cutover-coverage`: the regression baseline still freezes plugin-shell packaging rather than a direct adapter-install surface

### 6. Compatibility-Shell Wrapper Convergence

Goal:
- remove duplicated runtime/setup shell logic now that the direct-install retirement gates are explicit

Exit gate:
- `nmc-memory-plugin/index.js`, `nmc-memory-plugin/lib/openclaw-setup.js`, and `nmc-memory-plugin/scripts/setup-openclaw.js` delegate to `packages/adapter-openclaw`
- shipped-artifact packaging includes `packages/adapter-openclaw` so the thin wrappers stay valid after `npm pack`
- release qualification keeps the direct-install cutover blocked, but no longer treats wrapper divergence as a pending prerequisite

Status:
- complete on `2026-03-19` by collapsing the three plugin shell entrypoints into thin wrappers over `packages/adapter-openclaw`, extending adapter/package tests to guard the wrapper shape, and marking `wrapper-convergence` as cleared while leaving the other direct-install retirement gates pending

### 7. Compatibility-Shell Skill Discovery Convergence

Goal:
- move live OpenClaw skill discovery off `nmc-memory-plugin/skills` and onto the adapter-owned bundled skill surface without changing install ownership or compatibility wrapper paths

Exit gate:
- `openclaw.plugin.json` points live skill discovery at `packages/adapter-openclaw/skills`
- packed plugin artifacts include that adapter-owned skill root and release qualification no longer treats `skill-discovery-surface` as pending
- `nmc-memory-plugin/skills` stays packaged as a compatibility wrapper surface for stable direct script paths and docs

Status:
- complete on `2026-03-19` by repointing the plugin manifest at `packages/adapter-openclaw/skills`, updating shipped-artifact assertions and bootstrap fixtures to freeze the adapter-owned discovery root, and marking `skill-discovery-surface` as cleared while leaving install-manifest, shipped-layout, and regression-cutover gates pending

### 8. Compatibility-Shell Shipped Artifact Layout Convergence

Goal:
- expose stable shell-owned installed-artifact paths for operator and gateway usage without changing compatibility-shell ownership or direct-install policy

Exit gate:
- installed CLI usage goes through `nmc-memory-plugin/bin/memory-control-plane.js` and `nmc-memory-plugin/bin/memory-os-gateway.js` rather than nested `packages/*/bin/` paths
- installed programmatic usage goes through shell-owned wrapper directories under `nmc-memory-plugin/control-plane/` and `nmc-memory-plugin/memory-os-gateway/`
- packed-artifact tests and release qualification no longer treat `shipped-artifact-layout` as pending

Status:
- complete on `2026-03-19` by adding shell-owned CLI and programmatic wrappers in `nmc-memory-plugin`, updating packed-artifact smoke coverage and installed-artifact docs to use those wrapper paths, and marking `shipped-artifact-layout` as cleared while leaving install-manifest and regression-cutover gates pending

### 9. Compatibility-Shell Regression Cutover Coverage

Goal:
- move the regression baseline off pure compatibility-shell packaging assumptions by freezing a synthetic direct adapter surface alongside the current production shell

Exit gate:
- the regression baseline exercises adapter-openclaw setup/runtime flows without routing through `nmc-memory-plugin` shell wrappers
- release qualification no longer treats `regression-cutover-coverage` as pending
- install-manifest remains the last unresolved direct-install retirement gate

Status:
- complete on `2026-03-19` by adding a synthetic direct-surface bootstrap smoke to `nmc-memory-plugin/tests/run-integration.sh`, updating release qualification and control-plane fixture expectations, and leaving `install-manifest-surface` as the only remaining retirement gate

### 10. Compatibility-Shell Install Manifest Surface Convergence

Goal:
- move OpenClaw install manifest ownership off `nmc-memory-plugin` while preserving the current production shell and setup/bootstrap behavior

Exit gate:
- `packages/adapter-openclaw` owns the OpenClaw install manifest surface under `openclaw.plugin.json`, `package.json#openclaw`, `plugin.js`, and bundled `templates/`
- `nmc-memory-plugin` keeps compatibility-shell mirrors for `openclaw.plugin.json` and `openclaw.extensions` without becoming the source of truth
- release qualification no longer treats `install-manifest-surface` as pending and reports that the direct-install retirement prerequisites are fully cleared

Status:
- complete on `2026-03-19` by adding adapter-owned install manifest metadata and bundled templates under `packages/adapter-openclaw`, keeping compatibility-shell mirrors in `nmc-memory-plugin`, updating adapter/control-plane fixture coverage plus packed-artifact smoke tests, and marking `install-manifest-surface` as cleared while keeping `nmc-memory-plugin` as the production install/setup shell for the current migration release

## Non-Goals For This Slice

The deliberate migration release planning slice should not:

- add new control-plane commands or operator capabilities
- widen control-plane authority into scheduler, queue policy, or promotion ownership
- change setup/bootstrap behavior or the managed workspace layout
- redesign packaging beyond the existing compatibility shell
- retire `nmc-memory-plugin` as the production install/setup shell
- turn `packages/adapter-openclaw` into a supported direct install target in the same slice
- clear retirement gates unrelated to wrapper convergence in the same slice

## Verification For This Planning Slice

Use these checks to confirm the plan matches the repository state:

```bash
rg -n "getOpsSnapshot|inspectOps|inspect_ops|memory-os-gateway/ops|ops-snapshot" . --glob '!node_modules/**' --glob '!**/dist/**'
PATH="/usr/local/bin:$PATH" node packages/control-plane/test/validate-fixtures.js
PATH="/usr/local/bin:$PATH" node nmc-memory-plugin/packages/control-plane/test/validate-fixtures.js
PATH="/usr/local/bin:$PATH" node packages/memory-os-gateway/test/validate-fixtures.js
PATH="/usr/local/bin:$PATH" node nmc-memory-plugin/packages/memory-os-gateway/test/validate-fixtures.js
PATH="/usr/local/bin:$PATH" ./nmc-memory-plugin/tests/run-contract-tests.sh
PATH="/usr/local/bin:$PATH" ./nmc-memory-plugin/tests/run-integration.sh
```

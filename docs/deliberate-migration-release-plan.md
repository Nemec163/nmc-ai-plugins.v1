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

## Non-Goals For This Slice

The deliberate migration release planning slice should not:

- add new control-plane commands or operator capabilities
- widen control-plane authority into scheduler, queue policy, or promotion ownership
- change setup/bootstrap behavior or the managed workspace layout
- redesign packaging beyond the existing compatibility shell
- retire `nmc-memory-plugin` as the production install/setup shell
- turn `packages/adapter-openclaw` into a supported direct install target in the same slice

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

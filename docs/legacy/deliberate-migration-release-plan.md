# Deliberate Migration Release Plan

Status: historical archive as of `2026-03-19`.

This document preserves the planning notes that were used to retire the old
compatibility shell and the deprecated gateway ops bridge. It is no longer the
live source of truth for current repository surfaces.

Use these documents instead for current-state guidance:

- [../supported-surfaces.md](../supported-surfaces.md) for the current package
  matrix and support classes
- [../release-readiness.md](../release-readiness.md) for the current production
  gate
- [./implementation-guide.md](./implementation-guide.md) for installation,
  setup, and day-2 operations
- [./memory-os-roadmap.md](./memory-os-roadmap.md) for migration history and the
  next bounded slice

## What This Plan Settled

The completed work captured here established the repository's current boundary:

- `packages/adapter-openclaw` is the supported OpenClaw install/setup surface
- `packages/control-plane` is the supported read-only operator surface
- `packages/memory-os-gateway` is the supported programmatic surface
- `memory-os-gateway/ops` is retired and replaced by `control-plane`
- `nmc-memory-plugin` is retired and remains only as a historical identifier in
  roadmap and release-qualification metadata

## Why This File Is Archived

Large parts of the original plan described intermediate states that no longer
exist in the repository, including compatibility-shell mirrors and staged
cutover gates that were removed once `nmc-memory-plugin` left the tree. Keeping
those steps framed as live guidance would now be misleading.

The historical sequence still matters when reading roadmap entries or old
release notes, but operational and package-surface decisions should be taken
from the live documents linked above.

---
name: kanban-operator
description: Execute and maintain the file-first NMC kanban loop with system/scripts/kanban.mjs, including resolving effective autonomy and git flow before state-changing work.
---

# Kanban Operator

Use this skill to run the shared board safely and consistently.

## Core loop

1. Read board defaults:
   - `node system/scripts/kanban.mjs settings --json`
2. Get current task for owner:
   - `node system/scripts/kanban.mjs next --owner <owner> --json`
3. Resolve effective autonomy and git flow from task metadata plus board defaults.
4. If task status is `planned`, move it to `in_progress`:
   - `node system/scripts/kanban.mjs set-status <id> in_progress`
5. Execute exactly one concrete step from `next_action`.
6. Immediately update the board:
   - If more work remains: set a new concrete `next_action`
   - If waiting on input/dependency: set `blocked` and fill `blocked_reason`
   - If complete and verified: set `review` or `done`

## Policy guardrails

- Respect `system/policy/shared/autonomy.md` before edits, commands, git, or external side effects.
- Respect `system/policy/shared/git-flow.md` before commit or push.
- Respect `system/policy/shared/operations.md` when deciding whether to delegate or restart in a fresh context.
- Never treat `inherit` as a final value; always resolve the effective value first.

## Fast commands

- Update next action:
  - `node system/scripts/kanban.mjs set-next <id> "<next step>"`
- Set owner:
  - `node system/scripts/kanban.mjs set-owner <id> <owner>`
- Set status:
  - `node system/scripts/kanban.mjs set-status <id> <status>`
- Set task autonomy override:
  - `node system/scripts/kanban.mjs set-autonomy <id> <inherit|full|partial|ask|none>`
- Set task git flow override:
  - `node system/scripts/kanban.mjs set-git-flow <id> <inherit|main|pr>`
- Set board autonomy default:
  - `node system/scripts/kanban.mjs set-board-autonomy <full|partial|ask|none>`
- Set board git flow default:
  - `node system/scripts/kanban.mjs set-board-git-flow <main|pr>`

## Transition guardrails

- Keep `next_action` concrete and atomic.
- Never leave `in_progress` without a meaningful `next_action`.
- Never set `blocked` without `blocked_reason`.
- Never keep `next_action` populated when setting status `done`.
- Update Kanban metadata in the same session as the actual work.

## Contract source

This skill follows the shared kanban contract as implemented by the deployed reference CLI `system/scripts/kanban.mjs`, with contract rules currently maintained in `@nmc/memory-maintainer`.

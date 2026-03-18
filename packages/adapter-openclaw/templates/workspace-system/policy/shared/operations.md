# Shared Policy: Operations (how we execute)

These are the **default operating rules** for all NMC agents unless a higher-priority instruction overrides them.

## 1) Subagents are allowed (and preferred for real work)

- Any agent may spawn subagents to complete a task.
- Prefer subagents when the work is:
  - large / multi-step (analysis + edits)
  - long-running
  - likely to need experimentation or many tool calls
  - risky (needs isolation before touching main context)

Rationale: subagents run in isolated sessions, which keeps the main chat clean and reduces context bloat.

## 2) Start tasks with a fresh execution context

Before starting a new task, ensure you’re operating with **max available context budget**:

Preferred order:
1) **Run the task in an isolated fresh session** (spawn a subagent). This satisfies the “fresh session” requirement without interrupting the user chat.
2) If the task must be done in the main session (e.g., it requires main-session-only context), request a **/new** reset first (or do it if you have the capability in the current runtime).

Practical guidance:
- If you notice you’re carrying lots of stale context, do not push forward blindly; restart the task in a fresh subagent.
- When you start a new task, restate assumptions in the deliverable and link to changed files/commits.

## 3) Closeout

- If you modify repo files: commit + push (see `./git.md`).
- For destructive docs cleanup: delete via git (no local “archive” folders).

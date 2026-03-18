---
name: memory-onboard-agent
description: Run the local onboarding script to scaffold a new agent memory slice under core/agents.
metadata: {"openclaw":{"os":["darwin","linux"]}}
---

# memory-onboard-agent

`Skill ID`: `memory-onboard-agent`
`Type`: `script`
`Trigger`: `manual`
`Pipeline Phase`: `Setup`
`Entrypoint`: `{baseDir}/onboard.sh`

## Purpose

Scaffold a new agent-memory slice under `core/agents/` and register it in the agent index so new role memories can be curated safely.

## System Prompt / Execution Contract

```text
Run the onboard script with a role_name argument.

The script creates the canonical scaffolding for one new agent role.
It must add the role directory, create the four standard competence files, and update the agent registry.

Expected actions:
1. Validate the provided role_name.
2. Create core/agents/{role_name}/ if it does not exist.
3. Create COURSE.md, PLAYBOOK.md, PITFALLS.md, and DECISIONS.md with template frontmatter and headings.
4. Update core/agents/_index.md with a new registry row for the role.
5. Print a concise summary of created or reused paths.

The script should be safe by default.
It must avoid destructive overwrites unless explicit future flags permit them.
```

## Input Contract

- Required argument: `role_name`
- Target location: `core/agents/{role_name}/`
- Registry target: `core/agents/_index.md`
- Preconditions: the memory workspace scaffold already exists

## Output Contract

- Created directory: `core/agents/{role_name}/`
- Created files: `COURSE.md`, `PLAYBOOK.md`, `PITFALLS.md`, `DECISIONS.md`
- Updated registry: `core/agents/_index.md`
- Console output describing what was created or skipped

## Tools

- Primary executor: `{baseDir}/onboard.sh`
- Local capabilities used by the script: filesystem writes, filesystem reads, and simple text update logic
- No LLM tools are required during runtime

## Constraints

- Do not overwrite an existing role's files destructively.
- Do not register the same role twice in `core/agents/_index.md`.
- Do not create non-standard competence file names.
- Do not modify unrelated agent directories.

## Success Criteria

- `core/agents/{role_name}/` exists with the four standard files.
- `core/agents/_index.md` includes the new role exactly once.
- The scaffold is ready for future competence records written by `memory-apply`.

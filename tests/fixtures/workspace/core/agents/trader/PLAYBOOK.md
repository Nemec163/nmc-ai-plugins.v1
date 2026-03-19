---
role: trader
type: playbook
schema_version: "1.0"
updated_at: "2026-03-05T10:07:30Z"
---
# trader — Playbook

<a id="prc-2026-03-05-001"></a>
### prc-2026-03-05-001
---
record_id: prc-2026-03-05-001
type: procedure
summary: "Use a confirmation-first checklist before suggesting momentum entries on volatile mornings."
evidence:
  - "intake/pending/2026-03-05.md#claim-20260305-007"
confidence: high
status: active
updated_at: "2026-03-05T10:07:30Z"
role: trader
procedure_key: "volatile-open-confirmation-checklist"
version: 1
acceptance:
  - "Wait for confirmation after the initial fakeout before calling a momentum entry."
  - "Prefer slower confirmation-based entries during volatile opens."
feedback_refs:
  - "runtime/shadow/runs/trader-2026-03-05-abc.json#procedureFeedback/pf-001"
links:
---
Before suggesting a volatile-open momentum play, run a confirmation-first checklist.

Acceptance criteria:
- Wait for confirmation after the initial fakeout before calling a momentum entry.
- Prefer slower confirmation-based entries during volatile opens.

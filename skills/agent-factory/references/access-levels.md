# Access levels

- `A0_isolated`: local-only memory writes.
- `A1_worker`: local writes + shared/domain reads.
- `A2_domain_builder`: domain writes + promotion requests.
- `A3_system_operator`: shared writes + ops-tier maintenance.
- `A4_orchestrator_full`: full RW and promotion approval.

Default for new specialized agents: `A1_worker` or `A2_domain_builder`.

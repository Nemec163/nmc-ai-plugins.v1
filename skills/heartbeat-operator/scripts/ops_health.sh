#!/usr/bin/env bash
set -euo pipefail

principal="${1:-${NMC_PRINCIPAL:-orchestrator}}"
actor_level="${2:-${NMC_ACTOR_LEVEL:-A3_system_operator}}"

openclaw nmc-ops health --json
openclaw nmc-ops heartbeat --principal "$principal" --actor-level "$actor_level" --json
openclaw nmc-mem stats --json
openclaw nmc-mem quality --json

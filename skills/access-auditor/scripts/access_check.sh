#!/usr/bin/env bash
set -euo pipefail

openclaw nmc-agent list --json | sed -n '1,200p'

principal="${1:-${NMC_PRINCIPAL:-orchestrator}}"
actor_level="${2:-A3_system_operator}"
openclaw nmc-mem principals --principal "$principal" --actor-level "$actor_level" --limit 500 --json

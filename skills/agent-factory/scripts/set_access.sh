#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <agent_id> <access_level>" >&2
  exit 1
fi

openclaw nmc-agent set-access --agent-id "$1" --access-level "$2" --json
openclaw nmc-mem bootstrap --principal "$1" --actor-level "$2" --query "access-level update" --json

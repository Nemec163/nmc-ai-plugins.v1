#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <agent_id>" >&2
  exit 1
fi

openclaw nmc-agent delete --agent-id "$1" --mode hard --json

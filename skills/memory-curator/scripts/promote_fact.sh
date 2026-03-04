#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "Usage: $0 <candidate_id> <reason> <actor_level>" >&2
  exit 1
fi

openclaw nmc-mem promote \
  --candidate-id "$1" \
  --target-layer M4_global_facts \
  --reason "$2" \
  --actor-level "$3" \
  --json

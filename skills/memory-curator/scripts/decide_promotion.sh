#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "Usage: $0 <promotion_id> <approved|rejected> <reason>" >&2
  exit 1
fi

openclaw nmc-mem decide \
  --promotion-id "$1" \
  --decision "$2" \
  --reason "$3" \
  --actor-level A4_orchestrator_full \
  --json

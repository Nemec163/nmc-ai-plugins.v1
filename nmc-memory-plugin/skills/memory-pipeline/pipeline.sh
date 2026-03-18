#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
PIPELINE_BIN="$SCRIPT_DIR/../../../packages/memory-pipeline/bin/run-pipeline.sh"

if [ ! -x "$PIPELINE_BIN" ]; then
  echo "error: pipeline package not found or not executable: $PIPELINE_BIN" >&2
  exit 2
fi

export PIPELINE_VERIFY_CMD="${PIPELINE_VERIFY_CMD:-$PLUGIN_ROOT/skills/memory-verify/verify.sh}"
exec "$PIPELINE_BIN" "$@"

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUNDLED_BIN="$PLUGIN_ROOT/memory-scripts/bin/onboard.sh"
WORKSPACE_BIN="$PLUGIN_ROOT/../memory-scripts/bin/onboard.sh"

if [ -x "$BUNDLED_BIN" ]; then
  exec "$BUNDLED_BIN" "$@"
fi

exec "$WORKSPACE_BIN" "$@"

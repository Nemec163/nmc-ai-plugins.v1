#!/usr/bin/env bash
set -euo pipefail

EXIT_CODE=0
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CANON_VERIFY_CLI="$SCRIPT_DIR/../../memory-canon/lib/verify-cli.js"

usage() {
  echo "Usage: $0 path/to/workspace/system/memory" >&2
}

resolve_node_bin() {
  local candidate

  for candidate in "${MEMORY_NODE_CMD:-}" node nodejs /usr/local/bin/node /opt/homebrew/bin/node /usr/bin/node; do
    [ -n "$candidate" ] || continue

    if command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return 0
    fi

    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

now_rfc3339() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

today_utc() {
  date -u +"%Y-%m-%d"
}

resolve_meta_dir() {
  local memory_root="$1"

  if [ -d "$memory_root/core/meta" ] || [ -d "$memory_root/core" ] || [ -f "$memory_root/core/system/CANON.md" ]; then
    printf '%s\n' "$memory_root/core/meta"
  else
    printf '%s\n' "$memory_root/meta"
  fi
}

main() {
  local memory_root meta_dir manifest_file updated_at today warning_count meta_rel node_bin

  if [ "$#" -ne 1 ]; then
    usage
    return 1
  fi

  memory_root="${1%/}"

  if [ ! -d "$memory_root" ]; then
    echo "error: memory directory not found: $memory_root" >&2
    return 1
  fi

  if [ ! -f "$CANON_VERIFY_CLI" ]; then
    echo "error: canon verify CLI not found: $CANON_VERIFY_CLI" >&2
    return 1
  fi

  meta_dir="$(resolve_meta_dir "$memory_root")"
  manifest_file="$meta_dir/manifest.json"
  updated_at="$(now_rfc3339)"
  today="$(today_utc)"
  node_bin="$(resolve_node_bin)" || {
    echo "error: node executable not found; set MEMORY_NODE_CMD or add node to PATH" >&2
    return 1
  }

  warning_count="$("$node_bin" "$CANON_VERIFY_CLI" "$memory_root" "$updated_at" "$today")"

  if ! git -C "$memory_root" rev-parse --show-toplevel >/dev/null 2>&1; then
    echo "error: memory directory is not inside a git repository" >&2
    return 1
  fi

  meta_rel="${meta_dir#$memory_root/}"
  git -C "$memory_root" add "$meta_rel"

  if ! git -C "$memory_root" diff --cached --quiet -- "$meta_rel"; then
    git -C "$memory_root" commit -m "memory: manifest update $today" >/dev/null
  fi

  if [ "${warning_count:-0}" -gt 0 ]; then
    EXIT_CODE=1
  fi
}

main "$@" || exit 2
exit "$EXIT_CODE"

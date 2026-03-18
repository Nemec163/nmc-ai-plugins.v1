#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 \"scope: summary\"" >&2
}

main() {
  local message branch

  message="${1:-}"
  if [ -z "$message" ]; then
    usage
    exit 2
  fi

  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "error: current directory is not inside a git repository" >&2
    exit 1
  fi

  if [ -z "$(git status --porcelain)" ]; then
    echo "No changes to close out."
    exit 0
  fi

  git diff --stat || true
  git add -A

  if git diff --cached --quiet; then
    echo "No staged changes to commit."
    exit 0
  fi

  git commit -m "$message"
  branch="$(git rev-parse --abbrev-ref HEAD)"
  git push origin "$branch"
}

main "$@"

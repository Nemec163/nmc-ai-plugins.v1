#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

pass() {
  printf 'PASS: %s\n' "$1"
}

assert_file_exists() {
  local relative_path="$1"
  if [[ ! -f "$ROOT_DIR/$relative_path" ]]; then
    fail "missing required file: $relative_path"
  fi
  pass "required file exists: $relative_path"
}

assert_text_contains() {
  local relative_path="$1"
  local expected="$2"
  if ! grep -Fq "$expected" "$ROOT_DIR/$relative_path"; then
    fail "expected '$expected' in $relative_path"
  fi
  pass "verified '$expected' in $relative_path"
}

printf '[GATE] Production readiness document and supported-surface references\n'
assert_file_exists "docs/supported-surfaces.md"
assert_file_exists "docs/legacy/implementation-guide.md"
assert_file_exists "docs/legacy/memory-os-roadmap.md"
assert_file_exists "docs/release-readiness.md"
assert_text_contains "README.md" "./docs/legacy/implementation-guide.md"
assert_text_contains "README.md" "./docs/legacy/memory-os-roadmap.md"
assert_text_contains "README.md" "./docs/supported-surfaces.md"
assert_text_contains "README.md" "./docs/release-readiness.md"
assert_text_contains "docs/release-readiness.md" "./tests/run-contract-tests.sh"
assert_text_contains "docs/release-readiness.md" "./tests/run-integration.sh"

printf '\n[GATE] Release qualification and supported-surface fixtures\n'
PATH="/usr/local/bin:$PATH" node "$ROOT_DIR/packages/control-plane/test/validate-fixtures.js"

printf '\n[GATE] Contract baseline\n'
PATH="/usr/local/bin:$PATH" "$ROOT_DIR/tests/run-contract-tests.sh"

printf '\n[GATE] Integration baseline\n'
PATH="/usr/local/bin:$PATH" "$ROOT_DIR/tests/run-integration.sh"

printf '\nProduction readiness gate passed.\n'

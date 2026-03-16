#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FIXTURES_ROOT="$SCRIPT_DIR/fixtures"
WORKSPACE_FIXTURE="$FIXTURES_ROOT/workspace"
GOLDEN_ROOT="$SCRIPT_DIR/golden"
VERIFY_SCRIPT="$PLUGIN_ROOT/skills/memory-verify/verify.sh"
STATUS_SCRIPT="$PLUGIN_ROOT/skills/memory-status/status.sh"
ONBOARD_SCRIPT="$PLUGIN_ROOT/skills/memory-onboard-agent/onboard.sh"
PIPELINE_SCRIPT="$PLUGIN_ROOT/skills/memory-pipeline/pipeline.sh"
RETENTION_SCRIPT="$PLUGIN_ROOT/skills/memory-retention/retention.sh"
CONTRACT_FIXTURE_TEST="$PLUGIN_ROOT/../packages/memory-contracts/test/validate-fixtures.js"
INGEST_FIXTURE_TEST="$PLUGIN_ROOT/../packages/memory-ingest/test/validate-fixtures.js"
CANON_FIXTURE_TEST="$PLUGIN_ROOT/../packages/memory-canon/test/validate-fixtures.js"
MAINTAINER_FIXTURE_TEST="$PLUGIN_ROOT/../packages/memory-maintainer/test/validate-fixtures.js"
SCRIPTS_FIXTURE_TEST="$PLUGIN_ROOT/../packages/memory-scripts/test/validate-fixtures.js"

PASS_COUNT=0
FAIL_COUNT=0
TEST_WORKDIR=""
TEST_MEMORY_ROOT=""
LAST_STDOUT=""
LAST_STDERR=""
LAST_EXIT_CODE=0

cleanup() {
  if [ -n "$TEST_WORKDIR" ] && [ -d "$TEST_WORKDIR" ]; then
    rm -rf "$TEST_WORKDIR"
  fi

  TEST_WORKDIR=""
  TEST_MEMORY_ROOT=""
}

trap cleanup EXIT

print_case() {
  printf '\n[%s] %s\n' "$1" "$2"
}

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf 'PASS: %s\n' "$1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf 'FAIL: %s\n' "$1"
  if [ -n "${2:-}" ]; then
    printf '  %s\n' "$2"
  fi
}

require_file() {
  local path="$1"
  local description="$2"

  if [ -f "$path" ]; then
    return 0
  fi

  fail "$description" "Missing file: $path"
  return 1
}

require_dir() {
  local path="$1"
  local description="$2"

  if [ -d "$path" ]; then
    return 0
  fi

  fail "$description" "Missing directory: $path"
  return 1
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

run_and_capture() {
  local stdout_file stderr_file

  stdout_file="$TEST_WORKDIR/stdout.txt"
  stderr_file="$TEST_WORKDIR/stderr.txt"

  set +e
  "$@" >"$stdout_file" 2>"$stderr_file"
  LAST_EXIT_CODE=$?
  set -e

  LAST_STDOUT="$stdout_file"
  LAST_STDERR="$stderr_file"
}

run_and_capture_in_dir() {
  local run_dir="$1"
  shift

  local stdout_file stderr_file
  stdout_file="$TEST_WORKDIR/stdout.txt"
  stderr_file="$TEST_WORKDIR/stderr.txt"

  set +e
  (
    cd "$run_dir" || exit 1
    "$@"
  ) >"$stdout_file" 2>"$stderr_file"
  LAST_EXIT_CODE=$?
  set -e

  LAST_STDOUT="$stdout_file"
  LAST_STDERR="$stderr_file"
}

setup_workspace() {
  cleanup
  TEST_WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/nmc-memory-contracts.XXXXXX")"
  TEST_MEMORY_ROOT="$TEST_WORKDIR/workspace-memory"

  mkdir -p "$TEST_MEMORY_ROOT"
  cp -R "$WORKSPACE_FIXTURE/." "$TEST_MEMORY_ROOT/"

  git -C "$TEST_MEMORY_ROOT" init >/dev/null 2>&1
  git -C "$TEST_MEMORY_ROOT" config user.name "Contract Test"
  git -C "$TEST_MEMORY_ROOT" config user.email "contract@example.com"
  git -C "$TEST_MEMORY_ROOT" add .
  git -C "$TEST_MEMORY_ROOT" commit -m "test: seed workspace" >/dev/null 2>&1
}

assert_file_matches() {
  local expected_file="$1"
  local actual_file="$2"
  local description="$3"
  local diff_file

  diff_file="$(mktemp "${TMPDIR:-/tmp}/nmc-memory-diff.XXXXXX")"
  if cmp -s "$expected_file" "$actual_file"; then
    pass "$description"
    rm -f "$diff_file"
    return 0
  fi

  diff -u "$expected_file" "$actual_file" >"$diff_file" || true
  fail "$description" "$(sed -n '1,80p' "$diff_file")"
  rm -f "$diff_file"
  return 0
}

test_fixture_tree_frozen() {
  local actual_file

  print_case "TEST" "fixture workspace tree matches the frozen golden listing"
  actual_file="$(mktemp "${TMPDIR:-/tmp}/nmc-memory-tree.XXXXXX")"
  find "$WORKSPACE_FIXTURE" -type f | sort | sed "s#^$WORKSPACE_FIXTURE/##" >"$actual_file"
  assert_file_matches "$GOLDEN_ROOT/fixture-tree.txt" "$actual_file" "fixture workspace tree"
  rm -f "$actual_file"
}

test_canonical_fixture_checksums_frozen() {
  local actual_file

  print_case "TEST" "canonical markdown fixture files match frozen checksums"
  actual_file="$(mktemp "${TMPDIR:-/tmp}/nmc-memory-checksums.XXXXXX")"

  python3 - "$WORKSPACE_FIXTURE" >"$actual_file" <<'PY'
import hashlib
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
for path in sorted((root / "core").rglob("*.md")):
    rel = path.relative_to(root).as_posix()
    print(f"{rel}\t{hashlib.sha256(path.read_bytes()).hexdigest()}")
PY

  assert_file_matches "$GOLDEN_ROOT/canonical-file-checksums.txt" "$actual_file" "canonical file checksums"
  rm -f "$actual_file"
}

test_legacy_curate_batch_frozen() {
  local actual_file batch_file

  print_case "TEST" "legacy curated intake batch stays frozen and structurally explicit"
  batch_file="$WORKSPACE_FIXTURE/intake/pending/2026-03-05.md"
  actual_file="$(mktemp "${TMPDIR:-/tmp}/nmc-memory-curate-checksum.XXXXXX")"
  printf 'intake/pending/2026-03-05.md\t%s\n' "$(sha256_file "$batch_file")" >"$actual_file"
  assert_file_matches "$GOLDEN_ROOT/legacy-curate-batch-checksums.txt" "$actual_file" "legacy curate batch checksum"
  rm -f "$actual_file"

  if python3 - "$batch_file" <<'PY'
import pathlib
import re
import sys

text = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
matches = list(re.finditer(r"^## (claim-[0-9-]+)\n(.*?)(?=^## |\Z)", text, re.M | re.S))
expected_order = [
    "source_session",
    "source_agent",
    "observed_at",
    "confidence",
    "tags",
    "target_layer",
    "target_domain",
    "claim",
    "curator_decision",
    "curator_notes",
]

if len(matches) != 6:
    raise SystemExit(f"expected 6 claims, found {len(matches)}")

for match in matches:
    claim_id, body = match.group(1), match.group(2)
    keys = re.findall(r"^- ([a-z_]+):", body, re.M)
    if keys != expected_order:
        raise SystemExit(f"{claim_id} keys mismatch: {keys}")
PY
  then
    pass "legacy curate claim contract"
  else
    fail "legacy curate claim contract" "Curated claim blocks no longer match the frozen legacy key order"
  fi
}

test_record_envelope_contract() {
  print_case "TEST" "canonical record envelopes expose the required legacy fields"

  if python3 - "$WORKSPACE_FIXTURE" <<'PY'
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
required = {
    "record_id",
    "type",
    "summary",
    "evidence",
    "confidence",
    "status",
    "updated_at",
    "links",
}
record_count = 0

for subdir in ("core/user", "core/agents"):
    for path in sorted((root / subdir).rglob("*.md")):
        text = path.read_text(encoding="utf-8")
        pattern = re.compile(r'^<a id="([^"]+)"></a>\n### ([^\n]+)\n---\n(.*?)\n---\n', re.M | re.S)
        for anchor_id, heading_id, yaml_block in pattern.findall(text):
            record_count += 1
            keys = set(re.findall(r"^([a-z_]+):", yaml_block, re.M))
            missing = sorted(required - keys)
            if missing:
                raise SystemExit(f"{path.relative_to(root)} missing fields for {heading_id}: {', '.join(missing)}")
            record_id_match = re.search(r"^record_id:\s*\"?([^\n\"]+)\"?\s*$", yaml_block, re.M)
            if not record_id_match:
                raise SystemExit(f"{path.relative_to(root)} missing record_id value for {heading_id}")
            record_id = record_id_match.group(1)
            if anchor_id != record_id or heading_id != record_id:
                raise SystemExit(
                    f"{path.relative_to(root)} anchor/heading mismatch: anchor={anchor_id}, heading={heading_id}, record_id={record_id}"
                )

if record_count != 6:
    raise SystemExit(f"expected 6 canonical records, found {record_count}")
PY
  then
    pass "canonical record envelope fields"
  else
    fail "canonical record envelope fields" "One or more canonical record blocks no longer satisfy the frozen envelope contract"
  fi
}

test_shared_contracts_package_fixture_validation() {
  print_case "TEST" "@nmc/memory-contracts validates fixture record envelopes"

  if ! require_file "$CONTRACT_FIXTURE_TEST" "shared contracts package fixture test"; then
    return
  fi

  cleanup
  TEST_WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/nmc-memory-contracts-test.XXXXXX")"
  run_and_capture node "$CONTRACT_FIXTURE_TEST"
  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "shared contracts fixture validation" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if grep -q "Validated 6 fixture record envelopes through @nmc/memory-contracts." "$LAST_STDOUT"; then
    pass "shared contracts fixture validation"
  else
    fail "shared contracts fixture validation" "Fixture validation output did not confirm the expected record count"
  fi
}

test_shared_ingest_package_fixture_validation() {
  print_case "TEST" "@nmc/memory-ingest validates transcript and claim fixtures"

  if ! require_file "$INGEST_FIXTURE_TEST" "shared ingest package fixture test"; then
    return
  fi

  cleanup
  TEST_WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/nmc-memory-ingest-test.XXXXXX")"
  run_and_capture node "$INGEST_FIXTURE_TEST"
  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "shared ingest fixture validation" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if grep -q "Validated 16 fixture transcript events and 6 claim envelopes through @nmc/memory-ingest." "$LAST_STDOUT"; then
    pass "shared ingest fixture validation"
  else
    fail "shared ingest fixture validation" "Fixture validation output did not confirm the expected ingest counts"
  fi
}

test_shared_canon_package_fixture_validation() {
  print_case "TEST" "@nmc/memory-canon validates fixture canon and derived metadata"

  if ! require_file "$CANON_FIXTURE_TEST" "shared canon package fixture test"; then
    return
  fi

  cleanup
  TEST_WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/nmc-memory-canon-test.XXXXXX")"
  run_and_capture node "$CANON_FIXTURE_TEST"
  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "shared canon fixture validation" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if grep -q "Validated 6 canonical record fixtures and rebuilt 6 graph edges through @nmc/memory-canon." "$LAST_STDOUT"; then
    pass "shared canon fixture validation"
  else
    fail "shared canon fixture validation" "Fixture validation output did not confirm the expected canon counts"
  fi
}

test_shared_maintainer_package_fixture_validation() {
  print_case "TEST" "@nmc/memory-maintainer validates task and contract fixtures"

  if ! require_file "$MAINTAINER_FIXTURE_TEST" "shared maintainer package fixture test"; then
    return
  fi

  cleanup
  TEST_WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/nmc-memory-maintainer-test.XXXXXX")"
  run_and_capture node "$MAINTAINER_FIXTURE_TEST"
  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "shared maintainer fixture validation" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if grep -q "@nmc/memory-maintainer" "$LAST_STDOUT"; then
    pass "shared maintainer fixture validation"
  else
    fail "shared maintainer fixture validation" "Fixture validation output did not confirm maintainer package execution"
  fi
}

test_shared_scripts_package_fixture_validation() {
  print_case "TEST" "@nmc/memory-scripts validates deterministic helper script fixtures"

  if ! require_file "$SCRIPTS_FIXTURE_TEST" "shared scripts package fixture test"; then
    return
  fi

  cleanup
  TEST_WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/nmc-memory-scripts-test.XXXXXX")"
  run_and_capture node "$SCRIPTS_FIXTURE_TEST"
  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "shared scripts fixture validation" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if grep -q "@nmc/memory-scripts" "$LAST_STDOUT"; then
    pass "shared scripts fixture validation"
  else
    fail "shared scripts fixture validation" "Fixture validation output did not confirm scripts package execution"
  fi
}

test_verify_contracts() {
  local manifest_file edges_file actual_schema

  print_case "TEST" "verify.sh freezes manifest schema, canonical checksums, and edge export shape"
  setup_workspace

  run_and_capture "$VERIFY_SCRIPT" "$TEST_MEMORY_ROOT"
  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "verify.sh clean exit code" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  manifest_file="$TEST_MEMORY_ROOT/core/meta/manifest.json"
  edges_file="$TEST_MEMORY_ROOT/core/meta/graph/edges.jsonl"

  if ! require_file "$manifest_file" "verify manifest output"; then
    return
  fi

  if ! require_file "$edges_file" "verify edges output"; then
    return
  fi

  actual_schema="$(mktemp "${TMPDIR:-/tmp}/nmc-memory-manifest-schema.XXXXXX")"
  if python3 - "$manifest_file" "$GOLDEN_ROOT/canonical-file-checksums.txt" >"$actual_schema" <<'PY'
import json
import pathlib
import re
import sys

manifest_path = pathlib.Path(sys.argv[1])
checksums_path = pathlib.Path(sys.argv[2])
data = json.loads(manifest_path.read_text(encoding="utf-8"))

expected_counts = {
    "events": 2,
    "facts": 2,
    "states": 1,
    "identities": 0,
    "competences": 1,
}
if data.get("record_counts") != expected_counts:
    raise SystemExit(f"unexpected record counts: {data.get('record_counts')}")

if data.get("schema_version") != "1.0":
    raise SystemExit(f"unexpected schema_version: {data.get('schema_version')}")

if data.get("edges_count") != 6:
    raise SystemExit(f"unexpected edges_count: {data.get('edges_count')}")

last_updated = data.get("last_updated")
if not isinstance(last_updated, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", last_updated):
    raise SystemExit(f"unexpected last_updated: {last_updated!r}")

expected_checksums = {}
for line in checksums_path.read_text(encoding="utf-8").splitlines():
    rel_path, checksum = line.split("\t")
    expected_checksums[rel_path] = checksum

if data.get("checksums") != expected_checksums:
    raise SystemExit("manifest checksums do not match frozen canonical checksums")

entries = [
    "schema_version\tstring",
    "last_updated\tstring",
    "record_counts\tobject",
    "record_counts.events\tnumber",
    "record_counts.facts\tnumber",
    "record_counts.states\tnumber",
    "record_counts.identities\tnumber",
    "record_counts.competences\tnumber",
    "checksums\tobject",
    "edges_count\tnumber",
]
print("\n".join(entries))
PY
  then
    assert_file_matches "$GOLDEN_ROOT/manifest-schema.txt" "$actual_schema" "manifest schema and checksum contract"
  else
    fail "manifest schema and checksum contract" "verify.sh no longer writes the frozen manifest contract"
    rm -f "$actual_schema"
    return
  fi
  rm -f "$actual_schema"

  if python3 - "$edges_file" <<'PY'
import json
import pathlib
import sys

lines = [line for line in pathlib.Path(sys.argv[1]).read_text(encoding="utf-8").splitlines() if line.strip()]
if len(lines) != 6:
    raise SystemExit(f"expected 6 edges, found {len(lines)}")

for line in lines:
    payload = json.loads(line)
    if set(payload.keys()) != {"batch", "src", "rel", "dst", "at"}:
      raise SystemExit(f"unexpected edge keys: {sorted(payload.keys())}")
    if any(not isinstance(payload[key], str) for key in ("batch", "src", "rel", "dst", "at")):
      raise SystemExit(f"non-string edge payload: {payload}")
PY
  then
    pass "verify edges export shape"
  else
    fail "verify edges export shape" "edges.jsonl no longer matches the frozen JSONL contract"
  fi
}

test_status_output_contract() {
  print_case "TEST" "status.sh keeps section order and manifest count lines stable"

  run_and_capture "$STATUS_SCRIPT" "$TEST_MEMORY_ROOT"
  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "status.sh exit code" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if python3 - "$LAST_STDOUT" <<'PY'
import pathlib
import sys

lines = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8").splitlines()
required_headers = [
    "Memory Status Report",
    "== Manifest ==",
    "== Intake Backlog ==",
    "== Retention ==",
    "== Overall ==",
]
positions = []
for header in required_headers:
    positions.append(lines.index(header))
if positions != sorted(positions):
    raise SystemExit(f"headers out of order: {positions}")

required_lines = {
    "Schema version: 1.0",
    "Events: 2",
    "Facts: 2",
    "States: 1",
    "Identities: 0",
    "Competences: 1",
    "Pending files: 1",
}
missing = sorted(line for line in required_lines if line not in lines)
if missing:
    raise SystemExit(f"missing lines: {missing}")
PY
  then
    pass "status output sections and counts"
  else
    fail "status output sections and counts" "status.sh output drifted from the frozen contract"
  fi
}

test_pipeline_dry_run_contract() {
  print_case "TEST" "pipeline.sh dry-run keeps the legacy missing-OpenClaw contract"

  run_and_capture_in_dir "$TEST_MEMORY_ROOT" env OPENCLAW_BIN=definitely-missing-openclaw "$PIPELINE_SCRIPT" 2026-03-05
  if [ "$LAST_EXIT_CODE" -ne 2 ]; then
    fail "pipeline dry-run exit code" "Expected 2, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if python3 - "$LAST_STDOUT" "$VERIFY_SCRIPT" "$TEST_MEMORY_ROOT" <<'PY'
import pathlib
import sys

import os

output_path = pathlib.Path(sys.argv[1])
verify_script = sys.argv[2]
memory_root = os.path.normpath(sys.argv[3])
text = output_path.read_text(encoding="utf-8")

required_fragments = [
    "OpenClaw CLI not found; printing the commands that would be run.",
    "would run: definitely-missing-openclaw skill run memory-extract --date 2026-03-05",
    "would run: definitely-missing-openclaw skill run memory-curate --date 2026-03-05",
    "would run: definitely-missing-openclaw skill run memory-apply --date 2026-03-05",
    f"would run: {verify_script} {memory_root}",
    "Pipeline Summary",
    "Date: 2026-03-05",
    "Requested phases: extract, curate, apply, verify",
    "Ran phases: none",
    "Succeeded phases: none",
    "Failed phase: none",
    "  extract: pending",
    "  curate: pending",
    "  apply: pending",
    "  verify: pending",
]

missing = [fragment for fragment in required_fragments if fragment not in text]
if missing:
    raise SystemExit(f"missing fragments: {missing}")
PY
  then
    pass "pipeline dry-run output contract"
  else
    fail "pipeline dry-run output contract" "pipeline.sh dry-run output drifted from the frozen legacy contract"
  fi
}

test_onboard_contract() {
  print_case "TEST" "onboard.sh keeps the new-role slice and duplicate exit-code contracts"
  setup_workspace

  run_and_capture_in_dir "$TEST_MEMORY_ROOT" "$ONBOARD_SCRIPT" analyst
  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "onboard success exit code" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if python3 - "$TEST_MEMORY_ROOT/core/agents/analyst" "$TEST_MEMORY_ROOT/core/agents/_index.md" <<'PY'
import pathlib
import re
import sys

agent_dir = pathlib.Path(sys.argv[1])
index_file = pathlib.Path(sys.argv[2])
expected_files = ["COURSE.md", "DECISIONS.md", "PITFALLS.md", "PLAYBOOK.md"]
actual_files = sorted(path.name for path in agent_dir.glob("*.md"))
if actual_files != expected_files:
    raise SystemExit(f"unexpected files: {actual_files}")

expected_types = {
    "COURSE.md": "course",
    "DECISIONS.md": "decisions",
    "PITFALLS.md": "pitfalls",
    "PLAYBOOK.md": "playbook",
}

for file_name in expected_files:
    text = (agent_dir / file_name).read_text(encoding="utf-8")
    for required in [
        "role: analyst",
        f'type: {expected_types[file_name]}',
        'schema_version: "1.0"',
        'updated_at: "',
    ]:
        if required not in text:
            raise SystemExit(f"{file_name} missing {required!r}")

index_text = index_file.read_text(encoding="utf-8")
if "| analyst | agents/analyst/ | active |" not in index_text:
    raise SystemExit("analyst row missing from _index.md")
PY
  then
    pass "onboard new role slice"
  else
    fail "onboard new role slice" "onboard.sh no longer generates the frozen analyst role slice"
  fi

  run_and_capture_in_dir "$TEST_MEMORY_ROOT" "$ONBOARD_SCRIPT" analyst
  if [ "$LAST_EXIT_CODE" -ne 1 ]; then
    fail "onboard duplicate exit code" "Expected 1, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if grep -Fq 'error: agent role already exists: analyst' "$LAST_STDERR"; then
    pass "onboard duplicate exit contract"
  else
    fail "onboard duplicate exit contract" "Expected duplicate-role error message not found"
  fi
}

test_verify_dangling_edge_contract() {
  local work_file manifest_file edges_file before_lines

  print_case "TEST" "verify.sh preserves edge exports when dangling links appear"
  setup_workspace
  run_and_capture "$VERIFY_SCRIPT" "$TEST_MEMORY_ROOT"
  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "verify prerequisite exit code" "Expected 0, got $LAST_EXIT_CODE"
    return
  fi

  work_file="$TEST_MEMORY_ROOT/core/user/knowledge/work.md"
  manifest_file="$TEST_MEMORY_ROOT/core/meta/manifest.json"
  edges_file="$TEST_MEMORY_ROOT/core/meta/graph/edges.jsonl"
  before_lines="$(awk 'NF { count++ } END { print count + 0 }' "$edges_file")"

  cat >>"$work_file" <<'EOF'

<a id="fct-2026-03-05-099"></a>
### fct-2026-03-05-099
---
record_id: fct-2026-03-05-099
type: fact
summary: "Fixture record with a dangling relation for warning-path coverage."
evidence:
  - "intake/pending/2026-03-05.md#claim-20260305-001"
confidence: medium
status: active
updated_at: "2026-03-05T12:30:00Z"
links:
  - rel: supports
    target: "fct-2099-01-01-999"
---
This record intentionally points at a non-existent target to exercise dangling-edge handling.
EOF

  python3 - "$work_file" <<'PY'
import os
import sys
import time

path = sys.argv[1]
future = time.time() + 2
os.utime(path, (future, future))
PY

  run_and_capture "$VERIFY_SCRIPT" "$TEST_MEMORY_ROOT"
  if [ "$LAST_EXIT_CODE" -ne 1 ]; then
    fail "verify dangling-edge exit code" "Expected 1, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if grep -Fq 'warning: skipping dangling edge: fct-2026-03-05-099 -> supports -> fct-2099-01-01-999' "$LAST_STDERR" && \
     [ "$(awk 'NF { count++ } END { print count + 0 }' "$edges_file")" = "$before_lines" ] && \
     python3 - "$manifest_file" "$before_lines" <<'PY'
import json
import pathlib
import sys

manifest = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
before_lines = int(sys.argv[2])
if manifest.get("edges_count") != before_lines:
    raise SystemExit(f"unexpected edges_count: {manifest.get('edges_count')}")
PY
  then
    pass "verify dangling-edge warning contract"
  else
    fail "verify dangling-edge warning contract" "verify.sh no longer preserves edge exports on dangling relations"
  fi
}

test_retention_contract() {
  local commit_subject

  print_case "TEST" "retention.sh keeps the current summary and commit contract"
  setup_workspace
  run_and_capture "$VERIFY_SCRIPT" "$TEST_MEMORY_ROOT"
  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "retention prerequisite verify exit code" "Expected 0, got $LAST_EXIT_CODE"
    return
  fi

  run_and_capture "$RETENTION_SCRIPT" "$TEST_MEMORY_ROOT" --compact-edges --archive-timeline
  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "retention exit code" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if grep -Fq 'Memory Retention Summary' "$LAST_STDOUT" && \
     grep -Fq 'Edges compacted: yes' "$LAST_STDOUT" && \
     grep -Fq 'Timeline files archived (>1 year): 0' "$LAST_STDOUT"; then
    pass "retention summary contract"
  else
    fail "retention summary contract" "retention.sh summary output drifted from the frozen contract"
    return
  fi

  if grep -Fq 'Git commit: none' "$LAST_STDOUT"; then
    pass "retention git commit contract"
    return
  fi

  commit_subject="$(git -C "$TEST_MEMORY_ROOT" log -1 --pretty=%s)"
  if grep -Fq 'Git commit: memory: retention ' "$LAST_STDOUT" && \
     printf '%s' "$commit_subject" | grep -Fq 'memory: retention '; then
    pass "retention git commit contract"
  else
    fail "retention git commit contract" "Unexpected latest commit: $commit_subject"
  fi
}

main() {
  set -e

  test_fixture_tree_frozen
  test_canonical_fixture_checksums_frozen
  test_legacy_curate_batch_frozen
  test_record_envelope_contract
  test_shared_contracts_package_fixture_validation
  test_shared_ingest_package_fixture_validation
  test_shared_canon_package_fixture_validation
  test_shared_maintainer_package_fixture_validation
  test_shared_scripts_package_fixture_validation
  test_verify_contracts
  test_status_output_contract
  test_pipeline_dry_run_contract
  test_onboard_contract
  test_verify_dangling_edge_contract
  test_retention_contract

  printf '\nContract tests complete: %s passed, %s failed\n' "$PASS_COUNT" "$FAIL_COUNT"

  if [ "$FAIL_COUNT" -ne 0 ]; then
    exit 1
  fi
}

main "$@"

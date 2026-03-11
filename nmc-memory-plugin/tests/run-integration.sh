#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FIXTURES_ROOT="$SCRIPT_DIR/fixtures"
WORKSPACE_FIXTURE="$FIXTURES_ROOT/workspace"
MANIFEST_FILE="$PLUGIN_ROOT/openclaw.plugin.json"
PACKAGE_FILE="$PLUGIN_ROOT/package.json"
ENTRY_FILE="$PLUGIN_ROOT/index.js"
VERIFY_SCRIPT="$PLUGIN_ROOT/skills/memory-verify/verify.sh"
STATUS_SCRIPT="$PLUGIN_ROOT/skills/memory-status/status.sh"
ONBOARD_SCRIPT="$PLUGIN_ROOT/skills/memory-onboard-agent/onboard.sh"
PIPELINE_SCRIPT="$PLUGIN_ROOT/skills/memory-pipeline/pipeline.sh"
RETENTION_SCRIPT="$PLUGIN_ROOT/skills/memory-retention/retention.sh"
TEMPLATE_ROOT="$PLUGIN_ROOT/templates/workspace-memory"
SETUP_SCRIPT="$PLUGIN_ROOT/scripts/setup-openclaw.js"

PASS_COUNT=0
FAIL_COUNT=0
TEST_WORKDIR=""
TEST_MEMORY_ROOT=""
LAST_STDOUT=""
LAST_STDERR=""
LAST_EXIT_CODE=0

count_nonempty_lines() {
  awk 'NF { count++ } END { print count + 0 }' "$1"
}

cleanup() {
  if [ -n "$TEST_WORKDIR" ] && [ -d "$TEST_WORKDIR" ]; then
    rm -rf "$TEST_WORKDIR"
  fi
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
  if [ -n "$2" ]; then
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

json_query() {
  local file_path="$1"
  local expr="$2"

  python3 - "$file_path" "$expr" <<'PY'
import json
import sys

file_path, expr = sys.argv[1], sys.argv[2]
with open(file_path, 'r', encoding='utf-8') as handle:
    data = json.load(handle)

value = data
for part in expr.split('.'):
    if not part:
        continue
    if isinstance(value, list):
        value = value[int(part)]
    else:
        value = value[part]

if isinstance(value, bool):
    print('true' if value else 'false')
elif value is None:
    print('null')
else:
    print(value)
PY
}

json_length() {
  local file_path="$1"
  local expr="$2"

  python3 - "$file_path" "$expr" <<'PY'
import json
import sys

file_path, expr = sys.argv[1], sys.argv[2]
with open(file_path, 'r', encoding='utf-8') as handle:
    data = json.load(handle)

value = data
for part in expr.split('.'):
    if not part:
        continue
    if isinstance(value, list):
        value = value[int(part)]
    else:
        value = value[part]

print(len(value))
PY
}

frontmatter_value() {
  local file_path="$1"
  local key="$2"

  awk -v key="$key" '
    NR == 1 {
      if ($0 != "---") {
        exit 2
      }
      in_frontmatter = 1
      next
    }

    in_frontmatter && $0 == "---" {
      exit
    }

    in_frontmatter && $0 ~ "^" key ": " {
      line = $0
      sub("^" key ": ", "", line)
      print line
      found = 1
      exit
    }

    END {
      if (!found) {
        exit 1
      }
    }
  ' "$file_path"
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
  TEST_WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/nmc-memory-integration.XXXXXX")"
  TEST_MEMORY_ROOT="$TEST_WORKDIR/workspace-memory"

  mkdir -p "$TEST_MEMORY_ROOT"
  cp -R "$WORKSPACE_FIXTURE/." "$TEST_MEMORY_ROOT/"

  git -C "$TEST_MEMORY_ROOT" init >/dev/null 2>&1
  git -C "$TEST_MEMORY_ROOT" config user.name "Integration Test"
  git -C "$TEST_MEMORY_ROOT" config user.email "integration@example.com"
  git -C "$TEST_MEMORY_ROOT" add .
  git -C "$TEST_MEMORY_ROOT" commit -m "test: seed workspace" >/dev/null 2>&1
}

test_packaging_files() {
  print_case "TEST" "OpenClaw packaging files are present and internally consistent"

  if ! require_file "$MANIFEST_FILE" "openclaw manifest file"; then
    return
  fi

  if ! require_file "$PACKAGE_FILE" "package.json file"; then
    return
  fi

  if ! require_file "$ENTRY_FILE" "runtime entrypoint file"; then
    return
  fi

  if [ "$(json_query "$MANIFEST_FILE" 'id')" = "nmc-memory-plugin" ] && \
     [ "$(json_query "$MANIFEST_FILE" 'configSchema.type')" = "object" ] && \
     [ "$(json_query "$MANIFEST_FILE" 'skills.0')" = "skills" ]; then
    pass "openclaw.plugin.json required fields"
  else
    fail "openclaw.plugin.json required fields" "Unexpected manifest contents: $(cat "$MANIFEST_FILE")"
  fi

  if [ "$(json_query "$PACKAGE_FILE" 'name')" = "nmc-memory-plugin" ] && \
     [ "$(json_query "$PACKAGE_FILE" 'main')" = "./index.js" ] && \
     [ "$(json_query "$PACKAGE_FILE" 'openclaw.extensions.0')" = "./index.js" ]; then
    pass "package.json OpenClaw entrypoints"
  else
    fail "package.json OpenClaw entrypoints" "Unexpected package.json contents: $(cat "$PACKAGE_FILE")"
  fi
}

test_skill_frontmatter() {
  local file skill_dir skill_name actual_name description

  print_case "TEST" "Bundled skills expose AgentSkills frontmatter"

  for file in "$PLUGIN_ROOT"/skills/*/SKILL.md; do
    skill_dir="$(dirname "$file")"
    skill_name="$(basename "$skill_dir")"

    actual_name="$(frontmatter_value "$file" 'name' 2>/dev/null)"
    description="$(frontmatter_value "$file" 'description' 2>/dev/null)"

    if [ "$actual_name" != "$skill_name" ]; then
      fail "skill frontmatter name for $skill_name" "Expected $skill_name, got ${actual_name:-missing}"
      return
    fi

    if [ -z "$description" ]; then
      fail "skill frontmatter description for $skill_name" "Missing or empty description in $file"
      return
    fi
  done

  pass "all bundled skills include name and description frontmatter"
}

test_template_default_agents() {
  local agents_root index_file role file frontmatter_role

  agents_root="$TEMPLATE_ROOT/core/agents"
  index_file="$agents_root/_index.md"

  print_case "TEST" "Template ships the predefined agent team"

  if ! require_file "$index_file" "template agent registry"; then
    return
  fi

  if [ -d "$agents_root/memory-curator" ]; then
    fail "stale template memory-curator directory" "Expected legacy template role to be removed"
    return
  fi

  for role in nyx medea arx lev mnemo; do
    if ! require_dir "$agents_root/$role" "template agent directory for $role"; then
      return
    fi

    for file in COURSE.md PLAYBOOK.md PITFALLS.md DECISIONS.md; do
      if ! require_file "$agents_root/$role/$file" "template file $file for $role"; then
        return
      fi

      frontmatter_role="$(frontmatter_value "$agents_root/$role/$file" 'role' 2>/dev/null)"
      if [ "$frontmatter_role" = "$role" ]; then
        pass "template role frontmatter for $role/$file"
      else
        fail "template role frontmatter for $role/$file" "Expected role $role, got ${frontmatter_role:-missing}"
      fi
    done

    if grep -Fq "| $role | agents/$role/ | active | {{INSTALL_DATE}} |" "$index_file"; then
      pass "template registry row for $role"
    else
      fail "template registry row for $role" "Missing registry row in $index_file"
    fi
  done

  if grep -Fq 'single_writer: "mnemo"' "$TEMPLATE_ROOT/core/system/CANON.md"; then
    pass "template canon single writer"
  else
    fail "template canon single writer" "Expected single_writer mnemo in template CANON"
  fi
}

test_openclaw_setup() {
  local state_dir workspace_root config_path alt_workspace_root alt_memory_root today agent file

  state_dir="$TEST_WORKDIR/openclaw-state"
  workspace_root="$state_dir/workspace"
  config_path="$state_dir/openclaw.json"
  alt_workspace_root="$state_dir/alt-workspace"
  alt_memory_root="$state_dir/shared-canon"
  today="$(date -u +%F)"

  print_case "TEST" "setup-openclaw scaffolds agent workspaces and config idempotently"
  mkdir -p "$state_dir"

  cat > "$config_path" <<'EOF'
{
  // Existing user config should survive setup.
  "custom": {
    "url": "https://example.com/path"
  },
  "bindings": []
}
EOF

  run_and_capture node "$SETUP_SCRIPT" \
    --state-dir "$state_dir" \
    --workspace-root "$workspace_root" \
    --config-path "$config_path" \
    --bind "nyx=telegram:primary"

  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "setup-openclaw exit code" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if ! require_dir "$workspace_root/memory" "setup-openclaw created shared memory root"; then
    return
  fi

  for agent in nyx medea arx lev mnemo; do
    if ! require_dir "$workspace_root/$agent" "setup-openclaw workspace for $agent"; then
      return
    fi

    for file in AGENTS.md SOUL.md USER.md IDENTITY.md TOOLS.md HEARTBEAT.md BOOTSTRAP.md BOOT.md MEMORY.md "memory/$today.md"; do
      if ! require_file "$workspace_root/$agent/$file" "setup-openclaw file $file for $agent"; then
        return
      fi
    done

    if grep -Fq '../memory' "$workspace_root/$agent/AGENTS.md" && \
       grep -Fq "../memory/core/agents/$agent/" "$workspace_root/$agent/AGENTS.md"; then
      pass "setup-openclaw canon wiring for $agent"
    else
      fail "setup-openclaw canon wiring for $agent" "Expected shared memory references in $workspace_root/$agent/AGENTS.md"
    fi
  done

  if ! require_file "$config_path" "setup-openclaw config file"; then
    return
  fi

  if [ "$(json_length "$config_path" 'agents.list')" = "5" ]; then
    pass "setup-openclaw agent count"
  else
    fail "setup-openclaw agent count" "Expected 5 agents, found $(json_length "$config_path" 'agents.list')"
  fi

  if [ "$(json_query "$config_path" 'custom.url')" = "https://example.com/path" ]; then
    pass "setup-openclaw preserves existing config keys"
  else
    fail "setup-openclaw preserves existing config keys" "Expected custom.url to survive config merge"
  fi

  if [ "$(json_query "$config_path" 'agents.list.0.id')" = "nyx" ] && \
     [ "$(json_query "$config_path" 'agents.list.0.default')" = "true" ] && \
     [ "$(json_query "$config_path" 'agents.list.4.id')" = "mnemo" ]; then
    pass "setup-openclaw agent ordering and default"
  else
    fail "setup-openclaw agent ordering and default" "Unexpected agent list ordering: $(cat "$config_path")"
  fi

  if [ "$(json_query "$config_path" 'agents.list.3.heartbeat.target')" = "none" ] && \
     [ "$(json_query "$config_path" 'agents.list.3.heartbeat.every')" = "30m" ]; then
    pass "setup-openclaw lev heartbeat config"
  else
    fail "setup-openclaw lev heartbeat config" "Lev heartbeat config missing in openclaw.json"
  fi

  if [ "$(json_length "$config_path" 'bindings')" = "1" ] && \
     [ "$(json_query "$config_path" 'bindings.0.agentId')" = "nyx" ] && \
     [ "$(json_query "$config_path" 'bindings.0.match.channel')" = "telegram" ] && \
     [ "$(json_query "$config_path" 'bindings.0.match.accountId')" = "primary" ]; then
    pass "setup-openclaw bindings"
  else
    fail "setup-openclaw bindings" "Unexpected bindings in $config_path"
  fi

  printf 'LOCAL_NOTE\n' >> "$workspace_root/nyx/MEMORY.md"
  run_and_capture node "$SETUP_SCRIPT" \
    --state-dir "$state_dir" \
    --workspace-root "$workspace_root" \
    --config-path "$config_path" \
    --bind "nyx=telegram:primary"

  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "setup-openclaw idempotent exit code" "Expected 0, got $LAST_EXIT_CODE"
    return
  fi

  if grep -Fq 'LOCAL_NOTE' "$workspace_root/nyx/MEMORY.md"; then
    pass "setup-openclaw preserves existing files by default"
  else
    fail "setup-openclaw preserves existing files by default" "Expected LOCAL_NOTE to survive rerun"
  fi

  if [ "$(json_length "$config_path" 'agents.list')" = "5" ] && \
     [ "$(json_length "$config_path" 'bindings')" = "1" ]; then
    pass "setup-openclaw idempotent config merge"
  else
    fail "setup-openclaw idempotent config merge" "Expected stable counts after rerun"
  fi

  run_and_capture node "$SETUP_SCRIPT" \
    --state-dir "$state_dir" \
    --workspace-root "$alt_workspace_root" \
    --memory-root "$alt_memory_root" \
    --config-path "$config_path"

  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "setup-openclaw alternate roots exit code" "Expected 0, got $LAST_EXIT_CODE"
    return
  fi

  if grep -Fq '../shared-canon' "$alt_workspace_root/nyx/AGENTS.md" && \
     grep -Fq '../shared-canon/core/agents/nyx/' "$alt_workspace_root/nyx/AGENTS.md"; then
    pass "setup-openclaw custom memory root wiring"
  else
    fail "setup-openclaw custom memory root wiring" "Expected alternate memory root references in generated AGENTS.md"
  fi

  if python3 - "$config_path" "$alt_workspace_root/nyx" "$state_dir/agents/nyx/agent" <<'PY'
import json
import os
import sys

config_path, expected_workspace, expected_agent_dir = sys.argv[1:4]
with open(config_path, 'r', encoding='utf-8') as handle:
    data = json.load(handle)

expected_workspace = os.path.normpath(expected_workspace)
expected_agent_dir = os.path.normpath(expected_agent_dir)

for agent in data.get('agents', {}).get('list', []):
    if agent.get('id') != 'nyx':
        continue
    ok = (
        os.path.normpath(agent.get('workspace', '')) == expected_workspace
        and os.path.normpath(agent.get('agentDir', '')) == expected_agent_dir
    )
    sys.exit(0 if ok else 1)

sys.exit(1)
PY
  then
    pass "setup-openclaw updates generated config paths"
  else
    fail "setup-openclaw updates generated config paths" "Expected regenerated workspace/agentDir paths in config"
  fi
}

test_verify_success() {
  local manifest_file edges_file commit_subject
  manifest_file="$TEST_MEMORY_ROOT/core/meta/manifest.json"
  edges_file="$TEST_MEMORY_ROOT/core/meta/graph/edges.jsonl"

  print_case "TEST" "verify.sh succeeds and writes derived metadata"
  run_and_capture "$VERIFY_SCRIPT" "$TEST_MEMORY_ROOT"

  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "verify.sh success exit code" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if ! require_file "$manifest_file" "verify.sh manifest output"; then
    return
  fi

  if ! require_file "$edges_file" "verify.sh edges output"; then
    return
  fi

  if [ "$(json_query "$manifest_file" 'record_counts.events')" = "2" ] && \
     [ "$(json_query "$manifest_file" 'record_counts.facts')" = "2" ] && \
     [ "$(json_query "$manifest_file" 'record_counts.states')" = "1" ] && \
     [ "$(json_query "$manifest_file" 'record_counts.identities')" = "0" ] && \
     [ "$(json_query "$manifest_file" 'record_counts.competences')" = "1" ] && \
     [ "$(json_query "$manifest_file" 'edges_count')" = "6" ]; then
    pass "verify.sh manifest counts"
  else
    fail "verify.sh manifest counts" "Unexpected manifest contents: $(cat "$manifest_file")"
  fi

  if [ "$(count_nonempty_lines "$edges_file")" = "6" ] && \
     grep -Fq '"src":"evt-2026-03-05-001","rel":"caused","dst":"st-2026-03-05-001"' "$edges_file" && \
     grep -Fq '"src":"fct-2026-03-05-002","rel":"derived_from","dst":"evt-2026-03-05-002"' "$edges_file"; then
    pass "verify.sh edge extraction"
  else
    fail "verify.sh edge extraction" "edges.jsonl contents were not as expected"
  fi

  commit_subject="$(git -C "$TEST_MEMORY_ROOT" log -1 --pretty=%s)"
  if printf '%s' "$commit_subject" | grep -Fq 'memory: manifest update'; then
    pass "verify.sh git commit"
  else
    fail "verify.sh git commit" "Unexpected latest commit: $commit_subject"
  fi
}

test_status_output() {
  print_case "TEST" "status.sh reports manifest and backlog sections"
  run_and_capture "$STATUS_SCRIPT" "$TEST_MEMORY_ROOT"

  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "status.sh exit code" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if grep -Fq 'Memory Status Report' "$LAST_STDOUT" && \
     grep -Fq '== Manifest ==' "$LAST_STDOUT" && \
     grep -Fq '== Intake Backlog ==' "$LAST_STDOUT" && \
     grep -Fq '== Retention ==' "$LAST_STDOUT" && \
     grep -Fq '== Overall ==' "$LAST_STDOUT"; then
    pass "status.sh section headers"
  else
    fail "status.sh section headers" "Missing expected section header in output"
  fi

  if grep -Fq 'Events: 2' "$LAST_STDOUT" && \
     grep -Fq 'Facts: 2' "$LAST_STDOUT" && \
     grep -Fq 'States: 1' "$LAST_STDOUT" && \
     grep -Fq 'Identities: 0' "$LAST_STDOUT" && \
     grep -Fq 'Competences: 1' "$LAST_STDOUT"; then
    pass "status.sh record counts"
  else
    fail "status.sh record counts" "Unexpected status output: $(cat "$LAST_STDOUT")"
  fi
}

test_pipeline_dry_run() {
  print_case "TEST" "pipeline.sh reports OpenClaw setup gaps without mutating the workspace"
  run_and_capture_in_dir "$TEST_MEMORY_ROOT" env OPENCLAW_BIN=/definitely/missing "$PIPELINE_SCRIPT" "2026-03-05"

  if [ "$LAST_EXIT_CODE" -ne 2 ]; then
    fail "pipeline.sh dry-run exit code" "Expected 2, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if grep -Fq 'OpenClaw CLI not found; printing the commands that would be run.' "$LAST_STDOUT" && \
     grep -Fq 'would run: /definitely/missing skill run memory-extract --date 2026-03-05' "$LAST_STDOUT" && \
     grep -Fq 'Pipeline Summary' "$LAST_STDOUT"; then
    pass "pipeline.sh dry-run output"
  else
    fail "pipeline.sh dry-run output" "Unexpected pipeline output: $(cat "$LAST_STDOUT")"
  fi
}

test_retention_success() {
  local commit_subject

  print_case "TEST" "retention.sh compacts derived edges and records a maintenance commit"
  run_and_capture "$RETENTION_SCRIPT" "$TEST_MEMORY_ROOT" --compact-edges --archive-timeline

  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "retention.sh exit code" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if grep -Fq 'Memory Retention Summary' "$LAST_STDOUT" && \
     grep -Fq 'Edges compacted: yes' "$LAST_STDOUT" && \
     grep -Fq 'Timeline files archived (>1 year): 0' "$LAST_STDOUT"; then
    pass "retention.sh summary output"
  else
    fail "retention.sh summary output" "Unexpected retention output: $(cat "$LAST_STDOUT")"
  fi

  if grep -Fq 'Git commit: none' "$LAST_STDOUT"; then
    pass "retention.sh no-op commit handling"
    return
  fi

  commit_subject="$(git -C "$TEST_MEMORY_ROOT" log -1 --pretty=%s)"
  if grep -Fq 'Git commit: memory: retention ' "$LAST_STDOUT" && \
     printf '%s' "$commit_subject" | grep -Fq 'memory: retention '; then
    pass "retention.sh git commit"
  else
    fail "retention.sh git commit" "Unexpected latest commit: $commit_subject"
  fi
}

test_onboard_success() {
  local analyst_dir file_count
  analyst_dir="$TEST_MEMORY_ROOT/core/agents/analyst"

  print_case "TEST" "onboard.sh scaffolds a new analyst role"
  run_and_capture_in_dir "$TEST_MEMORY_ROOT" "$ONBOARD_SCRIPT" "analyst"

  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "onboard.sh success exit code" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if ! require_dir "$analyst_dir" "onboard.sh created analyst directory"; then
    return
  fi

  file_count="$(find "$analyst_dir" -maxdepth 1 -type f | wc -l | tr -d ' ')"
  if [ "$file_count" = "4" ]; then
    pass "onboard.sh created four agent files"
  else
    fail "onboard.sh created four agent files" "Expected 4 files, found $file_count"
  fi

  if grep -Fq '| analyst | agents/analyst/ | active |' "$TEST_MEMORY_ROOT/core/agents/_index.md"; then
    pass "onboard.sh updated agent index"
  else
    fail "onboard.sh updated agent index" "analyst row missing from core/agents/_index.md"
  fi
}

test_verify_dangling_edge() {
  local edges_file manifest_file before_lines after_lines
  edges_file="$TEST_MEMORY_ROOT/core/meta/graph/edges.jsonl"
  manifest_file="$TEST_MEMORY_ROOT/core/meta/manifest.json"

  print_case "TEST" "verify.sh warns on dangling edges and skips export"
  before_lines="$(count_nonempty_lines "$edges_file")"

  cat >> "$TEST_MEMORY_ROOT/core/user/knowledge/work.md" <<'EOF'

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

  python3 - "$TEST_MEMORY_ROOT/core/user/knowledge/work.md" <<'PY'
import os
import sys
import time

path = sys.argv[1]
future = time.time() + 2
os.utime(path, (future, future))
PY

  run_and_capture "$VERIFY_SCRIPT" "$TEST_MEMORY_ROOT"
  after_lines="$(count_nonempty_lines "$edges_file")"

  if [ "$LAST_EXIT_CODE" -eq 1 ]; then
    pass "verify.sh dangling-edge warning exit code"
  else
    fail "verify.sh dangling-edge warning exit code" "Expected 1, got $LAST_EXIT_CODE"
  fi

  if grep -Fq 'warning: skipping dangling edge: fct-2026-03-05-099 -> supports -> fct-2099-01-01-999' "$LAST_STDERR"; then
    pass "verify.sh dangling-edge warning message"
  else
    fail "verify.sh dangling-edge warning message" "Expected warning not found in stderr"
  fi

  if [ "$after_lines" = "$before_lines" ] && ! grep -Fq 'fct-2026-03-05-099' "$edges_file"; then
    pass "verify.sh skips dangling edge export"
  else
    fail "verify.sh skips dangling edge export" "Dangling edge affected edges.jsonl"
  fi

  if [ "$(json_query "$manifest_file" 'edges_count')" = "$before_lines" ]; then
    pass "verify.sh keeps edge count stable on dangling edge"
  else
    fail "verify.sh keeps edge count stable on dangling edge" "Unexpected edges_count in manifest"
  fi
}

test_onboard_duplicate() {
  print_case "TEST" "onboard.sh rejects duplicate trader role"
  run_and_capture_in_dir "$TEST_MEMORY_ROOT" "$ONBOARD_SCRIPT" "trader"

  if [ "$LAST_EXIT_CODE" -eq 1 ]; then
    pass "onboard.sh duplicate exit code"
  else
    fail "onboard.sh duplicate exit code" "Expected 1, got $LAST_EXIT_CODE"
  fi

  if grep -Fq 'error: agent role already exists: trader' "$LAST_STDERR"; then
    pass "onboard.sh duplicate detection message"
  else
    fail "onboard.sh duplicate detection message" "Expected duplicate-role message not found"
  fi
}

main() {
  set -e

  test_packaging_files
  test_skill_frontmatter
  test_template_default_agents
  setup_workspace
  test_openclaw_setup
  test_verify_success
  test_status_output
  test_pipeline_dry_run
  test_retention_success
  test_onboard_success
  test_verify_dangling_edge
  test_onboard_duplicate

  printf '\nSummary: %s passed, %s failed\n' "$PASS_COUNT" "$FAIL_COUNT"

  if [ "$FAIL_COUNT" -ne 0 ]; then
    exit 1
  fi
}

main "$@"

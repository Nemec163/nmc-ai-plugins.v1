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

resolve_executable() {
  local preferred="$1"
  shift

  if [ -n "$preferred" ] && [ -x "$preferred" ]; then
    printf '%s\n' "$preferred"
    return 0
  fi

  while [ "$#" -gt 0 ]; do
    if [ -n "$1" ] && [ -x "$1" ]; then
      printf '%s\n' "$1"
      return 0
    fi
    shift
  done

  return 1
}

resolve_node_bin() {
  local command_path
  command_path="$(command -v node 2>/dev/null || true)"
  resolve_executable "${NODE_BIN:-}" "$command_path" /usr/local/bin/node /opt/homebrew/bin/node /usr/bin/node
}

resolve_npm_bin() {
  local command_path
  command_path="$(command -v npm 2>/dev/null || true)"
  resolve_executable "${NPM_BIN:-}" "$command_path" /usr/local/bin/npm /opt/homebrew/bin/npm /usr/bin/npm
}

NODE_BIN="$(resolve_node_bin || true)"
if [ -z "$NODE_BIN" ]; then
  echo "error: node executable not found; set NODE_BIN or add node to PATH" >&2
  exit 1
fi

NPM_BIN="$(resolve_npm_bin || true)"

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

require_symlink() {
  local path="$1"
  local description="$2"

  if [ -L "$path" ]; then
    return 0
  fi

  fail "$description" "Missing symlink: $path"
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
     [ "$(json_query "$MANIFEST_FILE" 'configSchema.properties.autoSetup.default')" = "true" ] && \
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

test_packaged_artifact_install_smoke() {
  local node_bin npm_bin tool_dir artifact_root extract_root state_dir workspace_root
  local config_path package_name packaged_root packaged_setup packaged_onboard
  local packaged_pipeline packaged_memory_root packaged_control_plane_cli
  local packaged_gateway_root packaged_probe_root

  print_case "TEST" "packed nmc-memory-plugin artifact stays self-contained after extract"

  node_bin="$NODE_BIN"
  npm_bin="$NPM_BIN"
  if [ -z "$node_bin" ] || [ -z "$npm_bin" ]; then
    fail "packed artifact toolchain discovery" "Expected working node and npm executables"
    return
  fi

  tool_dir="$(dirname "$node_bin")"
  artifact_root="$TEST_WORKDIR/packed-artifact"
  extract_root="$artifact_root/extracted"
  state_dir="$artifact_root/state"
  workspace_root="$state_dir/workspace"
  config_path="$state_dir/openclaw.json"

  mkdir -p "$artifact_root" "$extract_root" "$state_dir"

  run_and_capture_in_dir "$artifact_root" env PATH="$tool_dir:$PATH" "$npm_bin" pack "$PLUGIN_ROOT" --silent
  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "packed artifact npm pack exit code" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  package_name="$(tail -n 1 "$LAST_STDOUT" | tr -d '\r')"
  if [ -z "$package_name" ] || [ ! -f "$artifact_root/$package_name" ]; then
    fail "packed artifact tarball output" "Expected tarball under $artifact_root, got: $(cat "$LAST_STDOUT")"
    return
  fi

  tar -xzf "$artifact_root/$package_name" -C "$extract_root"
  packaged_root="$extract_root/package"
  packaged_setup="$packaged_root/scripts/setup-openclaw.js"
  packaged_onboard="$packaged_root/skills/memory-onboard-agent/onboard.sh"
  packaged_pipeline="$packaged_root/skills/memory-pipeline/pipeline.sh"
  packaged_control_plane_cli="$packaged_root/packages/control-plane/bin/memory-control-plane.js"
  packaged_gateway_root="$packaged_root/packages/memory-os-gateway"
  packaged_memory_root="$workspace_root/system/memory"

  if [ -d "$packaged_root/packages/memory-os-gateway" ] && \
     [ -d "$packaged_root/packages/control-plane" ] && \
     [ -d "$packaged_root/packages/memory-maintainer" ] && \
     [ -f "$packaged_root/packages/memory-scripts/bin/verify.sh" ] && \
     [ -f "$packaged_root/packages/memory-pipeline/bin/run-pipeline.sh" ] && \
     [ -f "$packaged_control_plane_cli" ]; then
    pass "packed artifact bundles local runtime packages"
  else
    fail "packed artifact bundles local runtime packages" "Expected bundled packages under $packaged_root/packages"
    return
  fi

  run_and_capture env PATH="$tool_dir:$PATH" "$node_bin" "$packaged_setup" \
    --state-dir "$state_dir" \
    --workspace-root "$workspace_root" \
    --config-path "$config_path"

  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "packed artifact setup-openclaw exit code" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if [ -d "$workspace_root/system/memory" ] && [ -f "$config_path" ]; then
    pass "packed artifact setup-openclaw scaffolds workspace"
  else
    fail "packed artifact setup-openclaw scaffolds workspace" "Expected scaffolded workspace and config under $state_dir"
    return
  fi

  run_and_capture env PATH="$tool_dir:$PATH" "$node_bin" "$packaged_control_plane_cli" \
    snapshot \
    --memory-root "$packaged_memory_root" \
    --system-root "$workspace_root/system" \
    --skip-verify

  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "packed artifact control-plane CLI exit code" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if [ "$(json_query "$LAST_STDOUT" "kind")" = "control-plane-snapshot" ] && \
     [ "$(json_query "$LAST_STDOUT" "releaseQualification.qualified")" = "true" ] && \
     [ "$(json_query "$LAST_STDOUT" "releaseQualification.compatibilityShell.productionStatus")" = "current-production-install-shell" ] && \
     [ "$(json_query "$LAST_STDOUT" "releaseQualification.compatibilityShell.directAdapterInstall")" = "not-supported" ] && \
     [ "$(json_query "$LAST_STDOUT" "releaseQualification.retirementPrerequisites.cutoverReady")" = "false" ] && \
     [ "$(json_query "$LAST_STDOUT" "releaseQualification.retirementPrerequisites.gates.1.id")" = "wrapper-convergence" ]; then
    pass "packed artifact control-plane CLI runs after extract"
  else
    fail "packed artifact control-plane CLI runs after extract" "Expected control-plane snapshot with retained production-shell metadata and explicit retirement prerequisites"
    return
  fi

  packaged_probe_root="$artifact_root/package-probe"
  mkdir -p "$packaged_probe_root/node_modules"
  ln -s "$packaged_gateway_root" "$packaged_probe_root/node_modules/memory-os-gateway"

  run_and_capture_in_dir "$packaged_probe_root" env PATH="$tool_dir:$PATH" "$node_bin" -e 'const assert = require("node:assert/strict"); const gateway = require("memory-os-gateway"); assert.equal(typeof gateway.getOpsSnapshot, "undefined"); assert.equal(typeof gateway.inspectOps, "undefined"); assert.equal(typeof gateway.inspect_ops, "undefined"); try { require("memory-os-gateway/ops"); console.error("expected memory-os-gateway/ops to stay unexported in the shipped mirror"); process.exit(1); } catch (error) { if (error && error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED") { process.exit(0); } console.error(error && error.stack ? error.stack : String(error)); process.exit(2); }'

  if [ "$LAST_EXIT_CODE" -eq 0 ]; then
    pass "packed artifact shipped gateway mirror keeps retired ops bridge unexported"
  else
    fail "packed artifact shipped gateway mirror keeps retired ops bridge unexported" "Expected installed artifact to hide package-level ops exports"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  git -C "$packaged_memory_root" init >/dev/null 2>&1
  git -C "$packaged_memory_root" config user.name "Packaged Artifact Test"
  git -C "$packaged_memory_root" config user.email "artifact@example.com"
  git -C "$packaged_memory_root" add .
  git -C "$packaged_memory_root" commit -m "test: seed packaged memory" >/dev/null 2>&1

  run_and_capture_in_dir "$workspace_root" env PATH="$tool_dir:$PATH" "$packaged_onboard" analyst
  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "packed artifact onboard exit code" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  run_and_capture_in_dir "$workspace_root" env PATH="$tool_dir:$PATH" "$packaged_pipeline" 2026-03-05 --phase verify
  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "packed artifact pipeline verify exit code" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if [ -f "$packaged_memory_root/core/agents/analyst/COURSE.md" ] && \
     [ -f "$packaged_memory_root/core/meta/manifest.json" ] && \
     grep -Fq 'Phase D — verify' "$LAST_STDOUT"; then
    pass "packed artifact skill wrappers execute after extract"
  else
    fail "packed artifact skill wrappers execute after extract" "Expected onboarded analyst slice and verify output from extracted package"
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

  run_and_capture "$NODE_BIN" "$SETUP_SCRIPT" \
    --state-dir "$state_dir" \
    --workspace-root "$workspace_root" \
    --config-path "$config_path" \
    --bind "nyx=telegram:primary"

  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "setup-openclaw exit code" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if ! require_dir "$workspace_root/system/memory" "setup-openclaw created shared memory root"; then
    return
  fi

  if ! require_dir "$workspace_root/system" "setup-openclaw created shared system root"; then
    return
  fi

  if ! require_file "$workspace_root/system/tasks/active/.kanban.json" "setup-openclaw created board settings"; then
    return
  fi

  if ! require_dir "$workspace_root/system/skills" "setup-openclaw created shared skills root"; then
    return
  fi

  if ! require_symlink "$workspace_root/system/skills/memory-query" "setup-openclaw linked plugin skills into workspace"; then
    return
  fi

  if [ ! -e "$workspace_root/memory" ] && [ ! -e "$workspace_root/skills" ]; then
    pass "setup-openclaw leaves no legacy root paths"
  else
    fail "setup-openclaw leaves no legacy root paths" "Did not expect workspace/memory or workspace/skills in fresh layout"
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

    if grep -Fq '../system/memory' "$workspace_root/$agent/AGENTS.md" && \
       grep -Fq "../system/memory/core/agents/$agent/" "$workspace_root/$agent/AGENTS.md"; then
      pass "setup-openclaw canon wiring for $agent"
    else
      fail "setup-openclaw canon wiring for $agent" "Expected shared memory references in $workspace_root/$agent/AGENTS.md"
    fi

    if ! require_symlink "$workspace_root/$agent/skills" "setup-openclaw shared skills link for $agent"; then
      return
    fi

    if ! require_symlink "$workspace_root/$agent/system" "setup-openclaw shared system link for $agent"; then
      return
    fi

    if ! require_dir "$state_dir/agents/$agent/agent" "setup-openclaw agent state dir for $agent"; then
      return
    fi

    if ! require_dir "$state_dir/agents/$agent/sessions" "setup-openclaw sessions dir for $agent"; then
      return
    fi
  done

  if grep -Fq '## Orchestration' "$workspace_root/nyx/AGENTS.md" && \
     grep -Fq 'Medea and Arx are the default specialist pair.' "$workspace_root/nyx/AGENTS.md" && \
     grep -Fq 'You are not a chatbot. You are becoming someone.' "$workspace_root/nyx/SOUL.md"; then
    pass "setup-openclaw nyx human orchestrator content"
  else
    fail "setup-openclaw nyx human orchestrator content" "Nyx generated files are missing the expected human/orchestration guidance"
  fi

  if grep -Fq 'Produce evidence-backed research, source synthesis, and decision-grade documentation.' "$workspace_root/medea/AGENTS.md" && \
     ! grep -Fq 'You are not a chatbot. You are becoming someone.' "$workspace_root/medea/SOUL.md" && \
     ! grep -Fq 'Who am I? Who are you?' "$workspace_root/medea/BOOTSTRAP.md"; then
    pass "setup-openclaw medea efficient content"
  else
    fail "setup-openclaw medea efficient content" "Medea should stay efficient and research-focused in generated files"
  fi

  if grep -Fq 'Deliver working code, bounded refactors, and defensible technical decisions.' "$workspace_root/arx/AGENTS.md" && \
     grep -Fq 'Primary startup directive: Inspect current code and canon context first, then choose the smallest implementation path that satisfies the user goal.' "$workspace_root/arx/BOOT.md"; then
    pass "setup-openclaw arx efficient content"
  else
    fail "setup-openclaw arx efficient content" "Arx generated files are missing the expected implementation-focused guidance"
  fi

  if grep -Fq 'This file exists because Lev is the heartbeat agent.' "$workspace_root/lev/HEARTBEAT.md" && \
     grep -Fq 'Do not accept general-purpose work.' "$workspace_root/lev/AGENTS.md" && \
     grep -Fq 'Primary startup directive: Load current priorities, inspect the shared board and policy defaults, then identify the next stalled item that needs a nudge.' "$workspace_root/lev/BOOT.md"; then
    pass "setup-openclaw lev heartbeat-only content"
  else
    fail "setup-openclaw lev heartbeat-only content" "Lev generated files are missing the expected heartbeat-only constraints"
  fi

  if grep -Fq 'Do not act as a general assistant.' "$workspace_root/mnemo/AGENTS.md" && \
     grep -Fq 'You are the single canonical writer.' "$workspace_root/mnemo/SOUL.md" && \
     grep -Fq 'Primary startup directive: Open shared canon and intake, verify writer invariants, then decide whether the request needs query, curation, or maintenance.' "$workspace_root/mnemo/BOOT.md"; then
    pass "setup-openclaw mnemo memory-only content"
  else
    fail "setup-openclaw mnemo memory-only content" "Mnemo generated files are missing the expected memory-governance constraints"
  fi

  if grep -Fq 'Keep this file empty (or with only comments) to skip heartbeat API calls.' "$workspace_root/nyx/HEARTBEAT.md" && \
     grep -Fq 'Keep this file empty (or with only comments) to skip heartbeat API calls.' "$workspace_root/medea/HEARTBEAT.md" && \
     grep -Fq 'Keep this file empty (or with only comments) to skip heartbeat API calls.' "$workspace_root/arx/HEARTBEAT.md" && \
     grep -Fq 'Keep this file empty (or with only comments) to skip heartbeat API calls.' "$workspace_root/mnemo/HEARTBEAT.md"; then
    pass "setup-openclaw non-lev heartbeat files stay inert"
  else
    fail "setup-openclaw non-lev heartbeat files stay inert" "Only Lev should get an active heartbeat instruction file"
  fi

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

  if python3 - "$config_path" "$workspace_root" <<'PY'
import json
import os
import sys

config_path, workspace_root = sys.argv[1:3]
with open(config_path, 'r', encoding='utf-8') as handle:
    data = json.load(handle)

extra_dirs = data.get('skills', {}).get('load', {}).get('extraDirs', [])
expected_skills = os.path.realpath(f"{workspace_root}/skills")
expected_system_skills = os.path.realpath(f"{workspace_root}/system/skills")

normalized_extra_dirs = [
    os.path.realpath(path) if isinstance(path, str) and path.startswith("/") else path
    for path in extra_dirs
]

ok = expected_system_skills in normalized_extra_dirs and expected_skills not in normalized_extra_dirs
sys.exit(0 if ok else 1)
PY
  then
    pass "setup-openclaw shared skill path"
  else
    fail "setup-openclaw shared skill path" "Expected skills.load.extraDirs to point into the scaffold"
  fi

  if python3 - "$config_path" <<'PY'
import json
import sys

with open(sys.argv[1], 'r', encoding='utf-8') as handle:
    data = json.load(handle)

paths = data.get('agents', {}).get('defaults', {}).get('memorySearch', {}).get('extraPaths', [])
required = {
    "../system/memory/core/user/timeline/**/*.md",
    "../system/memory/core/user/knowledge/*.md",
    "../system/memory/core/user/identity/*.md",
    "../system/memory/core/user/state/*.md",
    "../system/memory/core/agents/**/*.md",
}
sys.exit(0 if required.issubset(set(paths)) else 1)
PY
  then
    pass "setup-openclaw memory search paths"
  else
    fail "setup-openclaw memory search paths" "Expected canonical memorySearch.extraPaths to be registered"
  fi

  printf 'LOCAL_NOTE\n' >> "$workspace_root/nyx/MEMORY.md"
  run_and_capture "$NODE_BIN" "$SETUP_SCRIPT" \
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

  run_and_capture "$NODE_BIN" "$SETUP_SCRIPT" \
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

test_runtime_auto_bootstrap() {
  local runtime_state_dir runtime_workspace_root runtime_config_path

  runtime_state_dir="$TEST_WORKDIR/runtime-state"
  runtime_workspace_root="$runtime_state_dir/workspace"
  runtime_config_path="$runtime_state_dir/openclaw.json"

  print_case "TEST" "runtime entrypoint auto-bootstraps workspace on first plugin load"

  run_and_capture env OPENCLAW_STATE_DIR="$runtime_state_dir" "$NODE_BIN" - "$ENTRY_FILE" <<'EOF'
const entryPath = process.argv[2];
const plugin = require(entryPath);

const services = [];
plugin.register({
  config: {
    plugins: {
      entries: {
        "nmc-memory-plugin": {
          config: {
            autoSetup: true,
          },
        },
      },
    },
  },
  logger: {
    info() {},
    error(message) {
      console.error(message);
    },
  },
  registerCli() {},
  registerService(service) {
    services.push(service);
  },
});

if (services.length !== 1) {
  console.error(`expected one service, got ${services.length}`);
  process.exit(1);
}

services[0].start();
EOF

  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "runtime auto-bootstrap exit code" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if ! require_dir "$runtime_workspace_root/system/memory" "runtime auto-bootstrap created shared memory root"; then
    return
  fi

  if ! require_dir "$runtime_workspace_root/system/skills" "runtime auto-bootstrap created shared skills root"; then
    return
  fi

  if ! require_file "$runtime_config_path" "runtime auto-bootstrap wrote openclaw.json"; then
    return
  fi

  if [ "$(json_length "$runtime_config_path" 'agents.list')" = "5" ]; then
    pass "runtime auto-bootstrap agent registrations"
  else
    fail "runtime auto-bootstrap agent registrations" "Expected 5 agents, found $(json_length "$runtime_config_path" 'agents.list')"
  fi
}

test_runtime_auto_bootstrap_disabled() {
  local runtime_state_dir runtime_workspace_root runtime_config_path

  runtime_state_dir="$TEST_WORKDIR/runtime-disabled-state"
  runtime_workspace_root="$runtime_state_dir/workspace"
  runtime_config_path="$runtime_state_dir/openclaw.json"

  print_case "TEST" "runtime entrypoint skips bootstrap when autoSetup is disabled"

  run_and_capture env OPENCLAW_STATE_DIR="$runtime_state_dir" "$NODE_BIN" - "$ENTRY_FILE" <<'EOF'
const entryPath = process.argv[2];
const plugin = require(entryPath);

const services = [];
plugin.register({
  config: {
    plugins: {
      entries: {
        "nmc-memory-plugin": {
          config: {
            autoSetup: false,
          },
        },
      },
    },
  },
  logger: {
    info() {},
    error(message) {
      console.error(message);
    },
  },
  registerCli() {},
  registerService(service) {
    services.push(service);
  },
});

if (services.length !== 1) {
  console.error(`expected one service, got ${services.length}`);
  process.exit(1);
}

services[0].start();
EOF

  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "runtime auto-bootstrap disabled exit code" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if [ ! -d "$runtime_workspace_root" ] && [ ! -f "$runtime_config_path" ]; then
    pass "runtime auto-bootstrap disabled leaves state untouched"
  else
    fail "runtime auto-bootstrap disabled leaves state untouched" "Expected no workspace or config to be created"
  fi
}

test_runtime_auto_bootstrap_without_state_dir() {
  local runtime_root
  runtime_root="$TEST_WORKDIR/runtime-no-state-dir"
  mkdir -p "$runtime_root"

  print_case "TEST" "runtime entrypoint tolerates missing state-dir hints"

  run_and_capture env -u OPENCLAW_STATE_DIR "$NODE_BIN" - "$runtime_root/plugin" <<'EOF'
const fs = require("fs");
const path = require("path");

const pluginRoot = process.argv[2];
fs.mkdirSync(pluginRoot, { recursive: true });
fs.copyFileSync("nmc-memory-plugin/index.js", path.join(pluginRoot, "index.js"));
fs.mkdirSync(path.join(pluginRoot, "lib"), { recursive: true });
fs.copyFileSync(
  "nmc-memory-plugin/lib/openclaw-setup.js",
  path.join(pluginRoot, "lib", "openclaw-setup.js"),
);

const plugin = require(path.join(pluginRoot, "index.js"));
const services = [];
plugin.register({
  config: {
    plugins: {
      entries: {
        "nmc-memory-plugin": {
          config: {},
        },
      },
    },
  },
  logger: {
    info() {},
    error(message) {
      console.error(message);
    },
  },
  registerCli() {},
  registerService(service) {
    services.push(service);
  },
});

if (services.length !== 1) {
  console.error(`expected one service, got ${services.length}`);
  process.exit(1);
}

services[0].start();
EOF

  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "runtime missing state-dir exit code" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if [ ! -s "$LAST_STDERR" ]; then
    pass "runtime missing state-dir is a clean no-op"
  else
    fail "runtime missing state-dir is a clean no-op" "Expected no bootstrap error log, got: $(cat "$LAST_STDERR")"
  fi
}

test_scaffolded_workspace_script_detection() {
  local state_dir workspace_root config_path

  state_dir="$TEST_WORKDIR/scaffolded-script-state"
  workspace_root="$state_dir/workspace"
  config_path="$state_dir/openclaw.json"

  print_case "TEST" "workspace/system layout is detected by onboard and pipeline scripts from scaffolded root"

  run_and_capture "$NODE_BIN" "$SETUP_SCRIPT" \
    --state-dir "$state_dir" \
    --workspace-root "$workspace_root" \
    --config-path "$config_path"

  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "scaffolded script detection setup exit code" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  run_and_capture_in_dir "$workspace_root" "$ONBOARD_SCRIPT" analyst
  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "scaffolded onboard detection exit code" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if [ -f "$workspace_root/system/memory/core/agents/analyst/COURSE.md" ]; then
    pass "scaffolded onboard detection path"
  else
    fail "scaffolded onboard detection path" "Expected analyst role under workspace/system/memory"
  fi

  git -C "$workspace_root/system/memory" init >/dev/null 2>&1
  git -C "$workspace_root/system/memory" config user.name "Integration Test"
  git -C "$workspace_root/system/memory" config user.email "integration@example.com"
  git -C "$workspace_root/system/memory" add .
  git -C "$workspace_root/system/memory" commit -m "test: seed scaffolded memory" >/dev/null 2>&1

  run_and_capture_in_dir "$workspace_root" "$PIPELINE_SCRIPT" 2026-03-05 --phase verify
  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "scaffolded pipeline detection exit code" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  if grep -Fq 'Phase D — verify' "$LAST_STDOUT"; then
    pass "scaffolded pipeline detection path"
  else
    fail "scaffolded pipeline detection path" "Expected verify phase output from scaffolded workspace root"
  fi
}

test_kanban_policy_contract() {
  local state_dir workspace_root config_path task_file kanban_script board_file

  state_dir="$TEST_WORKDIR/kanban-state"
  workspace_root="$state_dir/workspace"
  config_path="$state_dir/openclaw.json"
  kanban_script="$workspace_root/system/scripts/kanban.mjs"
  board_file="$workspace_root/system/tasks/active/.kanban.json"
  task_file="$workspace_root/system/tasks/active/T-0001-kanban-smoke.md"

  print_case "TEST" "kanban.mjs resolves effective policy values without persisting computed fields"

  run_and_capture "$NODE_BIN" "$SETUP_SCRIPT" \
    --state-dir "$state_dir" \
    --workspace-root "$workspace_root" \
    --config-path "$config_path"

  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "kanban setup exit code" "Expected 0, got $LAST_EXIT_CODE"
    printf '  stderr: %s\n' "$(cat "$LAST_STDERR")"
    return
  fi

  cp "$workspace_root/system/tasks/templates/task.md" "$task_file"
  python3 - "$task_file" <<'PY'
import pathlib
import sys

task_path = pathlib.Path(sys.argv[1])
text = task_path.read_text(encoding="utf-8")
text = text.replace("id: T-0000", "id: T-0001")
text = text.replace('title: ""', 'title: "Kanban smoke"')
text = text.replace("status: backlog", "status: planned")
text = text.replace("owner: null", "owner: lev")
text = text.replace("next_action: null", 'next_action: "Run smoke"')
task_path.write_text(text, encoding="utf-8")
PY

  run_and_capture "$NODE_BIN" "$kanban_script" set-board-autonomy partial
  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "kanban set-board-autonomy exit code" "Expected 0, got $LAST_EXIT_CODE"
    return
  fi

  run_and_capture "$NODE_BIN" "$kanban_script" set-board-git-flow pr
  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "kanban set-board-git-flow exit code" "Expected 0, got $LAST_EXIT_CODE"
    return
  fi

  run_and_capture "$NODE_BIN" "$kanban_script" set-autonomy T-0001 ask
  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "kanban set-autonomy exit code" "Expected 0, got $LAST_EXIT_CODE"
    return
  fi

  run_and_capture "$NODE_BIN" "$kanban_script" next --owner lev --json
  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "kanban next exit code" "Expected 0, got $LAST_EXIT_CODE"
    return
  fi

  if python3 - "$LAST_STDOUT" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    data = json.load(handle)

ok = (
    data["id"] == "T-0001" and
    data["autonomy"] == "ask" and
    data["effective_autonomy"] == "ask" and
    data["git_flow"] == "inherit" and
    data["effective_git_flow"] == "pr"
)
sys.exit(0 if ok else 1)
PY
  then
    pass "kanban effective autonomy and git flow"
  else
    fail "kanban effective autonomy and git flow" "Unexpected next payload: $(cat "$LAST_STDOUT")"
  fi

  run_and_capture "$NODE_BIN" "$kanban_script" set-status T-0001 in_progress
  if [ "$LAST_EXIT_CODE" -ne 0 ]; then
    fail "kanban set-status exit code" "Expected 0, got $LAST_EXIT_CODE"
    return
  fi

  if ! grep -Fq '"autonomy_default": "partial"' "$board_file"; then
    fail "kanban board settings persisted" "Expected board autonomy default to be updated"
  else
    pass "kanban board settings persisted"
  fi

  if grep -Fq 'effective_autonomy:' "$task_file" || grep -Fq 'effective_git_flow:' "$task_file"; then
    fail "kanban excludes computed fields from frontmatter" "Task file leaked effective_* fields"
  else
    pass "kanban excludes computed fields from frontmatter"
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
  test_packaged_artifact_install_smoke
  test_openclaw_setup
  test_kanban_policy_contract
  test_runtime_auto_bootstrap
  test_runtime_auto_bootstrap_disabled
  test_runtime_auto_bootstrap_without_state_dir
  test_scaffolded_workspace_script_detection
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

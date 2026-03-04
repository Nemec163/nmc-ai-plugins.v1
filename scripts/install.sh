#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPORT_PATH="$ROOT/.install-report.json"

if ! command -v node >/dev/null 2>&1; then
  echo "node is required" >&2
  exit 2
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required" >&2
  exit 2
fi
if ! command -v openclaw >/dev/null 2>&1; then
  echo "openclaw CLI is required (https://docs.openclaw.ai/cli/plugins)" >&2
  exit 2
fi

CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-$HOME/.openclaw/openclaw.json}"
STATE_DIR="${NMC_AI_PLUGINS_STATE_DIR:-$HOME/.openclaw/nmc-ai-plugins}"
SKILLS_DIR="${NMC_AI_PLUGINS_SKILLS_DIR:-$HOME/.openclaw/skills/nmc-ai-plugins}"
ALLOW_BUILD_PKGS=("better-sqlite3" "@lancedb/lancedb")
ALLOW_BUILD_FLAGS=()
for pkg in "${ALLOW_BUILD_PKGS[@]}"; do
  ALLOW_BUILD_FLAGS+=(--allow-build "$pkg")
done

mkdir -p "$STATE_DIR" "$SKILLS_DIR"
mkdir -p "$STATE_DIR/templates/agent-md"
cp -R "$ROOT/templates/agent-md/"* "$STATE_DIR/templates/agent-md/"

PLUGIN_IDS=(
  "nmc-memory-fabric"
  "nmc-agent-lifecycle"
  "nmc-control-plane"
)

for id in "${PLUGIN_IDS[@]}"; do
  src="$ROOT/packages/$id"
  if [ ! -d "$src" ]; then
    echo "plugin source does not exist: $src" >&2
    exit 2
  fi

  if ! openclaw plugins install "$src" "${ALLOW_BUILD_FLAGS[@]}"; then
    openclaw plugins uninstall "$id" >/dev/null 2>&1 || true
    openclaw plugins install "$src" "${ALLOW_BUILD_FLAGS[@]}"
  fi
  openclaw plugins enable "$id" >/dev/null 2>&1 || true
done

mkdir -p "$SKILLS_DIR"
cp -R "$ROOT/skills"/* "$SKILLS_DIR"/

node "$ROOT/scripts/patch-openclaw-config.mjs" \
  --config "$CONFIG_PATH" \
  --state-dir "$STATE_DIR" \
  --skills-dir "$SKILLS_DIR" \
  --templates-dir "$STATE_DIR/templates/agent-md" > "$ROOT/.patch-report.json"

if command -v openclaw >/dev/null 2>&1; then
  openclaw gateway restart >/dev/null 2>&1 || true
fi

INSTALL_SMOKE_OK=true
RUNTIME_SMOKE_OK=true

if ! node "$ROOT/scripts/smoke-install.mjs" > "$ROOT/.smoke-install.json"; then
  INSTALL_SMOKE_OK=false
fi
if ! node "$ROOT/scripts/smoke-runtime.mjs" > "$ROOT/.smoke-runtime.json"; then
  RUNTIME_SMOKE_OK=false
fi

cat > "$REPORT_PATH" <<EOF
{
  "ok": $([ "$INSTALL_SMOKE_OK" = true ] && [ "$RUNTIME_SMOKE_OK" = true ] && echo true || echo false),
  "root": "${ROOT}",
  "configPath": "${CONFIG_PATH}",
  "stateDir": "${STATE_DIR}",
  "skillsDir": "${SKILLS_DIR}",
  "installedPlugins": ["nmc-memory-fabric", "nmc-agent-lifecycle", "nmc-control-plane"],
  "allowBuild": ["better-sqlite3", "@lancedb/lancedb"],
  "installSmoke": ${INSTALL_SMOKE_OK},
  "runtimeSmoke": ${RUNTIME_SMOKE_OK}
}
EOF

cat "$REPORT_PATH"

if [ "$INSTALL_SMOKE_OK" != true ]; then
  exit 1
fi

exit 0

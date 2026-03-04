#!/usr/bin/env bash
set -euo pipefail

SKILLS_DIR="${NMC_AI_PLUGINS_SKILLS_DIR:-$HOME/.openclaw/skills/nmc-ai-plugins}"

if ! command -v openclaw >/dev/null 2>&1; then
  echo "openclaw CLI is required for uninstall" >&2
  exit 2
fi

for id in nmc-memory-fabric nmc-agent-lifecycle nmc-control-plane; do
  openclaw plugins disable "$id" >/dev/null 2>&1 || true
  openclaw plugins uninstall "$id" >/dev/null 2>&1 || true
done

rm -rf "$SKILLS_DIR"

echo '{"ok":true,"message":"plugins and skills removed"}'

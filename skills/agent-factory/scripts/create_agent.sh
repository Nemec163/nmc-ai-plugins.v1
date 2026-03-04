#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "Usage: $0 <agent_id> <display_name> <access_level> [scope ...]" >&2
  exit 1
fi

agent_id="$1"
shift
display_name="$1"
shift
access_level="$1"
shift

args=(nmc-agent create --agent-id "$agent_id" --display-name "$display_name" --access-level "$access_level" --json)
for scope in "$@"; do
  args+=(--domain-scope "$scope")
done

openclaw "${args[@]}"

# Emit memory access profile for the new principal so operators can verify
# layer visibility without loading memory content.
openclaw nmc-mem access-profile \
  --principal "$agent_id" \
  --actor-level "$access_level" \
  --query "agent bootstrap memory routing" \
  --json

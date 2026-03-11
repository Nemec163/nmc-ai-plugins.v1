#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 role_name" >&2
}

now_rfc3339() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

today_utc() {
  date -u +"%Y-%m-%d"
}

schema_version() {
  local memory_root="$1"
  local canon_file="$memory_root/core/system/CANON.md"

  if [ -f "$canon_file" ]; then
    awk '
      /^[[:space:]]*schema_version:[[:space:]]*/ {
        line=$0
        sub(/^[[:space:]]*schema_version:[[:space:]]*"?/, "", line)
        sub(/"?[[:space:]]*$/, "", line)
        print line
        exit
      }
    ' "$canon_file"
  else
    printf '%s\n' '1.0'
  fi
}

detect_memory_root() {
  if [ -d "$PWD/core/agents" ]; then
    printf '%s\n' "$PWD"
  elif [ -d "$PWD/workspace/memory/core/agents" ]; then
    printf '%s\n' "$PWD/workspace/memory"
  else
    echo "error: could not locate workspace memory root from current directory" >&2
    return 1
  fi
}

write_template() {
  local file_path="$1"
  local role_name="$2"
  local type_name="$3"
  local heading="$4"
  local schema="$5"
  local updated_at="$6"

  cat > "$file_path" <<EOF
---
role: $role_name
type: $type_name
schema_version: "$schema"
updated_at: "$updated_at"
---
# $role_name — $heading

## Purpose
Document $heading guidance for the $role_name role.

## Notes
Add canonical content here as the role matures.
EOF
}

main() {
  local role_name memory_root agent_dir index_file schema updated_at onboarded_on

  if [ "$#" -ne 1 ]; then
    usage
    exit 1
  fi

  role_name="$1"

  if [[ ! "$role_name" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
    echo "error: role_name must be lowercase and contain only letters, numbers, hyphens, or underscores" >&2
    exit 1
  fi

  memory_root="$(detect_memory_root)"
  agent_dir="$memory_root/core/agents/$role_name"
  index_file="$memory_root/core/agents/_index.md"
  schema="$(schema_version "$memory_root")"
  updated_at="$(now_rfc3339)"
  onboarded_on="$(today_utc)"

  if [ -e "$agent_dir" ]; then
    echo "error: agent role already exists: $role_name" >&2
    exit 1
  fi

  if [ -f "$index_file" ] && grep -Fq "| $role_name |" "$index_file"; then
    echo "error: agent role already listed in index: $role_name" >&2
    exit 1
  fi

  mkdir -p "$agent_dir"

  write_template "$agent_dir/COURSE.md" "$role_name" "course" "Course" "$schema" "$updated_at"
  write_template "$agent_dir/PLAYBOOK.md" "$role_name" "playbook" "Playbook" "$schema" "$updated_at"
  write_template "$agent_dir/PITFALLS.md" "$role_name" "pitfalls" "Pitfalls" "$schema" "$updated_at"
  write_template "$agent_dir/DECISIONS.md" "$role_name" "decisions" "Decisions" "$schema" "$updated_at"

  if [ ! -f "$index_file" ]; then
    cat > "$index_file" <<EOF
---
schema_version: "$schema"
updated_at: "$onboarded_on"
---
# Agent Registry

| Role | Path | Status | Onboarded |
|------|------|--------|-----------|
EOF
  fi

  printf '| %s | agents/%s/ | active | %s |\n' "$role_name" "$role_name" "$onboarded_on" >> "$index_file"
}

main "$@"

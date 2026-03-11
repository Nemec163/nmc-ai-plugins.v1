#!/usr/bin/env bash
set -euo pipefail

now_rfc3339() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

file_mtime_epoch() {
  if stat -f %m "$1" >/dev/null 2>&1; then
    stat -f %m "$1"
  else
    stat -c %Y "$1"
  fi
}

timestamp_to_epoch() {
  local timestamp="$1"

  if date -u -d "$timestamp" +%s >/dev/null 2>&1; then
    date -u -d "$timestamp" +%s
  elif date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$timestamp" +%s >/dev/null 2>&1; then
    date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$timestamp" +%s
  elif date -u -j -f "%Y-%m-%d" "$timestamp" +%s >/dev/null 2>&1; then
    date -u -j -f "%Y-%m-%d" "$timestamp" +%s
  else
    return 1
  fi
}

epoch_to_date() {
  local epoch="$1"

  if date -u -d "@$epoch" +"%Y-%m-%d" >/dev/null 2>&1; then
    date -u -d "@$epoch" +"%Y-%m-%d"
  else
    date -u -r "$epoch" +"%Y-%m-%d"
  fi
}

resolve_meta_dir() {
  local memory_root="$1"

  if [ -f "$memory_root/core/meta/manifest.json" ] || [ -d "$memory_root/core/meta" ] || [ -f "$memory_root/core/system/CANON.md" ]; then
    printf '%s\n' "$memory_root/core/meta"
  else
    printf '%s\n' "$memory_root/meta"
  fi
}

manifest_string() {
  local manifest_file="$1"
  local field="$2"

  if [ ! -f "$manifest_file" ]; then
    return 0
  fi

  if command -v jq >/dev/null 2>&1; then
    jq -r --arg field "$field" '.[$field] // empty' "$manifest_file"
  else
    sed -n "s/.*\"$field\":[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" "$manifest_file" | head -n 1
  fi
}

manifest_count() {
  local manifest_file="$1"
  local field="$2"

  if [ ! -f "$manifest_file" ]; then
    printf '%s\n' '0'
    return 0
  fi

  if command -v jq >/dev/null 2>&1; then
    jq -r --arg field "$field" '.record_counts[$field] // 0' "$manifest_file"
  else
    awk -v key="$field" '
      $0 ~ "\"" key "\"" {
        line=$0
        gsub(/[^0-9]/, "", line)
        print line + 0
        found=1
        exit
      }
      END {
        if (!found) {
          print 0
        }
      }
    ' "$manifest_file"
  fi
}

main() {
  local memory_root meta_dir manifest_file pending_dir processed_dir
  local generated_at schema last_updated now_epoch=0 last_manifest_age_days='n/a'
  local pending_count=0 pending_oldest_epoch=0 pending_oldest='none' pending_oldest_age=0
  local processed_stale_count=0 overall_status='OK'
  local events facts states identities competences
  local file file_epoch age_seconds

  memory_root="${1:-workspace/memory}"
  memory_root="${memory_root%/}"
  meta_dir="$(resolve_meta_dir "$memory_root")"
  manifest_file="$meta_dir/manifest.json"
  pending_dir="$memory_root/intake/pending"
  processed_dir="$memory_root/intake/processed"
  generated_at="$(now_rfc3339)"

  if [ ! -d "$memory_root" ]; then
    echo "error: memory directory not found: $memory_root" >&2
    exit 1
  fi

  if date -u +%s >/dev/null 2>&1; then
    now_epoch="$(date -u +%s)"
  else
    now_epoch="$(date +%s)"
  fi

  schema="$(manifest_string "$manifest_file" "schema_version")"
  last_updated="$(manifest_string "$manifest_file" "last_updated")"
  events="$(manifest_count "$manifest_file" "events")"
  facts="$(manifest_count "$manifest_file" "facts")"
  states="$(manifest_count "$manifest_file" "states")"
  identities="$(manifest_count "$manifest_file" "identities")"
  competences="$(manifest_count "$manifest_file" "competences")"

  if [ -n "$last_updated" ]; then
    file_epoch="$(timestamp_to_epoch "$last_updated" || printf '0\n')"
    if [ "$file_epoch" -gt 0 ]; then
      last_manifest_age_days=$(( (now_epoch - file_epoch) / 86400 ))
    fi
  fi

  if [ -d "$pending_dir" ]; then
    while IFS= read -r file; do
      [ -n "$file" ] || continue
      pending_count=$((pending_count + 1))
      file_epoch="$(file_mtime_epoch "$file")"
      if [ "$pending_oldest_epoch" -eq 0 ] || [ "$file_epoch" -lt "$pending_oldest_epoch" ]; then
        pending_oldest_epoch="$file_epoch"
      fi
    done < <(find "$pending_dir" -maxdepth 1 -type f -name '*.md' | sort)
  fi

  if [ "$pending_oldest_epoch" -gt 0 ]; then
    pending_oldest="$(epoch_to_date "$pending_oldest_epoch")"
    pending_oldest_age=$(( (now_epoch - pending_oldest_epoch) / 86400 ))
    if [ "$pending_oldest_age" -gt 7 ]; then
      overall_status='ALERT'
    fi
  fi

  if [ -d "$processed_dir" ]; then
    while IFS= read -r file; do
      [ -n "$file" ] || continue
      age_seconds=$((now_epoch - $(file_mtime_epoch "$file")))
      if [ "$age_seconds" -gt $((90 * 86400)) ]; then
        processed_stale_count=$((processed_stale_count + 1))
      fi
    done < <(find "$processed_dir" -maxdepth 1 -type f -name '*.md' | sort)
  fi

  if [ "$processed_stale_count" -gt 0 ]; then
    overall_status='ALERT'
  fi

  echo "Memory Status Report"
  echo "Generated at: $generated_at"
  echo "Memory root: $memory_root"
  echo
  echo "== Manifest =="
  if [ -f "$manifest_file" ]; then
    echo "Schema version: ${schema:-unknown}"
    echo "Last manifest: ${last_updated:-unknown}"
    echo "Manifest age (days): $last_manifest_age_days"
    echo "Events: $events"
    echo "Facts: $facts"
    echo "States: $states"
    echo "Identities: $identities"
    echo "Competences: $competences"
  else
    echo "Manifest file: missing"
  fi
  echo
  echo "== Intake Backlog =="
  echo "Pending files: $pending_count"
  echo "Oldest pending: $pending_oldest"
  if [ "$pending_oldest_epoch" -gt 0 ]; then
    echo "Oldest pending age (days): $pending_oldest_age"
  fi
  if [ "$pending_oldest_age" -gt 7 ]; then
    echo "Backlog alert: yes"
  else
    echo "Backlog alert: no"
  fi
  echo
  echo "== Retention =="
  echo "Processed files older than 90 days: $processed_stale_count"
  if [ "$processed_stale_count" -gt 0 ]; then
    echo "Retention alert: yes"
  else
    echo "Retention alert: no"
  fi
  echo
  echo "== Overall =="
  echo "Status: $overall_status"
}

main "$@"

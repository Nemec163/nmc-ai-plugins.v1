#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 [workspace/memory] [--compact-edges] [--archive-timeline]" >&2
}

today_utc() {
  date -u +"%Y-%m-%d"
}

file_mtime_epoch() {
  if stat -f %m "$1" >/dev/null 2>&1; then
    stat -f %m "$1"
  else
    stat -c %Y "$1"
  fi
}

epoch_now() {
  if date -u +%s >/dev/null 2>&1; then
    date -u +%s
  else
    date +%s
  fi
}

format_epoch() {
  local epoch="$1"
  local format="$2"

  if date -u -d "@$epoch" +"$format" >/dev/null 2>&1; then
    date -u -d "@$epoch" +"$format"
  else
    date -u -r "$epoch" +"$format"
  fi
}

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

warn() {
  echo "warning: $*" >&2
}

list_record_files() {
  local memory_root="$1"
  local path

  for path in "$memory_root/core/user" "$memory_root/core/agents"; do
    if [ -d "$path" ]; then
      find "$path" -type f -name '*.md'
    fi
  done | sort
}

extract_record_ids() {
  awk '
    /^[[:space:]]*record_id:[[:space:]]*/ {
      line=$0
      sub(/^[[:space:]]*record_id:[[:space:]]*"?/, "", line)
      sub(/"?[[:space:]]*$/, "", line)
      print line
    }
  ' "$@"
}

extract_links_from_file() {
  awk '
    function clean_value(raw, out) {
      out = raw
      sub(/^[[:space:]]*-[[:space:]]*/, "", out)
      sub(/^[^:]+:[[:space:]]*/, "", out)
      sub(/^[[:space:]]*"?/, "", out)
      sub(/"?[[:space:]]*$/, "", out)
      return out
    }

    /^---[[:space:]]*$/ {
      if (in_yaml == 0) {
        in_yaml = 1
        block_id = ""
        in_links = 0
        pending_rel = ""
        pending_target = ""
      } else {
        if (block_id != "" && pending_rel != "" && pending_target != "") {
          print block_id "\t" pending_rel "\t" pending_target
        }
        in_yaml = 0
        in_links = 0
        pending_rel = ""
        pending_target = ""
      }
      next
    }

    in_yaml == 0 {
      next
    }

    /^[[:space:]]*record_id:[[:space:]]*/ {
      block_id = clean_value($0)
      next
    }

    /^[[:space:]]*links:[[:space:]]*$/ {
      in_links = 1
      pending_rel = ""
      pending_target = ""
      next
    }

    in_links == 1 && /^[^[:space:]-][^:]*:[[:space:]]*/ {
      if (block_id != "" && pending_rel != "" && pending_target != "") {
        print block_id "\t" pending_rel "\t" pending_target
      }
      in_links = 0
      pending_rel = ""
      pending_target = ""
    }

    in_links == 1 && /^[[:space:]]*-[[:space:]]*rel:[[:space:]]*/ {
      if (block_id != "" && pending_rel != "" && pending_target != "") {
        print block_id "\t" pending_rel "\t" pending_target
      }
      pending_rel = clean_value($0)
      pending_target = ""
      next
    }

    in_links == 1 && /^[[:space:]]*target:[[:space:]]*/ {
      pending_target = clean_value($0)
      if (block_id != "" && pending_rel != "" && pending_target != "") {
        print block_id "\t" pending_rel "\t" pending_target
        pending_rel = ""
        pending_target = ""
      }
      next
    }
  ' "$1"
}

archive_with_git_mv() {
  local memory_root="$1"
  local source_path="$2"
  local destination_path="$3"
  local rel_source rel_destination

  rel_source="${source_path#$memory_root/}"
  rel_destination="${destination_path#$memory_root/}"

  if [ -e "$destination_path" ]; then
    warn "skipping move because destination already exists: $rel_destination"
    return 0
  fi

  mkdir -p "$(dirname "$destination_path")"
  git -C "$memory_root" mv "$rel_source" "$rel_destination"
}

rebuild_edges_file() {
  local memory_root="$1"
  local edges_file="$2"
  local today="$3"
  local record_list ids_raw ids_unique edges_raw edges_sorted edges_valid rebuilt_edges
  local file src rel dst edge_count

  record_list="$(mktemp "${TMPDIR:-/tmp}/memory-retention-records.XXXXXX")"
  ids_raw="$(mktemp "${TMPDIR:-/tmp}/memory-retention-ids-raw.XXXXXX")"
  ids_unique="$(mktemp "${TMPDIR:-/tmp}/memory-retention-ids.XXXXXX")"
  edges_raw="$(mktemp "${TMPDIR:-/tmp}/memory-retention-edges-raw.XXXXXX")"
  edges_sorted="$(mktemp "${TMPDIR:-/tmp}/memory-retention-edges-sorted.XXXXXX")"
  edges_valid="$(mktemp "${TMPDIR:-/tmp}/memory-retention-edges-valid.XXXXXX")"
  rebuilt_edges="$(mktemp "${TMPDIR:-/tmp}/memory-retention-edges-out.XXXXXX")"

  list_record_files "$memory_root" > "$record_list"

  if [ -s "$record_list" ]; then
    while IFS= read -r file; do
      [ -n "$file" ] || continue
      extract_record_ids "$file" >> "$ids_raw"
      extract_links_from_file "$file" >> "$edges_raw"
    done < "$record_list"
    sort -u "$ids_raw" > "$ids_unique"
  else
    : > "$ids_unique"
    : > "$edges_raw"
  fi

  if [ -s "$edges_raw" ]; then
    sort -u "$edges_raw" > "$edges_sorted"
  else
    : > "$edges_sorted"
  fi

  : > "$edges_valid"
  while IFS=$'\t' read -r src rel dst; do
    [ -n "${src:-}" ] || continue

    if ! grep -Fxq "$src" "$ids_unique"; then
      warn "skipping edge with missing src: $src -> $rel -> $dst"
      warning_count=$((warning_count + 1))
      continue
    fi

    if ! grep -Fxq "$dst" "$ids_unique"; then
      warn "skipping dangling edge: $src -> $rel -> $dst"
      warning_count=$((warning_count + 1))
      continue
    fi

    printf '%s\t%s\t%s\n' "$src" "$rel" "$dst" >> "$edges_valid"
  done < "$edges_sorted"

  : > "$rebuilt_edges"
  while IFS=$'\t' read -r src rel dst; do
    [ -n "${src:-}" ] || continue
    printf '{"batch":"%s","src":"%s","rel":"%s","dst":"%s","at":"%s"}\n' \
      "$(json_escape "$today")" \
      "$(json_escape "$src")" \
      "$(json_escape "$rel")" \
      "$(json_escape "$dst")" \
      "$(json_escape "$today")" >> "$rebuilt_edges"
  done < "$edges_valid"

  mkdir -p "$(dirname "$edges_file")"

  if [ ! -f "$edges_file" ] || ! cmp -s "$rebuilt_edges" "$edges_file"; then
    mv "$rebuilt_edges" "$edges_file"
    edge_count="$(awk 'NF {count++} END {print count+0}' "$edges_file")"
    echo "$edge_count"
  else
    rm -f "$rebuilt_edges"
    edge_count="$(awk 'NF {count++} END {print count+0}' "$edges_file")"
    echo "$edge_count"
  fi

  rm -f "$record_list" "$ids_raw" "$ids_unique" "$edges_raw" "$edges_sorted" "$edges_valid"
}

memory_root='workspace/memory'
memory_root_set=0
compact_edges=0
archive_timeline=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --compact-edges)
      compact_edges=1
      ;;
    --archive-timeline)
      archive_timeline=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "error: unknown option: $1" >&2
      usage
      exit 2
      ;;
    *)
      if [ "$memory_root_set" -eq 1 ]; then
        echo "error: unexpected extra argument: $1" >&2
        usage
        exit 2
      fi
      memory_root="$1"
      memory_root_set=1
      ;;
  esac
  shift
done

memory_root="${memory_root%/}"
today="$(today_utc)"
now_epoch="$(epoch_now)"
processed_cutoff_epoch=$((now_epoch - (90 * 86400)))
pending_cutoff_epoch=$((now_epoch - (7 * 86400)))
timeline_cutoff_epoch=$((now_epoch - (365 * 86400)))
processed_dir="$memory_root/intake/processed"
processed_archive_dir="$processed_dir/archive"
pending_dir="$memory_root/intake/pending"
timeline_dir="$memory_root/core/user/timeline"
timeline_archive_dir="$timeline_dir/archive"
edges_file="$memory_root/core/meta/graph/edges.jsonl"
archived_processed_count=0
pending_alert_count=0
timeline_archived_count=0
edges_compacted=0
edges_count=0
warning_count=0
commit_created=0

if [ ! -d "$memory_root" ]; then
  echo "error: memory directory not found: $memory_root" >&2
  exit 2
fi

if ! git -C "$memory_root" rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "error: memory directory is not inside a git repository: $memory_root" >&2
  exit 2
fi

if [ -d "$processed_dir" ]; then
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    if [ "$(file_mtime_epoch "$file")" -le "$processed_cutoff_epoch" ]; then
      archive_bucket="$(format_epoch "$(file_mtime_epoch "$file")" '%Y/%m')"
      if archive_with_git_mv "$memory_root" "$file" "$processed_archive_dir/$archive_bucket/$(basename "$file")"; then
        archived_processed_count=$((archived_processed_count + 1))
      fi
    fi
  done < <(find "$processed_dir" -maxdepth 1 -type f -name '*.md' | sort)
fi

if [ -d "$pending_dir" ]; then
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    file_epoch="$(file_mtime_epoch "$file")"
    if [ "$file_epoch" -le "$pending_cutoff_epoch" ]; then
      pending_alert_count=$((pending_alert_count + 1))
      echo "ALERT pending backlog: ${file#$memory_root/} is older than 7 days ($(format_epoch "$file_epoch" '%Y-%m-%d'))"
    fi
  done < <(find "$pending_dir" -maxdepth 1 -type f -name '*.md' | sort)
fi

if [ "$compact_edges" -eq 1 ]; then
  edges_count="$(rebuild_edges_file "$memory_root" "$edges_file" "$today")"
  edges_compacted=1
fi

if [ "$archive_timeline" -eq 1 ] && [ -d "$timeline_dir" ]; then
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    if [ "$(file_mtime_epoch "$file")" -le "$timeline_cutoff_epoch" ]; then
      timeline_rel="${file#$timeline_dir/}"
      if archive_with_git_mv "$memory_root" "$file" "$timeline_archive_dir/$timeline_rel"; then
        timeline_archived_count=$((timeline_archived_count + 1))
      fi
    fi
  done < <(find "$timeline_dir" -type f -name '*.md' ! -path "$timeline_archive_dir/*" | sort)
fi

git -C "$memory_root" add -- 'intake/processed' >/dev/null 2>&1 || true

if [ "$compact_edges" -eq 1 ]; then
  git -C "$memory_root" add -- 'core/meta/graph/edges.jsonl'
fi

if [ "$archive_timeline" -eq 1 ] && [ -d "$timeline_dir" ]; then
  git -C "$memory_root" add -- 'core/user/timeline'
fi

if ! git -C "$memory_root" diff --cached --quiet; then
  git -C "$memory_root" commit -m "memory: retention $today" >/dev/null
  commit_created=1
fi

echo
echo "Memory Retention Summary"
echo "Memory root: $memory_root"
echo "Processed intake archived (>90 days): $archived_processed_count"
echo "Pending backlog alerts (>7 days): $pending_alert_count"
if [ "$compact_edges" -eq 1 ]; then
  echo "Edges compacted: yes"
  echo "Edges exported: $edges_count"
else
  echo "Edges compacted: no"
fi
if [ "$archive_timeline" -eq 1 ]; then
  echo "Timeline files archived (>1 year): $timeline_archived_count"
else
  echo "Timeline archival: not requested"
fi
echo "Warnings: $warning_count"
if [ "$commit_created" -eq 1 ]; then
  echo "Git commit: memory: retention $today"
else
  echo "Git commit: none"
fi

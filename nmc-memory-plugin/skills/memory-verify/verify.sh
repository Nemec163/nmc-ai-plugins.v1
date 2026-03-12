#!/usr/bin/env bash
set -euo pipefail

EXIT_CODE=0

usage() {
  echo "Usage: $0 path/to/workspace/system/memory" >&2
}

now_rfc3339() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

today_utc() {
  date -u +"%Y-%m-%d"
}

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
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

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

warn() {
  echo "warning: $*" >&2
}

resolve_meta_dir() {
  local memory_root="$1"

  if [ -d "$memory_root/core/meta" ] || [ -d "$memory_root/core" ] || [ -f "$memory_root/core/system/CANON.md" ]; then
    printf '%s\n' "$memory_root/core/meta"
  else
    printf '%s\n' "$memory_root/meta"
  fi
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

manifest_last_updated() {
  local manifest_file="$1"

  if [ ! -f "$manifest_file" ]; then
    return 0
  fi

  if command -v jq >/dev/null 2>&1; then
    jq -r '.last_updated // empty' "$manifest_file"
  else
    sed -n 's/.*"last_updated":[[:space:]]*"\([^"]*\)".*/\1/p' "$manifest_file" | head -n 1
  fi
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

list_canonical_files() {
  local memory_root="$1"
  local path

  for path in "$memory_root/core/system" "$memory_root/core/user" "$memory_root/core/agents"; do
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

write_manifest() {
  local manifest_file="$1"
  local schema="$2"
  local updated_at="$3"
  local events="$4"
  local facts="$5"
  local states="$6"
  local identities="$7"
  local competences="$8"
  local edges_count="$9"
  local checksums_file="${10}"
  local first=1
  local path checksum

  {
    printf '{\n'
    printf '  "schema_version": "%s",\n' "$(json_escape "$schema")"
    printf '  "last_updated": "%s",\n' "$(json_escape "$updated_at")"
    printf '  "record_counts": {\n'
    printf '    "events": %s,\n' "$events"
    printf '    "facts": %s,\n' "$facts"
    printf '    "states": %s,\n' "$states"
    printf '    "identities": %s,\n' "$identities"
    printf '    "competences": %s\n' "$competences"
    printf '  },\n'
    printf '  "checksums": {'

    while IFS=$'\t' read -r path checksum; do
      [ -n "$path" ] || continue
      if [ "$first" -eq 1 ]; then
        printf '\n'
        first=0
      else
        printf ',\n'
      fi
      printf '    "%s": "%s"' "$(json_escape "$path")" "$(json_escape "$checksum")"
    done < "$checksums_file"

    if [ "$first" -eq 0 ]; then
      printf '\n'
    fi

    printf '  },\n'
    printf '  "edges_count": %s\n' "$edges_count"
    printf '}\n'
  } > "$manifest_file"
}

main() {
  local memory_root meta_dir manifest_file edges_file schema updated_at today
  local last_manifest last_manifest_epoch=0 warning_count=0
  local record_list ids_raw ids_unique canonical_list checksums_list
  local edges_raw edges_valid edges_sorted
  local file relative checksum src rel dst fragment
  local events facts states identities competences edges_count meta_rel

  if [ "$#" -ne 1 ]; then
    usage
    return 1
  fi

  memory_root="${1%/}"

  if [ ! -d "$memory_root" ]; then
    echo "error: memory directory not found: $memory_root" >&2
    return 1
  fi

  meta_dir="$(resolve_meta_dir "$memory_root")"
  manifest_file="$meta_dir/manifest.json"
  edges_file="$meta_dir/graph/edges.jsonl"
  schema="$(schema_version "$memory_root")"
  updated_at="$(now_rfc3339)"
  today="$(today_utc)"

  mkdir -p "$meta_dir/graph"
  touch "$edges_file"

  record_list="$(mktemp "${TMPDIR:-/tmp}/memory-verify-records.XXXXXX")"
  ids_raw="$(mktemp "${TMPDIR:-/tmp}/memory-verify-ids-raw.XXXXXX")"
  ids_unique="$(mktemp "${TMPDIR:-/tmp}/memory-verify-ids.XXXXXX")"
  canonical_list="$(mktemp "${TMPDIR:-/tmp}/memory-verify-canonical.XXXXXX")"
  checksums_list="$(mktemp "${TMPDIR:-/tmp}/memory-verify-checksums.XXXXXX")"
  edges_raw="$(mktemp "${TMPDIR:-/tmp}/memory-verify-edges-raw.XXXXXX")"
  edges_valid="$(mktemp "${TMPDIR:-/tmp}/memory-verify-edges-valid.XXXXXX")"
  edges_sorted="$(mktemp "${TMPDIR:-/tmp}/memory-verify-edges-sorted.XXXXXX")"

  trap 'rm -f "${record_list:-}" "${ids_raw:-}" "${ids_unique:-}" "${canonical_list:-}" "${checksums_list:-}" "${edges_raw:-}" "${edges_valid:-}" "${edges_sorted:-}"' EXIT

  list_record_files "$memory_root" > "$record_list"

  if [ -s "$record_list" ]; then
    : > "$ids_raw"
    while IFS= read -r file; do
      [ -n "$file" ] || continue
      extract_record_ids "$file" >> "$ids_raw"
    done < "$record_list"
    sort -u "$ids_raw" > "$ids_unique"
  else
    : > "$ids_unique"
  fi

  events="$(awk '/^evt-/{count++} END {print count+0}' "$ids_unique")"
  facts="$(awk '/^fct-/{count++} END {print count+0}' "$ids_unique")"
  states="$(awk '/^st-/{count++} END {print count+0}' "$ids_unique")"
  identities="$(awk '/^id-/{count++} END {print count+0}' "$ids_unique")"
  competences="$(awk '/^cmp-/{count++} END {print count+0}' "$ids_unique")"

  list_canonical_files "$memory_root" > "$canonical_list"

  if [ -s "$canonical_list" ]; then
    while IFS= read -r file; do
      [ -n "$file" ] || continue
      relative="${file#$memory_root/}"
      checksum="$(sha256_file "$file")"
      printf '%s\t%s\n' "$relative" "$checksum"
    done < "$canonical_list" > "$checksums_list"
  else
    : > "$checksums_list"
  fi

  last_manifest="$(manifest_last_updated "$manifest_file")"
  if [ -n "$last_manifest" ]; then
    last_manifest_epoch="$(timestamp_to_epoch "$last_manifest" || printf '0\n')"
  fi

  : > "$edges_raw"

  if [ -s "$record_list" ]; then
    while IFS= read -r file; do
      [ -n "$file" ] || continue
      if [ "$last_manifest_epoch" -eq 0 ] || [ "$(file_mtime_epoch "$file")" -gt "$last_manifest_epoch" ]; then
        extract_links_from_file "$file" >> "$edges_raw"
      fi
    done < "$record_list"
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

  while IFS=$'\t' read -r src rel dst; do
    [ -n "${src:-}" ] || continue
    fragment=$(printf '"src":"%s","rel":"%s","dst":"%s"' "$src" "$rel" "$dst")
    if grep -Fq "$fragment" "$edges_file"; then
      continue
    fi
    printf '{"batch":"%s","src":"%s","rel":"%s","dst":"%s","at":"%s"}\n' "$today" "$src" "$rel" "$dst" "$today" >> "$edges_file"
  done < "$edges_valid"

  edges_count="$(awk 'NF {count++} END {print count+0}' "$edges_file")"
  write_manifest "$manifest_file" "$schema" "$updated_at" "$events" "$facts" "$states" "$identities" "$competences" "$edges_count" "$checksums_list"

  if ! git -C "$memory_root" rev-parse --show-toplevel >/dev/null 2>&1; then
    echo "error: memory directory is not inside a git repository" >&2
    return 1
  fi

  meta_rel="${meta_dir#$memory_root/}"
  git -C "$memory_root" add "$meta_rel"

  if ! git -C "$memory_root" diff --cached --quiet -- "$meta_rel"; then
    git -C "$memory_root" commit -m "memory: manifest update $today" >/dev/null
  fi

  if [ "$warning_count" -gt 0 ]; then
    EXIT_CODE=1
  fi
}

main "$@" || exit 2
exit "$EXIT_CODE"

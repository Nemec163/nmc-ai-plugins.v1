#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 YYYY-MM-DD [--phase extract|curate|apply|verify|all]" >&2
}

timestamp_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

epoch_now() {
  if date -u +%s >/dev/null 2>&1; then
    date -u +%s
  else
    date +%s
  fi
}

log() {
  printf '[%s] %s\n' "$(timestamp_utc)" "$*"
}

join_by() {
  local separator="$1"
  shift || true
  local item first=1

  for item in "$@"; do
    if [ "$first" -eq 1 ]; then
      printf '%s' "$item"
      first=0
    else
      printf '%s%s' "$separator" "$item"
    fi
  done
}

phase_title() {
  case "$1" in
    extract) printf '%s\n' 'Phase A — extract' ;;
    curate) printf '%s\n' 'Phase B — curate' ;;
    apply) printf '%s\n' 'Phase C — apply' ;;
    verify) printf '%s\n' 'Phase D — verify' ;;
    *) printf '%s\n' "$1" ;;
  esac
}

set_phase_status() {
  local phase="$1"
  local status="$2"

  case "$phase" in
    extract) phase_status_extract="$status" ;;
    curate) phase_status_curate="$status" ;;
    apply) phase_status_apply="$status" ;;
    verify) phase_status_verify="$status" ;;
  esac
}

get_phase_status() {
  case "$1" in
    extract) printf '%s\n' "$phase_status_extract" ;;
    curate) printf '%s\n' "$phase_status_curate" ;;
    apply) printf '%s\n' "$phase_status_apply" ;;
    verify) printf '%s\n' "$phase_status_verify" ;;
    *) printf '%s\n' 'unknown' ;;
  esac
}

resolve_plugin_root() {
  local script_dir

  script_dir="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd -- "$script_dir/../.." && pwd
}

resolve_memory_root() {
  if [ -n "${MEMORY_ROOT:-}" ]; then
    printf '%s\n' "${MEMORY_ROOT%/}"
  elif [ -d "$PWD/core/user" ] || [ -d "$PWD/core/meta" ]; then
    printf '%s\n' "$PWD"
  elif [ -d "$PWD/system/memory/core/user" ] || [ -d "$PWD/system/memory/core/meta" ]; then
    printf '%s\n' "$PWD/system/memory"
  elif [ -d "$PWD/workspace/system/memory/core/user" ] || [ -d "$PWD/workspace/system/memory/core/meta" ]; then
    printf '%s\n' "$PWD/workspace/system/memory"
  else
    printf '%s\n' "$PWD/workspace/system/memory"
  fi
}

print_summary() {
  local end_epoch duration failed_text

  end_epoch="$(epoch_now)"
  duration=$((end_epoch - pipeline_start_epoch))

  if [ -n "$failed_phase" ]; then
    failed_text="$failed_phase (exit $failed_phase_exit)"
  else
    failed_text='none'
  fi

  echo
  echo "Pipeline Summary"
  echo "Date: $pipeline_date"
  echo "Requested phases: $(join_by ', ' "${requested_phases[@]}")"
  echo "Ran phases: ${ran_phases_summary:-none}"
  echo "Succeeded phases: ${succeeded_phases_summary:-none}"
  echo "Failed phase: $failed_text"
  echo "Total duration (seconds): $duration"
  echo "Phase status:"
  echo "  extract: $(get_phase_status extract)"
  echo "  curate: $(get_phase_status curate)"
  echo "  apply: $(get_phase_status apply)"
  echo "  verify: $(get_phase_status verify)"
}

run_llm_phase() {
  local phase="$1"
  local openclaw_bin="$2"

  "$openclaw_bin" skill run "memory-$phase" --date "$pipeline_date"
}

run_verify_phase() {
  local verify_script="$1"
  local memory_root="$2"

  "$verify_script" "$memory_root"
}

date_arg=''
selected_phase='all'

while [ "$#" -gt 0 ]; do
  case "$1" in
    --phase)
      shift
      if [ "$#" -eq 0 ]; then
        echo "error: --phase requires a value" >&2
        usage
        exit 2
      fi
      selected_phase="$1"
      ;;
    --phase=*)
      selected_phase="${1#*=}"
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
      if [ -n "$date_arg" ]; then
        echo "error: unexpected extra argument: $1" >&2
        usage
        exit 2
      fi
      date_arg="$1"
      ;;
  esac
  shift
done

if [ -z "$date_arg" ]; then
  echo "error: date argument is required" >&2
  usage
  exit 2
fi

if [[ ! "$date_arg" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "error: date must be in YYYY-MM-DD format" >&2
  exit 2
fi

case "$selected_phase" in
  extract|curate|apply|verify|all) ;;
  *)
    echo "error: invalid phase: $selected_phase" >&2
    usage
    exit 2
    ;;
esac

plugin_root="$(resolve_plugin_root)"
verify_script="$plugin_root/skills/memory-verify/verify.sh"
memory_root="$(resolve_memory_root)"
openclaw_bin="${OPENCLAW_BIN:-openclaw}"
pipeline_date="$date_arg"
pipeline_start_epoch="$(epoch_now)"
failed_phase=''
failed_phase_exit=0
phase_status_extract='not-selected'
phase_status_curate='not-selected'
phase_status_apply='not-selected'
phase_status_verify='not-selected'
requested_phases=()
ran_phases=()
succeeded_phases=()
ran_phases_summary=''
succeeded_phases_summary=''

if [ "$selected_phase" = 'all' ]; then
  requested_phases=(extract curate apply verify)
else
  requested_phases=("$selected_phase")
fi

if [ ! -x "$verify_script" ]; then
  echo "error: verify script not found or not executable: $verify_script" >&2
  print_summary
  exit 2
fi

need_openclaw=0
for phase in "${requested_phases[@]}"; do
  set_phase_status "$phase" 'pending'
  case "$phase" in
    extract|curate|apply)
      need_openclaw=1
      ;;
  esac
done

if [ "$need_openclaw" -eq 1 ] && ! command -v "$openclaw_bin" >/dev/null 2>&1; then
  log "INFO OpenClaw CLI not found; printing the commands that would be run."
  for phase in "${requested_phases[@]}"; do
    case "$phase" in
      extract|curate|apply)
        printf 'would run: %s skill run memory-%s --date %s\n' "$openclaw_bin" "$phase" "$pipeline_date"
        ;;
      verify)
        printf 'would run: %s %s\n' "$verify_script" "$memory_root"
        ;;
    esac
  done
  print_summary
  exit 2
fi

for phase in "${requested_phases[@]}"; do
  phase_start_epoch="$(epoch_now)"
  log "START $(phase_title "$phase")"
  set_phase_status "$phase" 'running'
  ran_phases+=("$phase")

  if [ "$phase" = 'verify' ]; then
    if run_verify_phase "$verify_script" "$memory_root"; then
      phase_exit=0
    else
      phase_exit=$?
    fi
  else
    if run_llm_phase "$phase" "$openclaw_bin"; then
      phase_exit=0
    else
      phase_exit=$?
    fi
  fi

  phase_duration=$(( $(epoch_now) - phase_start_epoch ))

  if [ "$phase_exit" -ne 0 ]; then
    failed_phase="$phase"
    failed_phase_exit="$phase_exit"
    set_phase_status "$phase" "failed (exit $phase_exit)"
    ran_phases_summary="$(join_by ', ' "${ran_phases[@]}")"
    succeeded_phases_summary="$(join_by ', ' "${succeeded_phases[@]}")"
    log "FAIL $(phase_title "$phase") (exit $phase_exit, ${phase_duration}s)"
    print_summary
    exit 1
  fi

  succeeded_phases+=("$phase")
  set_phase_status "$phase" "success (${phase_duration}s)"
  log "END $(phase_title "$phase") (success, ${phase_duration}s)"
done

ran_phases_summary="$(join_by ', ' "${ran_phases[@]}")"
succeeded_phases_summary="$(join_by ', ' "${succeeded_phases[@]}")"
print_summary
exit 0

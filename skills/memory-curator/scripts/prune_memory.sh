#!/usr/bin/env bash
set -euo pipefail

mode="${1:-both}"
openclaw nmc-mem prune --mode "$mode" --json

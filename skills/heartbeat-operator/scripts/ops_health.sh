#!/usr/bin/env bash
set -euo pipefail

openclaw nmc-ops health --json
openclaw nmc-agent list --json
openclaw nmc-mem stats --json

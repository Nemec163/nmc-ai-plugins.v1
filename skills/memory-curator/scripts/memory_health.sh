#!/usr/bin/env bash
set -euo pipefail

openclaw nmc-mem stats --json
openclaw nmc-mem quality --json
openclaw nmc-mem doctor --json

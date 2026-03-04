#!/usr/bin/env bash
set -euo pipefail

openclaw nmc-agent list --json
openclaw nmc-agent doctor --json

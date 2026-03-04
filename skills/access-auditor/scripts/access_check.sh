#!/usr/bin/env bash
set -euo pipefail

openclaw nmc-agent list --json | sed -n '1,200p'

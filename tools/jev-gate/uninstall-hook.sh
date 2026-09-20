#!/usr/bin/env bash
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
rm -f "$ROOT/.git/hooks/pre-commit"
echo "Off. Commits no longer run the gate."

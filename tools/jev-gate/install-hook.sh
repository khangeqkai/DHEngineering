#!/usr/bin/env bash
# Turns on the automatic check before every commit. Undo with uninstall-hook.sh
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cp "$ROOT/tools/jev-gate/hooks/pre-commit" "$ROOT/.git/hooks/pre-commit"
chmod +x "$ROOT/.git/hooks/pre-commit"
echo "On. Every commit now runs the gate first. Bypass a single commit with: git commit --no-verify"

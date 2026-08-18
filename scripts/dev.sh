#!/usr/bin/env bash
# One-command local run: install (if needed), build the workspace, then boot the web wizard.
# Thin wrapper over the same pnpm commands documented in README.md's Quickstart — no logic here
# that isn't already there, just fewer commands to type.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ ! -d node_modules ]; then
  echo "==> Installing dependencies (pnpm install)"
  pnpm install
fi

echo "==> Building the workspace (pnpm build)"
pnpm build

echo "==> Starting the web wizard (pnpm dev)"
exec pnpm dev

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

export CI=true

pnpm run build

STANDALONE_ROOT="$ROOT_DIR/release/standalone"
rm -rf "$STANDALONE_ROOT"
mkdir -p "$STANDALONE_ROOT/.next"

cp -R .next/standalone/. "$STANDALONE_ROOT/"
cp -R .next/static "$STANDALONE_ROOT/.next/static"
cp -R public "$STANDALONE_ROOT/public"
cp -f package.json "$STANDALONE_ROOT/package.json"

if [[ -f .next/BUILD_ID ]]; then
  cp -f .next/BUILD_ID "$STANDALONE_ROOT/public/BUILD_ID"
fi

for env_file in .env*; do
  if [[ -f "$env_file" ]]; then
    cp -f "$env_file" "$STANDALONE_ROOT/$env_file"
  fi
done

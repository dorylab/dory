#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WEB_DIR="${ROOT_DIR}/apps/web"

cd "${ROOT_DIR}"

echo "Running build..."
yarn run build

STANDALONE_SRC="${WEB_DIR}/.next/standalone"
STANDALONE_WEB_SRC="${STANDALONE_SRC}/apps/web"
OUT_DIR="${ROOT_DIR}/release/standalone"
OUT_WEB_DIR="${OUT_DIR}/apps/web"

if [[ ! -d "${STANDALONE_SRC}" ]]; then
  echo "Error: standalone output not found: ${STANDALONE_SRC}" >&2
  exit 1
fi

if [[ ! -f "${STANDALONE_WEB_SRC}/server.js" ]]; then
  echo "Error: standalone server.js not found: ${STANDALONE_WEB_SRC}/server.js" >&2
  exit 1
fi

rm -rf "${OUT_DIR}"
mkdir -p "${OUT_WEB_DIR}"

# 1) root node_modules
if [[ -d "${STANDALONE_SRC}/node_modules" ]]; then
  cp -a "${STANDALONE_SRC}/node_modules" "${OUT_DIR}/node_modules"
fi

# 2) apps/web required files
cp -f "${STANDALONE_WEB_SRC}/server.js" "${OUT_WEB_DIR}/server.js"
cp -f "${WEB_DIR}/package.json" "${OUT_WEB_DIR}/package.json"

# Optional .env files
if [[ -f "${STANDALONE_WEB_SRC}/.env" ]]; then
  cp -f "${STANDALONE_WEB_SRC}/.env" "${OUT_WEB_DIR}/.env"
fi
if [[ -f "${STANDALONE_WEB_SRC}/.env.local" ]]; then
  cp -f "${STANDALONE_WEB_SRC}/.env.local" "${OUT_WEB_DIR}/.env.local"
fi

# 3) apps/web/.next
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "${STANDALONE_WEB_SRC}/.next/" "${OUT_WEB_DIR}/.next/"
  if [[ -d "${WEB_DIR}/.next/static" ]]; then
    rsync -a --delete "${WEB_DIR}/.next/static/" "${OUT_WEB_DIR}/.next/static/"
  fi
else
  mkdir -p "${OUT_WEB_DIR}/.next"
  cp -R "${STANDALONE_WEB_SRC}/.next/." "${OUT_WEB_DIR}/.next/"
  if [[ -d "${WEB_DIR}/.next/static" ]]; then
    mkdir -p "${OUT_WEB_DIR}/.next/static"
    cp -R "${WEB_DIR}/.next/static/." "${OUT_WEB_DIR}/.next/static/"
  fi
fi

# 4) apps/web/public
if [[ -d "${WEB_DIR}/public" ]]; then
  cp -a "${WEB_DIR}/public" "${OUT_WEB_DIR}/public"
fi

# 5) apps/web/dist-scripts (if exists)
if [[ -d "${WEB_DIR}/dist-scripts" ]]; then
  cp -a "${WEB_DIR}/dist-scripts" "${OUT_WEB_DIR}/dist-scripts"
fi

echo "Output ready: ${OUT_DIR}"
echo "Included top-level entries:"
ls -1A "${OUT_DIR}"
echo "Included apps/web entries:"
ls -1A "${OUT_WEB_DIR}"

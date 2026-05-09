#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WEB_DIR="${ROOT_DIR}/apps/web"
ELECTRON_DIR="${ROOT_DIR}/apps/electron"

cd "${ROOT_DIR}"

echo "Running build..."
yarn run build

STANDALONE_SRC="${WEB_DIR}/.next/standalone"
STANDALONE_WEB_SRC="${STANDALONE_SRC}/apps/web"
OUT_DIR="${ROOT_DIR}/release/standalone"
OUT_WEB_DIR="${OUT_DIR}/apps/web"
OUT_WEB_NEXT_NODE_MODULES_DIR="${OUT_WEB_DIR}/.next/node_modules"
OUT_WEB_NODE_MODULES_DIR="${OUT_WEB_DIR}/node_modules"

copy_node_package_to_standalone() {
  local package_name="$1"
  local source_dir="${ROOT_DIR}/node_modules/${package_name}"

  if [[ ! -d "${source_dir}" ]]; then
    return
  fi

  for target_node_modules_dir in "${OUT_DIR}/node_modules" "${OUT_WEB_NODE_MODULES_DIR}"; do
    mkdir -p "$(dirname "${target_node_modules_dir}/${package_name}")"
    rm -rf "${target_node_modules_dir:?}/${package_name}"
    cp -a "${source_dir}" "${target_node_modules_dir}/${package_name}"
  done
}

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

# Next standalone's server.js resolves packages like "next" relative to apps/web,
# so keep a colocated node_modules copy under apps/web for packaged Electron builds.
if [[ -d "${STANDALONE_SRC}/node_modules" ]]; then
  cp -a "${STANDALONE_SRC}/node_modules" "${OUT_WEB_NODE_MODULES_DIR}"
fi

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

if [[ -d "${ROOT_DIR}/node_modules/@duckdb" ]]; then
  echo "Overlaying full DuckDB native packages into standalone output..."
  while IFS= read -r -d '' duckdb_package_dir; do
    copy_node_package_to_standalone "@duckdb/$(basename "${duckdb_package_dir}")"
  done < <(find "${ROOT_DIR}/node_modules/@duckdb" -mindepth 1 -maxdepth 1 -type d -print0)
fi

BETTER_SQLITE3_DIR="${OUT_DIR}/node_modules/better-sqlite3"
if [[ -d "${BETTER_SQLITE3_DIR}" ]]; then
  ROOT_BETTER_SQLITE3_DIR="${ROOT_DIR}/node_modules/better-sqlite3"
  ELECTRON_VERSION="$(node -e "const fs=require('node:fs'); const pkg=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); const version=pkg.devDependencies?.electron || pkg.dependencies?.electron || ''; process.stdout.write(String(version).replace(/^[^0-9]*/, ''));" "${ELECTRON_DIR}/package.json")"
  TARGET_ARCH="${DORY_BUILD_ARCH:-}"
  PREBUILD_INSTALL_BIN="${ROOT_DIR}/node_modules/.bin/prebuild-install"

  # Next standalone keeps only runtime files for externals, but rebuilding the native
  # addon for Electron requires the package sources and binding.gyp from the full install.
  if [[ -d "${ROOT_BETTER_SQLITE3_DIR}" ]] && [[ ! -f "${BETTER_SQLITE3_DIR}/binding.gyp" ]]; then
    echo "Overlaying full better-sqlite3 package into standalone output..."
    rm -rf "${BETTER_SQLITE3_DIR}"
    cp -a "${ROOT_BETTER_SQLITE3_DIR}" "${BETTER_SQLITE3_DIR}"
  fi

  if [[ -n "${ELECTRON_VERSION}" ]]; then
    PREBUILD_ARGS=(
      --runtime=electron
      --target="${ELECTRON_VERSION}"
      --dist-url=https://electronjs.org/headers
      --verbose
    )
    REBUILD_ARGS=(
      better-sqlite3
      --build-from-source
      --runtime=electron
      --target="${ELECTRON_VERSION}"
      --dist-url=https://electronjs.org/headers
    )
    if [[ -n "${TARGET_ARCH}" ]]; then
      PREBUILD_ARGS+=(--arch="${TARGET_ARCH}")
      REBUILD_ARGS+=(--arch="${TARGET_ARCH}")
    fi

    echo "Resolving better-sqlite3 for Electron ${ELECTRON_VERSION}${TARGET_ARCH:+ (${TARGET_ARCH})}..."
    (
      cd "${BETTER_SQLITE3_DIR}"

      if [[ -x "${PREBUILD_INSTALL_BIN}" ]]; then
        echo "Trying prebuilt better-sqlite3 binary..."
        if "${PREBUILD_INSTALL_BIN}" "${PREBUILD_ARGS[@]}"; then
          echo "Using prebuilt better-sqlite3 binary."
          exit 0
        fi
      fi

      echo "No prebuilt better-sqlite3 binary available, falling back to rebuild..."
      cd "${OUT_DIR}"
      npm rebuild "${REBUILD_ARGS[@]}"
    )
  fi
fi

if [[ -d "${OUT_WEB_NEXT_NODE_MODULES_DIR}" ]]; then
  while IFS= read -r -d '' traced_link; do
    if [[ -L "${traced_link}" ]]; then
      traced_target="$(readlink "${traced_link}")"
      traced_target_path="$(node -e "const path=require('node:path'); process.stdout.write(path.resolve(process.argv[1], process.argv[2]));" "$(dirname "${traced_link}")" "${traced_target}")"

      if [[ ! -e "${traced_target_path}" ]]; then
        echo "Error: traced dependency target not found for ${traced_link} -> ${traced_target}" >&2
        exit 1
      fi

      echo "Materializing $(basename "${traced_link}") in apps/web/.next/node_modules..."
      rm -f "${traced_link}"
      cp -a "${traced_target_path}" "${traced_link}"
    fi
  done < <(find "${OUT_WEB_NEXT_NODE_MODULES_DIR}" -type l -print0)
fi

echo "Output ready: ${OUT_DIR}"
echo "Included top-level entries:"
ls -1A "${OUT_DIR}"
echo "Included apps/web entries:"
ls -1A "${OUT_WEB_DIR}"

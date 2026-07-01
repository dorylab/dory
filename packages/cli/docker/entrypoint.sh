#!/bin/sh
set -eu

if [ "$#" -gt 0 ]; then
    exec "$@"
fi

DORY_DATA="${DORY_DATA:-standalone}"
DORY_HOST="${DORY_HOST:-0.0.0.0}"
DORY_PORT="${DORY_PORT:-3318}"

if [ -z "${DORY_MCP_TOKEN:-}" ]; then
    echo "DORY_MCP_TOKEN is required for the Dory headless HTTP MCP endpoint." >&2
    exit 1
fi

case "$DORY_DATA" in
    standalone)
        mkdir -p "$HOME/.dory"
        exec dory mcp serve \
            --http \
            --data standalone \
            --host "$DORY_HOST" \
            --port "$DORY_PORT" \
            --allow-remote \
            --token "$DORY_MCP_TOKEN"
        ;;
    self-hosted)
        if [ -z "${DATABASE_URL:-}" ]; then
            echo "DATABASE_URL is required when DORY_DATA=self-hosted." >&2
            exit 1
        fi
        if [ -z "${DS_SECRET_KEY:-}" ]; then
            echo "DS_SECRET_KEY is required when DORY_DATA=self-hosted." >&2
            exit 1
        fi
        if [ -z "${BETTER_AUTH_SECRET:-}" ]; then
            echo "BETTER_AUTH_SECRET is required when DORY_DATA=self-hosted." >&2
            exit 1
        fi
        exec dory mcp serve \
            --http \
            --data self-hosted \
            --database-url "$DATABASE_URL" \
            --host "$DORY_HOST" \
            --port "$DORY_PORT" \
            --allow-remote \
            --token "$DORY_MCP_TOKEN"
        ;;
    *)
        echo "Unsupported DORY_DATA value: $DORY_DATA. Expected standalone or self-hosted." >&2
        exit 1
        ;;
esac

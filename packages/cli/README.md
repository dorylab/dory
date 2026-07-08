# Dory CLI / Dory Headless Runtime

`@getdory/cli` runs Dory without the desktop client. It is the standalone entrypoint for MCP servers, automation, local runtime services, and direct Dory Action execution.

For the user-facing MCP setup guide, start with [`docs/mcp.md`](../../docs/mcp.md). This README is the package reference.

## Requirements

- Node.js 20 or newer for user installs.
- Linux, macOS, or Windows with npm available.
- Network access during install for native database driver packages.

Repository development follows the root `package.json` engine requirement, currently Node.js 24.x.

This beta ships the full Dory database driver set. Install can compile or download native packages for PGlite, DuckDB, SQLite, Oracle, MySQL, and Postgres support. If install fails, confirm your Node version first, then check whether your platform has the build tools required by the failing native package.

## Install

Run without installing globally:

```sh
npx -y @getdory/cli --help
```

Install globally when running Dory as a long-lived server:

```sh
npm install -g @getdory/cli
dory --help
```

## Quick Start

Standalone mode stores Dory state under `~/.dory` and is the default mode for Linux servers, CI, and shared automation hosts.

### Local stdio MCP

Use stdio when the MCP client runs on the same machine as Dory. The client starts and stops `dory mcp serve --stdio` itself, so you do not need to keep a terminal open.

```sh
npx -y @getdory/cli init --data standalone
npx -y @getdory/cli doctor --data standalone

codex mcp add dory -- npx -y @getdory/cli mcp serve --stdio --data standalone
codex mcp list
```

Claude Code:

```sh
claude mcp add dory -- npx -y @getdory/cli mcp serve --stdio --data standalone
claude mcp list
```

### Local HTTP MCP

Use HTTP when you need a stable endpoint URL or a long-running runtime service. HTTP MCP requires bearer token authentication.

```sh
export DORY_MCP_TOKEN="$(
  npx -y @getdory/cli mcp token create \
    --data standalone \
    --name "local-http" \
    --scope read | jq -r '.token'
)"

npx -y @getdory/cli mcp serve \
  --http \
  --host 127.0.0.1 \
  --port 3318 \
  --token "$DORY_MCP_TOKEN" \
  --data standalone
```

The endpoint is:

```text
http://127.0.0.1:3318/api/mcp
```

Codex CLI:

```sh
codex mcp add \
  --url http://127.0.0.1:3318/api/mcp \
  --bearer-token-env-var DORY_MCP_TOKEN \
  dory
```

Claude Code:

```sh
claude mcp add \
  --transport http \
  dory \
  http://127.0.0.1:3318/api/mcp \
  --header "Authorization: Bearer $DORY_MCP_TOKEN"
```

## Command Reference

### General

```sh
dory --help
dory --version
dory init --data standalone|desktop|self-hosted
dory doctor --data standalone|desktop|self-hosted
```

`doctor` checks the selected storage path, secrets, migrations, identity, MCP token count, and connection count.

### Storage

```sh
dory storage detect --data standalone|desktop|self-hosted
dory storage doctor --data standalone|desktop|self-hosted
```

Data modes:

- `standalone`: independent Dory app storage under `~/.dory`. This is the recommended headless server mode.
- `desktop`: use Dory Desktop local data through the Dory Local Runtime. If Desktop is already running, the CLI connects to it; otherwise the CLI starts a local runtime.
- `self-hosted`: use a self-hosted Dory Web Postgres app database.

Self-hosted mode must use the same secrets as the Web deployment:

```sh
DS_SECRET_KEY="same-as-web" \
BETTER_AUTH_SECRET="same-as-web" \
dory mcp serve \
  --stdio \
  --data self-hosted \
  --database-url "$DATABASE_URL"
```

If `DS_SECRET_KEY` or `BETTER_AUTH_SECRET` do not match the Web deployment, encrypted connection secrets and auth-backed data will not be readable.

Storage overrides:

```sh
--user-data-dir <path>    Override Electron/headless userData directory
--pglite-path <path>      Override PGlite app storage path
--database-url <url>      Use Postgres for self-hosted Dory app storage
```

### MCP Serve

```sh
dory mcp serve --stdio --data desktop|standalone|self-hosted
dory mcp serve --http --host 127.0.0.1 --port 3318 --data desktop|standalone|self-hosted
dory mcp serve --http --host 0.0.0.0 --allow-remote --token <existing-token> --data standalone
```

HTTP listens on `127.0.0.1` by default and requires bearer token authentication. In local PGlite modes, the CLI starts a small HTTP proxy that forwards MCP traffic to the Dory Local Runtime, so PGlite is still only opened by one process.

Remote binds require an existing token and explicit opt-in:

```sh
dory mcp serve \
  --http \
  --host 0.0.0.0 \
  --port 3318 \
  --allow-remote \
  --token "$DORY_MCP_TOKEN" \
  --data standalone
```

Do not expose the plain HTTP server directly to the public internet. Put it behind TLS.

### MCP Tokens

```sh
dory mcp token create [--name <name>] [--scope <scope>] --data desktop|standalone|self-hosted
dory mcp token list --data desktop|standalone|self-hosted
dory mcp token revoke --id <token-id> --data desktop|standalone|self-hosted
```

`mcp token create` prints JSON. Copy the `token` value into `DORY_MCP_TOKEN` for HTTP clients.

When `--scope` is omitted, Dory creates a local token with `read`, `write`, and `local_ai:run`. Use `--scope read` for read-only clients. Use `--scope write` only for trusted clients that need create, update, or delete capabilities.

### Hosted Dory Bridge

Use these commands when a hosted or self-hosted Dory Web deployment exposes `/api/mcp` and the local MCP client needs a stdio bridge:

```sh
dory mcp login --url <dory-origin>
dory mcp status --url <dory-origin>
dory mcp bridge --url <dory-origin>
dory mcp logout --url <dory-origin>
```

Codex CLI:

```sh
codex mcp add dory-hosted -- npx -y @getdory/cli mcp bridge --url https://your-dory-host
codex mcp list
```

Claude Code:

```sh
claude mcp add dory-hosted -- npx -y @getdory/cli mcp bridge --url https://your-dory-host
claude mcp list
```

### Runtime Service

```sh
dory runtime install
dory runtime install --codex-agent --url <dory-origin>
dory runtime install --mcp-http --host 127.0.0.1 --port 3318
dory runtime install --codex-agent --url <dory-origin> --mcp-http --host 0.0.0.0 --allow-remote --token <existing-token>
dory runtime run
dory runtime status
dory runtime restart
dory runtime stop
dory runtime uninstall
```

Install a background HTTP MCP endpoint:

```sh
dory runtime install \
  --mcp-http \
  --host 127.0.0.1 \
  --port 3318 \
  --token "$DORY_MCP_TOKEN" \
  --data standalone

dory runtime status --data standalone
```

The token is stored in the runtime service config with file mode `0600`; it is not placed in the launchd plist, systemd unit, or process command line.

For troubleshooting, run the runtime in the foreground:

```sh
dory runtime run --data standalone
```

### Dory Actions

Run Dory Actions directly through the same Action layer exposed to agents:

```sh
dory action list --data desktop|standalone|self-hosted
dory action describe <action-id> --data desktop|standalone|self-hosted
dory action <action-id> --json '<json>' --data desktop|standalone|self-hosted
dory action <action-id> --input input.json --data desktop|standalone|self-hosted
```

Read example:

```sh
npx -y @getdory/cli action connection.list --data standalone --projection mcp --json '{}'
```

Write and destructive Actions require explicit CLI confirmation:

```sh
npx -y @getdory/cli action connection.create \
  --data standalone \
  --yes \
  --json '{
    "payload": {
      "connection": {
        "type": "postgres",
        "engine": "postgres",
        "name": "Local Postgres",
        "host": "127.0.0.1",
        "port": 5432,
        "database": "postgres"
      },
      "identities": [
        {
          "name": "Default",
          "username": "postgres",
          "password": "postgres",
          "isDefault": true,
          "database": "postgres",
          "enabled": true
        }
      ]
    }
  }'
```

## MCP Tools and Actions

Dory MCP exposes workflow tools plus read/write Action transports:

- `dory_create_work`
- `dory_finish_work`
- `dory_read`
- `dory_write`
- `dory_list_connections`
- `dory_explore_schema`
- `dory_run_readonly_sql`
- `dory_workspace_tabs`
- `dory_saved_queries`

For database analysis, call `dory_create_work` first and pass the returned `work.workId` to work-scoped tools such as `dory_list_connections`, `dory_explore_schema`, and `dory_run_readonly_sql`. Use `dory_finish_work` to save findings and execution steps.

Use `dory_read` for read-only or low-risk Actions such as `connection.list`, `connection.test`, and schema exploration. Use `dory_write` for create, update, or delete Actions such as `connection.create`, `connection.update`, and `connection.delete`. Do not expect one MCP tool per business operation.

`dory_run_readonly_sql` only allows read-only SQL against the target database. It still writes Dory workspace metadata, Agent Run context, SQL tabs, and result snapshots.

## Docker Headless Runtime

Use `dorylab/dory-headless` when you want the CLI/MCP runtime without the Dory Web UI. It exposes MCP over HTTP at `/api/mcp`.

The headless image is for agents and automation only. If you need the browser UI, run the `dorylab/dory` Web image and use `dorylab/dory-headless` only as an MCP/runtime companion.

Published tags are `latest`, `vX.Y.Z`, `sha-<shortsha>`, and `test`.

Create a standalone token once, using the same persisted volume that the container will use:

```sh
docker run --rm \
  -v dory-headless-data:/data/.dory \
  dorylab/dory-headless:latest \
  dory mcp token create --data standalone --name docker
```

Then run the HTTP endpoint:

```sh
export DORY_MCP_TOKEN="dory_mcp_..."

docker run --rm \
  -p 3318:3318 \
  -v dory-headless-data:/data/.dory \
  -e DORY_MCP_TOKEN="$DORY_MCP_TOKEN" \
  dorylab/dory-headless:latest
```

The endpoint is:

```text
http://127.0.0.1:3318/api/mcp
```

Runtime environment:

- `DORY_MCP_TOKEN` is required.
- `DORY_DATA` defaults to `standalone`; set `self-hosted` to share Web Postgres storage.
- `DORY_HOST` defaults to `0.0.0.0`.
- `DORY_PORT` defaults to `3318`.
- `DATABASE_URL`, `DS_SECRET_KEY`, and `BETTER_AUTH_SECRET` are required when `DORY_DATA=self-hosted`.

For public deployments, terminate TLS in front of the container instead of exposing cleartext HTTP directly.

## Security Notes

- HTTP MCP requires bearer token authentication.
- `read` scope can read Dory connections, schemas, saved queries, query-oriented metadata, and related low-risk Actions according to the user's organization permissions.
- `write` scope covers create, update, and delete operations. It can satisfy destructive Action scope checks, so grant it only to trusted MCP clients.
- Remote binds require `--host 0.0.0.0`, `--allow-remote`, and an existing token.
- Use stdio for local-only setups when you do not want to store a bearer token in an MCP client config.

## Troubleshooting

- `Unsupported engine`: install Node.js 20 or newer.
- `crypto is not defined`: the process is running on an unsupported Node.js version. Upgrade to Node.js 20 or newer.
- Native package install failure: install platform build tools, upgrade Node.js, or retry on Node.js 22.
- `--data self-hosted requires DS_SECRET_KEY`: export the same `DS_SECRET_KEY` and `BETTER_AUTH_SECRET` used by your Dory Web deployment.
- `No desktop auth snapshot`: open Dory Desktop once, or pass `--user-data-dir` for the active Desktop profile.
- `Missing MCP bearer token`: set `DORY_MCP_TOKEN` and configure the MCP client to send it.

## Update and Uninstall

Update a global install:

```sh
npm install -g @getdory/cli@latest
```

Uninstall a global install:

```sh
npm uninstall -g @getdory/cli
```

Remove standalone data only when you no longer need local Dory state:

```sh
rm -rf ~/.dory
```

## Release Smoke

Before publishing:

```sh
yarn workspace @getdory/cli pack:smoke
```

The smoke test builds the package, packs it, installs it into a clean temporary npm project, checks `dory --help`, runs `action list --data standalone`, starts stdio MCP, and verifies `tools/list`.

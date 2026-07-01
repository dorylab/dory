# Dory CLI / Dory Headless Runtime

`@getdory/cli` runs Dory without the desktop client. It is the standalone entrypoint for MCP servers, automation, and direct Dory Action execution.

## Requirements

- Node.js 20 or newer.
- Linux, macOS, or Windows with npm available.
- Network access during install for native database driver packages.

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

```sh
npx -y @getdory/cli init --data standalone
npx -y @getdory/cli doctor --data standalone
npx -y @getdory/cli mcp token create --data standalone --name "server"
npx -y @getdory/cli mcp serve --stdio --data standalone
```

Run a local HTTP MCP endpoint:

```sh
npx -y @getdory/cli mcp token create --data standalone --name "local-http"

export DORY_MCP_TOKEN="dory_mcp_..."

npx -y @getdory/cli mcp serve \
  --http \
  --host 127.0.0.1 \
  --port 3318 \
  --token "$DORY_MCP_TOKEN" \
  --data standalone
```

The HTTP endpoint is:

```text
http://127.0.0.1:3318/api/mcp
```

`mcp token create` prints JSON. Copy the `token` value into `DORY_MCP_TOKEN`.
When `--scope` is omitted, Dory creates a local token with `read`, `write`, and `local_ai:run`. Use `--scope read` for read-only clients.

Add the HTTP endpoint to Codex CLI:

```sh
export DORY_MCP_TOKEN="dory_mcp_..."

codex mcp add \
  --url http://127.0.0.1:3318/api/mcp \
  --bearer-token-env-var DORY_MCP_TOKEN \
  dory

codex mcp list
```

For local stdio instead of HTTP:

```sh
codex mcp add dory -- npx -y @getdory/cli mcp serve --stdio --data standalone
codex mcp list
```

Run Dory Actions directly:

```sh
npx -y @getdory/cli action list --data standalone
npx -y @getdory/cli action describe connection.create --data standalone
npx -y @getdory/cli action connection.list --data standalone --projection mcp --json '{}'
```

Create or update local state through the same Action layer. For example, create a connection in headless mode:

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

Dory MCP exposes a small set of high-level tools for data work, plus read/write Action transports:

- `dory_list_connections`
- `dory_explore_schema`
- `dory_run_readonly_sql`
- `dory_saved_queries`
- `dory_workspace_tabs`
- `dory_create_work`
- `dory_finish_work`
- `dory_read`
- `dory_write`

Use `dory_read` for read-only or low-risk Actions such as `connection.list`, `connection.test`, and schema exploration. Use `dory_write` for create, update, or delete Actions such as `connection.create`, `connection.update`, and `connection.delete`. Do not expect one MCP tool per business operation.

For example, connection setup goes through `dory_write`:

```json
{
  "operation": "run",
  "actionId": "connection.create",
  "input": {
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
  },
  "projection": "mcp"
}
```

Before running an Action from an agent, ask Dory to describe it:

```json
{
  "operation": "describe",
  "actionId": "connection.create"
}
```

Only Actions that are exposed to the `mcp` actor and allowed by the token scopes are available through `dory_read` or `dory_write`. Most users only need `read` and `write`; `write` covers create, update, and delete operations, while write tokens can also call read operations through `dory_read`. MCP client approval is treated as confirmation for destructive Dory Actions.

## Connect Local Codex Agent

Dory Web can run Codex on this device through the CLI. Run this once on the device where Codex CLI is installed:

```sh
npx -y @getdory/cli runtime install --codex-agent --url https://your-dory-host
```

The command authorizes Dory, installs one background Dory Local Runtime service, and enables the Codex agent capability inside it. When Dory sends a job to the runtime, it runs `codex exec` with Dory MCP tools enabled.

Manage the background service:

```sh
dory runtime status
dory runtime restart
dory runtime stop
dory runtime uninstall
```

For troubleshooting, run the worker in the foreground:

```sh
dory runtime run --codex-agent --url https://your-dory-host
```

The Dory MCP bearer token is passed through an environment variable and is not written into the Codex command arguments.

## Data Modes

- `standalone`: independent Dory app storage under `~/.dory`. This is the recommended headless server mode.
- `desktop`: use Dory Desktop local data through the Dory Local Runtime. If Desktop is already running, the CLI connects to it; otherwise the CLI starts a local runtime.
- `self-hosted`: use a self-hosted Dory Web Postgres app database.

Use `doctor` before serving MCP to confirm the selected storage path, secrets, migrations, identity, token count, and connection count:

```sh
npx -y @getdory/cli doctor --data standalone
```

Self-hosted mode must use the same secrets as the Web deployment:

```sh
DS_SECRET_KEY="same-as-web" \
BETTER_AUTH_SECRET="same-as-web" \
npx -y @getdory/cli mcp serve \
  --stdio \
  --data self-hosted \
  --database-url "$DATABASE_URL"
```

If `DS_SECRET_KEY` or `BETTER_AUTH_SECRET` do not match the Web deployment, encrypted connection secrets and auth-backed data will not be readable.

## HTTP Security

HTTP MCP listens on `127.0.0.1` by default and requires bearer token authentication. In local PGlite modes, the CLI starts a small HTTP proxy that forwards MCP traffic to the Dory Local Runtime, so PGlite is still only opened by one process.

For local-only testing you can omit `--token`; the CLI will create one and print it to stderr. For repeatable setup, shared endpoints, or remote endpoints, create a token first:

```sh
npx -y @getdory/cli mcp token create \
  --data standalone \
  --name "mcp-http" \
  --scope read
```

To let a remote MCP client run write Actions such as `connection.create`, create a token with the user-facing `write` scope:

```sh
npx -y @getdory/cli mcp token create \
  --data standalone \
  --name "mcp-action-writer" \
  --scope write
```

Remote binds require an existing token and an explicit opt-in:

```sh
npx -y @getdory/cli mcp serve \
  --http \
  --host 0.0.0.0 \
  --port 3318 \
  --allow-remote \
  --token "$DORY_MCP_TOKEN" \
  --data standalone
```

Do not expose the plain HTTP server directly to the public internet. Put it behind TLS.

Install the same HTTP endpoint as the background runtime service:

```sh
dory runtime install \
  --mcp-http \
  --host 0.0.0.0 \
  --port 3318 \
  --allow-remote \
  --token "$DORY_MCP_TOKEN" \
  --data standalone
```

The token is stored in the runtime service config with file mode `0600`; it is not placed in the launchd plist, systemd unit, or process command line.

Codex agent and HTTP MCP can be enabled together on the same service:

```sh
dory runtime install \
  --codex-agent \
  --url https://your-dory-host \
  --mcp-http \
  --host 0.0.0.0 \
  --port 3318 \
  --allow-remote \
  --token "$DORY_MCP_TOKEN" \
  --data standalone
```

Nginx example:

```nginx
server {
    listen 443 ssl;
    server_name dory-mcp.example.com;

    ssl_certificate /etc/letsencrypt/live/dory-mcp.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dory-mcp.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3318;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Caddy example:

```caddy
dory-mcp.example.com {
    reverse_proxy 127.0.0.1:3318
}
```

## Linux Server Deployment

Use the built-in runtime service installer for long-running Linux hosts. It creates the `dory-runtime.service` user service and runs one Dory Local Runtime process:

```sh
npm install -g @getdory/cli@latest

dory mcp token create \
  --data standalone \
  --name "server-http" \
  --scope write

export DORY_MCP_TOKEN="dory_mcp_..."

dory runtime install \
  --mcp-http \
  --host 127.0.0.1 \
  --port 3318 \
  --token "$DORY_MCP_TOKEN" \
  --data standalone

dory runtime status --data standalone
```

For a remote endpoint, bind to `0.0.0.0` only with an explicit token and `--allow-remote`, then put TLS in front of it:

```sh
dory runtime install \
  --mcp-http \
  --host 0.0.0.0 \
  --port 3318 \
  --allow-remote \
  --token "$DORY_MCP_TOKEN" \
  --data standalone
```

Docker example:

```Dockerfile
FROM node:22-bookworm-slim
ENV HOME=/data
ENV DORY_MCP_TOKEN=replace-with-an-existing-token
VOLUME ["/data/.dory"]
EXPOSE 3318
CMD ["sh", "-lc", "npx -y @getdory/cli mcp serve --http --data standalone --host 0.0.0.0 --port 3318 --allow-remote --token \"$DORY_MCP_TOKEN\""]
```

Run it:

```sh
docker build -t dory-headless .
docker run --rm -v dory-data:/data/.dory -e HOME=/data node:22-bookworm-slim \
  npx -y @getdory/cli mcp token create --data standalone --name docker
docker run --rm -p 3318:3318 -v dory-data:/data/.dory -e DORY_MCP_TOKEN="$DORY_MCP_TOKEN" dory-headless
```

For public Docker deployments, terminate TLS in front of the container instead of exposing cleartext HTTP directly.

## Desktop Data Source

Use Desktop data only when you want the CLI to read connections, tabs, saved queries, and tokens already stored by Dory Desktop:

```sh
npx -y @getdory/cli doctor --data desktop
npx -y @getdory/cli mcp serve --stdio --data desktop
```

Desktop mode connects through the Dory Local Runtime, so Desktop, CLI, MCP, and runtime capabilities reuse the same local PGlite owner instead of opening the PGlite directory independently.

When the Dory Desktop app is open, CLI commands connect to the existing Desktop runtime. When it is closed, CLI commands can start or use the local runtime directly, so stdio MCP and Action commands can still work against Desktop data.

## Hosted Dory Bridge

For hosted Dory Web MCP endpoints, use:

```sh
npx -y @getdory/cli mcp login --url https://your-dory-host
npx -y @getdory/cli mcp status --url https://your-dory-host
npx -y @getdory/cli mcp bridge --url https://your-dory-host
```

Add the hosted bridge to Codex CLI as a stdio MCP server:

```sh
codex mcp add dory-hosted -- npx -y @getdory/cli mcp bridge --url https://your-dory-host
codex mcp list
```

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

## Troubleshooting

- `Unsupported engine`: install Node.js 20 or newer.
- `crypto is not defined`: the process is running on an unsupported Node.js version. Upgrade to Node.js 20 or newer.
- Native package install failure: install platform build tools, upgrade Node.js, or retry on Node.js 22.
- `--data self-hosted requires DS_SECRET_KEY`: export the same `DS_SECRET_KEY` and `BETTER_AUTH_SECRET` used by your Dory Web deployment.
- `No desktop auth snapshot`: open Dory Desktop once, or pass `--user-data-dir` for the active Desktop profile.

## Release Smoke

Before publishing:

```sh
yarn workspace @getdory/cli pack:smoke
```

The smoke test builds the package, packs it, installs it into a clean temporary npm project, checks `dory --help`, runs `action list --data standalone`, starts stdio MCP, and verifies `tools/list`.

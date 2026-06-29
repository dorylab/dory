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
npx -y @getdory/cli mcp serve \
  --http \
  --host 127.0.0.1 \
  --port 3318 \
  --data standalone
```

Run Dory Actions directly:

```sh
npx -y @getdory/cli action list --data standalone
npx -y @getdory/cli action connection.list --data standalone --projection mcp --json '{}'
```

## Connect Local Codex Agent

Dory Web can run Codex on this device through the CLI. Run this on the device where Codex CLI is installed:

```sh
npx -y @getdory/cli agent codex --url https://your-dory-host
```

The command authorizes Dory, registers this device as a Codex Agent bridge, and keeps a local worker running. When Dory sends a job to the bridge, the CLI runs `codex exec` with Dory MCP tools enabled.

The Dory MCP bearer token is passed through an environment variable and is not written into the Codex command arguments.

## Data Modes

- `standalone`: independent Dory app storage under `~/.dory`. This is the recommended headless server mode.
- `desktop`: read Dory Desktop local data without opening Electron. Do not use it while the desktop app is running unless concurrent PGlite access has been validated.
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

HTTP MCP listens on `127.0.0.1` by default and requires bearer token authentication. Create a token first:

```sh
npx -y @getdory/cli mcp token create --data standalone --name "mcp-http"
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

systemd example:

```ini
[Unit]
Description=Dory Headless MCP Runtime
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=dory
Environment=HOME=/var/lib/dory
ExecStart=/usr/bin/env npx -y @getdory/cli mcp serve --http --data standalone --host 127.0.0.1 --port 3318
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
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

Desktop mode points at the Dory Desktop PGlite database. Avoid running Desktop and the CLI against the same PGlite data directory at the same time until concurrent access has been validated for your deployment.

## Hosted Dory Bridge

For hosted Dory Web MCP endpoints, use:

```sh
npx -y @getdory/cli mcp login --url https://your-dory-host
npx -y @getdory/cli mcp status --url https://your-dory-host
npx -y @getdory/cli mcp bridge --url https://your-dory-host
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

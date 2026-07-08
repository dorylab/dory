# Dory MCP Setup

Use this reference when the user asks how to install, configure, or connect Dory MCP.

## Choose a Setup

Use Desktop MCP when Dory Desktop is installed and the MCP client runs on the same machine.

Use standalone stdio when Codex, Claude Code, CI, or a single-user server should start Dory on demand.

Use HTTP headless runtime when the user needs a stable local or server endpoint.

Use hosted Dory bridge when connecting a local MCP client to an existing hosted or self-hosted Dory Web deployment.

## Desktop MCP

In Dory Desktop:

1. Open Settings.
2. Open Agent Access.
3. Enable MCP access.
4. Add the displayed endpoint to the MCP client.

Default endpoint:

```text
http://127.0.0.1:3318/api/mcp
```

Codex CLI:

```sh
codex mcp add dory --url http://127.0.0.1:3318/api/mcp
codex mcp list
```

Claude Code:

```sh
claude mcp add --transport http dory http://127.0.0.1:3318/api/mcp
claude mcp list
```

Dory Desktop manages the local grant for the active user and organization. Do not ask normal Desktop users to copy tokens.

## Standalone Stdio

Use this when the MCP client and Dory runtime are on the same machine and a long-running HTTP endpoint is not needed.

Requirements:

- Node.js 20 or newer.
- npm or npx available.

Initialize and check standalone storage:

```sh
npx -y @getdory/cli init --data standalone
npx -y @getdory/cli doctor --data standalone
```

Codex CLI:

```sh
codex mcp add dory -- npx -y @getdory/cli mcp serve --stdio --data standalone
codex mcp list
```

Claude Code:

```sh
claude mcp add dory -- npx -y @getdory/cli mcp serve --stdio --data standalone
claude mcp list
```

Use Desktop local data through the CLI only when the user specifically wants CLI access to Dory Desktop state:

```sh
codex mcp add dory-desktop -- npx -y @getdory/cli mcp serve --stdio --data desktop
claude mcp add dory-desktop -- npx -y @getdory/cli mcp serve --stdio --data desktop
```

## HTTP Headless Runtime

Use this when the user needs a stable URL or long-running runtime service.

Create a read-only token:

```sh
export DORY_MCP_TOKEN="$(
  npx -y @getdory/cli mcp token create \
    --data standalone \
    --name "agent-http" \
    --scope read | jq -r '.token'
)"
```

Run a local HTTP endpoint:

```sh
npx -y @getdory/cli mcp serve \
  --http \
  --host 127.0.0.1 \
  --port 3318 \
  --token "$DORY_MCP_TOKEN" \
  --data standalone
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

For a background service:

```sh
npm install -g @getdory/cli

dory runtime install \
  --mcp-http \
  --data standalone \
  --host 127.0.0.1 \
  --port 3318 \
  --token "$DORY_MCP_TOKEN"

dory runtime status --data standalone
```

Do not expose plain HTTP directly to the public internet. Remote binds require explicit opt-in and TLS in front of the service.

## Hosted Dory Bridge

Use this when Dory Web already exposes `/api/mcp`.

Authorize once:

```sh
npx -y @getdory/cli mcp login --url https://your-dory-host
npx -y @getdory/cli mcp status --url https://your-dory-host
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

To remove the local hosted credential:

```sh
npx -y @getdory/cli mcp logout --url https://your-dory-host
```

## Security Notes

- Prefer `read` scope for analysis agents.
- Use `write` scope only when the client must create, update, or delete Dory resources.
- `dory_run_readonly_sql` only permits read-only SQL against the target database, but it can still write Dory workspace metadata, Agent Run context, SQL tabs, and result snapshots.
- Keep bearer tokens out of chat transcripts and shell history where possible.
- For self-hosted storage, Dory CLI must use the same deployment secrets as the Dory Web app.

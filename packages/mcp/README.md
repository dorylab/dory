# Dory MCP Bridge

Local stdio bridge for connecting MCP clients to a hosted Dory Web MCP endpoint.

CLI usage:

```sh
npx -y @getdory/cli mcp login --url https://your-dory-host
npx -y @getdory/cli mcp bridge --url https://your-dory-host
```

Package usage:

```sh
npx -y @getdory/mcp login --url https://your-dory-host
npx -y @getdory/mcp --url https://your-dory-host
```

Add the hosted bridge to Codex CLI:

```sh
codex mcp add dory-hosted -- npx -y @getdory/cli mcp bridge --url https://your-dory-host
codex mcp list
```

Add the hosted bridge to Claude Code:

```sh
claude mcp add dory-hosted -- npx -y @getdory/cli mcp bridge --url https://your-dory-host
claude mcp list
```

For standalone MCP servers, token management, direct Dory Actions, and self-hosted storage, use `@getdory/cli`:

```sh
npx -y @getdory/cli mcp token create --data standalone --name "local-mcp"

export DORY_MCP_TOKEN="dory_mcp_..."

npx -y @getdory/cli mcp serve --stdio --data standalone
npx -y @getdory/cli mcp serve --http --data standalone --host 127.0.0.1 --port 3318 --token "$DORY_MCP_TOKEN"
```

`mcp token create` prints JSON. Copy the `token` value into `DORY_MCP_TOKEN`.
When `--scope` is omitted, Dory creates a local token with `read`, `write`, and `local_ai:run`. Use `--scope read` for read-only clients.

Add the standalone HTTP endpoint to Codex CLI:

```sh
export DORY_MCP_TOKEN="dory_mcp_..."

codex mcp add \
  --url http://127.0.0.1:3318/api/mcp \
  --bearer-token-env-var DORY_MCP_TOKEN \
  dory

codex mcp list
```

Add the standalone HTTP endpoint to Claude Code:

```sh
export DORY_MCP_TOKEN="dory_mcp_..."

claude mcp add \
  --transport http \
  dory \
  http://127.0.0.1:3318/api/mcp \
  --header "Authorization: Bearer $DORY_MCP_TOKEN"

claude mcp list
```

For local stdio instead of HTTP, let the MCP client start the server:

```sh
codex mcp add dory -- npx -y @getdory/cli mcp serve --stdio --data standalone
claude mcp add dory -- npx -y @getdory/cli mcp serve --stdio --data standalone
```

Use `--data desktop` instead of `--data standalone` when you want the client to use Dory Desktop local data.

For local Codex Agent access from Dory Web, use:

```sh
npx -y @getdory/cli runtime install --codex-agent --url https://your-dory-host
```

The background runtime can also host an HTTP MCP endpoint:

```sh
npx -y @getdory/cli runtime install \
  --mcp-http \
  --data standalone \
  --host 127.0.0.1 \
  --port 3318 \
  --token "$DORY_MCP_TOKEN"
```

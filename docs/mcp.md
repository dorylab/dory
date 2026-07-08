# Dory MCP Guide

Dory exposes database work to MCP clients as editable Dory workspaces. Agents can list Dory connections, inspect schemas, run read-only SQL against connected databases, manage SQL tabs and saved queries, and use Dory Actions for connection setup and other app operations.

Use this guide to choose the right MCP setup path. For full CLI command reference, see [`packages/cli/README.md`](../packages/cli/README.md). For the hosted bridge package, see [`packages/mcp/README.md`](../packages/mcp/README.md).

## Choose a Setup

| Setup | Best for | Transport | Authentication | Long-running process |
| --- | --- | --- | --- | --- |
| [Desktop MCP](#desktop-mcp) | Local agents using Dory Desktop connections | Streamable HTTP | Desktop grant managed by Dory | Dory Desktop app or local runtime |
| [Standalone stdio](#standalone-stdio) | Local Codex/Claude, CI, or single-user servers | stdio | Local token managed by CLI/runtime | No, MCP client starts it |
| [HTTP headless runtime](#http-headless-runtime) | Shared or long-lived MCP endpoints | Streamable HTTP | Bearer token | Yes |
| [Hosted Dory bridge](#hosted-dory-bridge) | MCP access to an existing Dory Web deployment | stdio bridge to hosted HTTP | Browser authorization token | No, MCP client starts bridge |

## Desktop MCP

Use this when Dory Desktop is installed and the MCP client runs on the same machine.

| Question | Answer |
| --- | --- |
| Good fit | Claude Code, Codex CLI, or another local MCP client using Dory Desktop connections |
| Not a fit | Headless servers, CI, or remote clients |
| Authentication | Desktop grant created and refreshed by Dory |
| Long-running process | Dory Desktop or the Dory local runtime must be available |

1. Open Dory Desktop.
2. Go to **Settings -> Agent Access**.
3. Turn on **Enable**.
4. Add the displayed local endpoint to your MCP client.

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

Desktop MCP does not ask normal users to copy API tokens. Dory manages the local grant for the active Desktop user and organization.

## Standalone Stdio

Use this when the MCP client and Dory runtime are on the same machine and you do not need a long-running HTTP endpoint.

| Question | Answer |
| --- | --- |
| Good fit | Local Codex/Claude setup, CI, single-user Linux servers |
| Not a fit | Remote MCP clients that need a network URL |
| Authentication | Local credential created by Dory CLI/runtime |
| Long-running process | No. The MCP client starts `dory mcp serve --stdio` |

Requirements:

- Node.js 20 or newer for `@getdory/cli`.
- npm or npx available.

Initialize and check standalone storage:

```sh
npx -y @getdory/cli init --data standalone
npx -y @getdory/cli doctor --data standalone
```

Add Dory to Codex CLI:

```sh
codex mcp add dory -- npx -y @getdory/cli mcp serve --stdio --data standalone
codex mcp list
```

Add Dory to Claude Code:

```sh
claude mcp add dory -- npx -y @getdory/cli mcp serve --stdio --data standalone
claude mcp list
```

Use Desktop local data through the CLI only when you specifically want the MCP client to read Dory Desktop state without using the Desktop HTTP endpoint:

```sh
codex mcp add dory-desktop -- npx -y @getdory/cli mcp serve --stdio --data desktop
claude mcp add dory-desktop -- npx -y @getdory/cli mcp serve --stdio --data desktop
```

This is different from Desktop MCP in the Dory app. `--data desktop` is a CLI storage mode; Desktop MCP is the app-managed local HTTP endpoint.

## HTTP Headless Runtime

Use this when you need a stable URL for MCP clients or want a background Dory runtime service.

| Question | Answer |
| --- | --- |
| Good fit | Long-running server, shared endpoint, Docker/headless deployment |
| Not a fit | Simple local-only setup where stdio is enough |
| Authentication | Bearer token in `Authorization` |
| Long-running process | Yes. Run `dory mcp serve --http` or install the runtime service |

Create a token. Use `read` for read-only clients. Use `write` only when the MCP client must create, update, or delete Dory resources such as connections.

```sh
export DORY_MCP_TOKEN="$(
  npx -y @getdory/cli mcp token create \
    --data standalone \
    --name "agent-http" \
    --scope read | jq -r '.token'
)"
```

Run a local HTTP endpoint in the foreground:

```sh
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

Codex CLI with HTTP:

```sh
codex mcp add \
  --url http://127.0.0.1:3318/api/mcp \
  --bearer-token-env-var DORY_MCP_TOKEN \
  dory
```

Claude Code with HTTP:

```sh
claude mcp add \
  --transport http \
  dory \
  http://127.0.0.1:3318/api/mcp \
  --header "Authorization: Bearer $DORY_MCP_TOKEN"
```

Install the same HTTP endpoint as a background runtime service:

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

Remote binds require an existing token, explicit remote opt-in, and TLS in front of the plain HTTP server:

```sh
dory runtime install \
  --mcp-http \
  --data standalone \
  --host 0.0.0.0 \
  --port 3318 \
  --allow-remote \
  --token "$DORY_MCP_TOKEN"
```

Do not expose the plain HTTP server directly to the public internet. Put it behind a TLS reverse proxy such as Nginx, Caddy, or your platform load balancer.

## Hosted Dory Bridge

Use this when a Dory Web deployment already exposes `/api/mcp` and you want a local stdio bridge for an MCP client.

| Question | Answer |
| --- | --- |
| Good fit | Hosted or self-hosted Dory Web endpoint |
| Not a fit | Local-only Desktop usage or standalone headless storage |
| Authentication | Browser authorization creates a personal MCP token |
| Long-running process | No. The MCP client starts the bridge |

Authorize once:

```sh
npx -y @getdory/cli mcp login --url https://your-dory-host
npx -y @getdory/cli mcp status --url https://your-dory-host
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

The bridge stores a token in the local Dory MCP credential file. Revoke it from Dory Agent Access settings or run:

```sh
npx -y @getdory/cli mcp logout --url https://your-dory-host
```

## Tool Workflow

Dory MCP exposes a small set of workflow tools instead of one tool per business operation:

- `dory_create_work`
- `dory_finish_work`
- `dory_read`
- `dory_write`
- `dory_list_connections`
- `dory_explore_schema`
- `dory_run_readonly_sql`
- `dory_workspace_tabs`
- `dory_saved_queries`

For database analysis, use this order:

1. Call `dory_create_work` with a short title based on the user request.
2. Pass the returned `work.workId` to work-scoped tools such as `dory_list_connections`, `dory_explore_schema`, `dory_run_readonly_sql`, `dory_workspace_tabs`, and `dory_saved_queries`.
3. Use `dory_finish_work` to save findings and execution steps.

Use `dory_read` to list, describe, or run read-only and low-risk Dory Actions. Use `dory_write` for write-capable Actions such as `connection.create`, `connection.update`, and `connection.delete`. Before running an Action from an agent, describe it first:

```json
{
  "operation": "describe",
  "actionId": "connection.create"
}
```

Then run it through `dory_write` when the user has approved the change:

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

## Security Notes

- `read` scope can read Dory connections, schemas, saved queries, query-oriented metadata, and related low-risk Actions according to the user's organization permissions.
- `write` scope covers create, update, and delete operations. It can satisfy destructive Action scope checks, so grant it only to trusted MCP clients.
- `dory_run_readonly_sql` only allows read-only SQL against the target database. It still writes Dory workspace metadata, Agent Run context, SQL tabs, and result snapshots.
- HTTP MCP requires bearer authentication. Keep tokens out of shell history where possible and pass them through environment variables.
- Remote HTTP binds require `--host 0.0.0.0`, `--allow-remote`, and an existing token. Put remote deployments behind TLS.

## Troubleshooting

- `Unsupported engine`: install Node.js 20 or newer for `@getdory/cli`.
- `Missing MCP bearer token`: set `DORY_MCP_TOKEN` and configure the MCP client to send it.
- `Invalid MCP bearer token`: create a new token with `dory mcp token create` and update the client environment/config.
- `Refusing to bind 0.0.0.0 without --allow-remote`: add `--allow-remote` only when the endpoint is intentionally remote-accessible.
- `--data self-hosted requires DS_SECRET_KEY`: export the same `DS_SECRET_KEY` and `BETTER_AUTH_SECRET` used by the Dory Web deployment.
- `No desktop auth snapshot`: open Dory Desktop once, or pass `--user-data-dir` for the active Desktop profile.

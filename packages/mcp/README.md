# Dory MCP Bridge

`@getdory/mcp` is the lightweight stdio bridge for connecting local MCP clients to a hosted Dory Web MCP endpoint.

Most users should start with the full [`Dory MCP Guide`](../../docs/mcp.md). Use `@getdory/cli` for standalone MCP servers, token management, direct Dory Actions, local runtime services, and self-hosted storage. This package remains a small hosted-bridge entrypoint.

## When to Use This Package

| Use case | Recommended package |
| --- | --- |
| Hosted Dory Web endpoint with local stdio bridge | `@getdory/mcp` or `@getdory/cli mcp bridge` |
| Standalone local MCP server | `@getdory/cli` |
| HTTP headless runtime | `@getdory/cli` |
| Token management | `@getdory/cli` |
| Direct Dory Action execution | `@getdory/cli` |

## Hosted Bridge

Authorize once in the browser:

```sh
npx -y @getdory/mcp login --url https://your-dory-host
```

Run the bridge:

```sh
npx -y @getdory/mcp --url https://your-dory-host
```

The bridge stores a personal MCP token locally and forwards stdio MCP traffic to:

```text
https://your-dory-host/api/mcp
```

## Add to Codex CLI

```sh
codex mcp add dory-hosted -- npx -y @getdory/mcp --url https://your-dory-host
codex mcp list
```

## Add to Claude Code

```sh
claude mcp add dory-hosted -- npx -y @getdory/mcp --url https://your-dory-host
claude mcp list
```

## Equivalent CLI Commands

The same hosted bridge workflow is available through `@getdory/cli`:

```sh
npx -y @getdory/cli mcp login --url https://your-dory-host
npx -y @getdory/cli mcp status --url https://your-dory-host
npx -y @getdory/cli mcp bridge --url https://your-dory-host
npx -y @getdory/cli mcp logout --url https://your-dory-host
```

Use `@getdory/cli` when you also need standalone/headless MCP, runtime service management, or Dory Actions.

## Environment

```text
DORY_MCP_URL      Default Dory origin or /api/mcp endpoint
DORY_MCP_TOKEN    Advanced bearer token override
DORY_MCP_CONFIG   Credential file path
```

## More Documentation

- MCP setup guide: [`docs/mcp.md`](../../docs/mcp.md)
- CLI reference: [`packages/cli/README.md`](../cli/README.md)

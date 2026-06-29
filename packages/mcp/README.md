# Dory MCP

Local stdio bridge for connecting MCP clients to a Dory Web MCP endpoint.

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

For standalone MCP servers, token management, direct Dory Actions, and self-hosted storage, use `@getdory/cli`:

```sh
npx -y @getdory/cli mcp serve --stdio --data standalone
```

For local Codex Agent access from Dory Web, use:

```sh
npx -y @getdory/cli agent codex install --url https://your-dory-host
```

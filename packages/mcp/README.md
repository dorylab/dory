# Dory MCP

Local stdio bridge for connecting MCP clients to a Dory Web MCP endpoint.

`@getdory/mcp` is the legacy `dory-mcp` compatibility package. New installations should use `@getdory/cli`, which includes both hosted Dory bridge commands and the standalone Dory headless runtime.

New CLI usage:

```sh
npx -y @getdory/cli mcp login --url https://your-dory-host
npx -y @getdory/cli mcp bridge --url https://your-dory-host
```

Existing `dory-mcp` usage remains supported:

```sh
npx -y @getdory/mcp login --url https://your-dory-host
npx -y @getdory/mcp --url https://your-dory-host
```

For standalone MCP servers, token management, direct Dory Actions, and self-hosted storage, use `@getdory/cli`:

```sh
npx -y @getdory/cli mcp serve --stdio --data standalone
```

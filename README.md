<p align="center">
  <img src="./public/app.png" alt="Dory Logo" width="120" />
</p>

<h1 align="center">Dory</h1>

<p align="center">
  <a href="https://sourceforge.net/projects/dorystudio/">
    <img src="https://b.sf-syn.com/badge_img/4073857/oss-rising-star-white?achievement=oss-rising-star" alt="SourceForge Rising Star Award" width="125" />
  </a>
  <a href="https://sourceforge.net/projects/dorystudio/">
    <img src="https://b.sf-syn.com/badge_img/4073857/oss-users-love-us-white" alt="SourceForge Users Love Us Award" width="125" />
  </a>
</p>

**Dory is an AI-native SQL client for humans and agents.**

Dory is a SQL workspace where humans can query, explore, and visualize data, and where AI agents can safely work with databases through MCP.

Unlike a plain database MCP server that only sends query results back to a chat, Dory turns agent work into editable SQL workspaces: SQL tabs, result sets, charts, saved queries, and execution context can all be opened, inspected, modified, and continued by humans.

Use Dory as your everyday SQL client, or as the database execution layer for agents like Claude Code, Codex CLI, and other MCP-compatible tools.

<p align="center">
  <a href="https://app.getdory.dev"><b>🚀 Try Live Demo</b></a> &nbsp; • &nbsp;
  <a href="#install-on-macos-with-homebrew"><b>🍺 Install via Homebrew</b></a> &nbsp; • &nbsp;
  <a href="https://github.com/dorylab/dory/releases"><b>🍎 Download for macOS</b></a> &nbsp; • &nbsp;
  <a href="https://github.com/dorylab/dory/releases"><b>Download for Windows</b></a> &nbsp; • &nbsp;
  <a href="#quick-start"><b>📦 Quick Start</b></a> &nbsp; • &nbsp;
  <a href="https://www.getdory.dev/docs/deploy/self-hosting"><b>🏠 Self-Hosting</b></a> &nbsp; • &nbsp;
  <a href="./docs/mcp.md"><b>MCP Guide</b></a> &nbsp; • &nbsp;
  <a href="./docs/contributing.md"><b>🤝 Contributing</b></a> &nbsp; • &nbsp;
  <a href="https://github.com/dorylab/dory/stargazers"><b>⭐ Star</b></a>
</p>

**No signup required. Click "Sign in as demo" to start instantly.**

**👇 Live Playground: https://app.getdory.dev**

![Dory AI-native SQL workspace](./public/actions.png)

## Why Dory?

AI agents can now write SQL, inspect schemas, and answer analytical questions. But raw agent output is not enough for real data work.

Teams still need to:

- see the exact SQL that was run
- inspect real result sets
- fix wrong queries
- turn results into charts or exports
- preserve context across multiple steps
- continue the work in a real SQL workspace

Dory is built for this workflow.

## How Dory works

Dory provides the same underlying database actions to both the UI and agents:

- Humans use Dory as a SQL client: write SQL, browse schema, run queries, filter results, create charts, and save queries.
- Agents use Dory through MCP: list connections, explore schemas, run read-only SQL, create tabs, and organize database work.
- Agent-generated work becomes a real workspace that humans can review, edit, and continue.

## Dory vs a plain database MCP server

| Capability | Plain DB MCP Server | Dory |
| --- | ---: | ---: |
| Run SQL from agents | ✅ | ✅ |
| Explore schema | ✅ | ✅ |
| Editable SQL tabs | ❌ | ✅ |
| Persistent result sets | ❌ | ✅ |
| Charts and filters | ❌ | ✅ |
| Human review workflow | Limited | ✅ |
| Saved queries and workspace context | Limited | ✅ |
| Works as a daily SQL client | ❌ | ✅ |

## ✨ Key Features

### Editable Agent Workspaces

Agent database work should not disappear into a chat transcript.

- Open agent-created SQL tabs as normal workspace tabs
- Inspect SQL, result sets, filters, charts, and saved context
- Edit generated SQL and rerun it yourself
- Continue an agent run from the same workspace instead of restarting from scratch

---

### Dory CLI and MCP for Agents

`@getdory/cli` is the agent entrypoint for running Dory without opening the desktop app.

- Works with Claude Code, Codex CLI, and other MCP-compatible clients
- Runs standalone MCP servers over stdio or HTTP
- Acts as a headless runtime for automation and direct Dory Actions
- Can use standalone data, hosted Dory Web, or Desktop local data with `--data desktop`

---

### SQL Workspace for Humans

- Multi-tab SQL editor with multiple result sets
- Schema browser for tables, columns, and database objects
- Saved queries for reusable analysis
- Built-in query execution history and workspace context

---

### Schema Explorer

Understand unfamiliar databases at a glance with an interactive map of tables and relationships.

- Visualize primary keys, foreign keys, and relationships across schemas
- Search for tables, select schemas, and switch between all columns and keys only
- Auto-arrange the graph, fit it to the viewport, and open any table directly
- Export the complete schema graph as PNG or SVG

![Dory Schema Explorer](./public/schema-graph.png)

---

### Result Sets, Filters, and Charts

- Inspect real result sets in a table view
- Filter, search, and review returned rows
- Turn query output into charts directly inside the workspace
- Keep results attached to the SQL that produced them

---

### Schema-aware AI Assistance

An AI assistant grounded in real database schema and current query context.

- Generate SQL from natural language
- Rewrite, fix, and explain SQL in the current tab
- Use current database schema and query context
- Keep AI assistance inside the real SQL workspace

---

### Saved Queries and Reusable Context

- Save useful SQL as reusable queries
- Organize query work across connections and workspaces
- Let humans and agents build on previous database work
- Preserve context beyond a single chat response

---

### Database Support

Dory is a multi-database SQL client, with broad driver support and deeper integrations where Dory can provide more than generic SQL execution.

| Database | Status |
| --- | --- |
| <span style="display: inline-flex; align-items: center; gap: 8px;"><img src="./apps/web/public/images/logos/clickhouse.svg" alt="ClickHouse" width="18" height="18" /> ClickHouse</span> | ✅ Deeply integrated |
| <span style="display: inline-flex; align-items: center; gap: 8px;"><img src="./apps/web/public/images/logos/postgresql.svg" alt="PostgreSQL" width="18" height="18" /> PostgreSQL</span> | ✅ Supported |
| <span style="display: inline-flex; align-items: center; gap: 8px;"><img src="./apps/web/public/images/logos/neon.svg" alt="Neon" width="18" height="18" /> Neon</span> | ✅ Supported |
| <span style="display: inline-flex; align-items: center; gap: 8px;"><img src="./apps/web/public/images/logos/supabase.svg" alt="Supabase" width="18" height="18" /> Supabase</span> | ✅ Supported |
| <span style="display: inline-flex; align-items: center; gap: 8px;"><img src="./apps/web/public/images/logos/cloudflare.svg" alt="Cloudflare D1" width="18" height="18" /> Cloudflare D1</span> | ✅ Supported |
| <span style="display: inline-flex; align-items: center; gap: 8px;"><img src="./apps/web/public/images/logos/mysql.svg" alt="MySQL" width="18" height="18" /> MySQL</span> | ✅ Supported |
| <span style="display: inline-flex; align-items: center; gap: 8px;"><img src="./apps/web/public/images/logos/mariadb.svg" alt="MariaDB" width="18" height="18" /> MariaDB</span> | ✅ Supported |
| <span style="display: inline-flex; align-items: center; gap: 8px;"><img src="./apps/web/public/images/logos/sqlite.svg" alt="SQLite" width="18" height="18" /> SQLite</span> | ✅ Supported |
| <span style="display: inline-flex; align-items: center; gap: 8px;"><img src="./apps/web/public/images/logos/duckdb.svg" alt="DuckDB" width="18" height="18" /> DuckDB</span> | ✅ Supported |
| <span style="display: inline-flex; align-items: center; gap: 8px;"><img src="./apps/web/public/images/logos/sqlserver.svg" alt="SQL Server" width="18" height="18" /> SQL Server</span> | ✅ Supported |
| <span style="display: inline-flex; align-items: center; gap: 8px;"><img src="./apps/web/public/images/logos/oracle.svg" alt="Oracle" width="18" height="18" /> Oracle</span> | ✅ Supported |
| <span style="display: inline-flex; align-items: center; gap: 8px;"><img src="./apps/web/public/images/logos/snowflake.svg" alt="Snowflake" width="18" height="18" /> Snowflake</span> | ✅ Supported |

---

### ClickHouse Deep Integration

Dory includes native ClickHouse operations surfaces for teams that need more than a generic SQL editor.

- Query monitoring with slow queries, errors, active users, latency, and throughput
- Multi-dimensional filtering by user, database, query type, and time range
- User and role management without hand-writing every `GRANT` or `CREATE USER` statement
- Cluster-level privilege operations with On Cluster support

![Dory ClickHouse monitoring](./public/monitor-overview.png)

## 🚀 Quick Start

### Install on macOS with Homebrew

```bash
brew install dorylab/dory/dory
```

### Run with Docker

Make sure Docker is installed, then run:

```bash
docker run -d --name dory \
  -p 3000:3000 \
  -e DS_SECRET_KEY="$(openssl rand -base64 32 | tr -d '\n')" \
  -e BETTER_AUTH_SECRET="$(openssl rand -hex 32)" \
  -e BETTER_AUTH_URL="http://localhost:3000" \
  -e DORY_AI_PROVIDER=openai \
  -e DORY_AI_MODEL=gpt-4o-mini \
  -e DORY_AI_API_KEY=your_api_key_here \
  -e DORY_AI_URL=https://api.openai.com/v1 \
  -e NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION=false \
  -e DORY_INIT_USER_EMAIL=admin@getdory.dev \
  -e DORY_INIT_USER_PASSWORD=admin \
  dorylab/dory:latest
```

Then:

`Username: admin@getdory.dev`

`Password: admin`

The initial administrator account is controlled by `DORY_INIT_USER_EMAIL` and `DORY_INIT_USER_PASSWORD` in `.env`.

To enable email verification, set `RESEND_API_KEY` to a valid [resend](https://resend.com) key and `EMAIL_FROM` to a validated email.

### Self-host with Docker Compose

For long-running self-hosted deployments, Docker Compose runs Dory with a dedicated PostgreSQL database and persistent volumes.

```bash
cp docker-compose.env.example .env
# Edit .env and replace all placeholder secrets/passwords.
docker compose up -d
```

For comprehensive self-hosting documentation, environment variables, and deployment guides, see the [Self-Hosting Documentation](https://www.getdory.dev/docs/deploy/self-hosting).

## 🧩 Dory Agent Skill

Install the Dory skill for Codex, ChatGPT, Claude, and other agents that support the open Agent Skills format.

```bash
npx skills add https://github.com/dorylab/skills --skill dory
```

The skill teaches agents when to use Dory, how to use Dory MCP tools, and how to preserve generated SQL, result sets, and findings in an editable Dory Agent Run workspace.

The skill does not install the Dory CLI or configure MCP automatically. For live database access, connect Dory MCP with the setup commands below.

## 🔗 Dory CLI and MCP

Use `@getdory/cli` to connect MCP-compatible agents to Dory. It can run a local stdio MCP server, host a long-running HTTP MCP endpoint, bridge to hosted Dory Web, or reuse Dory Desktop local data with `--data desktop`.

For the full MCP setup guide, including CLI stdio, headless HTTP, and hosted Dory bridge options, see [Dory MCP Guide](./docs/mcp.md).

Run a local stdio MCP server when your agent client is on the same machine:

```bash
codex mcp add dory -- npx -y @getdory/cli mcp serve --stdio --data standalone
codex mcp list
```

```bash
claude mcp add dory -- npx -y @getdory/cli mcp serve --stdio --data standalone
claude mcp list
```

Run a local HTTP MCP endpoint when you want a long-running service:

```bash
npx -y @getdory/cli mcp token create --data standalone --name "local-http"

export DORY_MCP_TOKEN="dory_mcp_..."

npx -y @getdory/cli mcp serve \
  --http \
  --host 127.0.0.1 \
  --port 3318 \
  --token "$DORY_MCP_TOKEN" \
  --data standalone
```

Add that HTTP endpoint to Codex CLI:

```bash
codex mcp add \
  --url http://127.0.0.1:3318/api/mcp \
  --bearer-token-env-var DORY_MCP_TOKEN \
  dory
```

Add it to Claude Code:

```bash
claude mcp add \
  --transport http \
  dory \
  http://127.0.0.1:3318/api/mcp \
  --header "Authorization: Bearer $DORY_MCP_TOKEN"
```

Bridge hosted Dory Web to local MCP clients:

```bash
npx -y @getdory/cli mcp login --url https://your-dory-host
codex mcp add dory-hosted -- npx -y @getdory/cli mcp bridge --url https://your-dory-host
claude mcp add dory-hosted -- npx -y @getdory/cli mcp bridge --url https://your-dory-host
```

For the standalone `@getdory/mcp` bridge package, see [`packages/mcp`](./packages/mcp/README.md). For the full CLI and headless runtime guide, see [`packages/cli`](./packages/cli/README.md).

## 🧠 Supported AI Providers

Dory is built with a pluggable AI provider architecture. You can freely switch between different model vendors by changing environment variables, with no code changes required.

Currently supported providers:

| Provider | Env `DORY_AI_PROVIDER` | Description |
| --- | --- | --- |
| OpenAI | `openai` | Default provider. Uses official OpenAI API. |
| OpenAI-Compatible | `openai-compatible` | Any service exposing an OpenAI-compatible API. |
| Anthropic | `anthropic` | Claude models via Anthropic official API. |
| Google | `google` | Gemini models via Google Generative AI API. |
| Qwen (Alibaba) | `qwen` | Qwen models via DashScope OpenAI-compatible endpoint. |
| xAI | `xai` | Grok models via xAI API. |

## 🗺️ Roadmap

See the latest roadmap here:

- [Dory Roadmap](./ROADMAP.md)
- Historical reference: <a href="https://github.com/dorylab/dory/discussions/35" target="_blank" rel="noopener noreferrer">GitHub Discussion #35</a>

## ⚙️ Tech Stack

- Next.js + React + Tailwind
- Drizzle ORM
- Multi-model AI SDK integration
- PGLite
- Resend
- Shadcn UI
- Monaco Editor

## 🎯 Who is it for?

- Data engineers
- Data analysts
- Database platform teams
- Agent builders who need a database execution layer
- ClickHouse operations teams

---

<h3>
Your data stays yours.
Except for AI requests sent through Cloudflare Gateway,
everything — connections, tabs, results, and saved queries — is stored locally on your device.
</h3>

## 📄 License

Apache-2.0

<p align="center">
  <img src="./public/app.png" alt="Dory Logo" width="120" />
</p>

<h1 align="center">Dory</h1>


**Dory is an AI-native Data Workspace for modern databases.**  

> The AI-powered Data Studio you've been waiting for.

It combines intelligent SQL editing, context-aware AI assistance, conversational database exploration, and deep operational integration across modern databases into a single unified studio — helping you explore, monitor, and manage your data with the power of AI.

<!-- > Explore data with SQL and AI, together. -->

<p align="center">
  <a href="https://app.getdory.dev"><b>🚀 Try Live Demo</b></a> &nbsp; • &nbsp;
  <a href="#install-on-macos-with-homebrew"><b>🍺 Install via Homebrew</b></a> &nbsp; • &nbsp;
  <a href="https://github.com/dorylab/dory/releases"><b>🍎 Download for macOS</b></a> &nbsp; • &nbsp;
  <a href="https://github.com/dorylab/dory/releases"><b>Download for Windows</b></a> &nbsp; • &nbsp;
  <a href="#quick-start"><b>📦 Quick Start</b></a> &nbsp; • &nbsp;
  <a href="https://www.getdory.dev/docs/deploy/self-hosting"><b>🏠 Self-Hosting</b></a> &nbsp; • &nbsp;
  <a href="./docs/contributing.md"><b>🤝 Contributing</b></a> &nbsp; • &nbsp;
  <a href="https://github.com/dorylab/dory/stargazers"><b>⭐ Star</b></a>
</p>

**No signup required. Click "Enter as Demo" to start instantly.**

**👇 Live Playground: https://app.getdory.dev**

![Dory Preview](./public/actions.png)

## Vision

Dory is building the data workspace for the Agent era.

As AI agents become capable of writing SQL, exploring schemas, debugging queries, and answering analytical questions, the bottleneck is no longer only whether an agent can generate a query. The harder problem is how humans and agents work together around real data: how queries are executed, how results are inspected, how mistakes are corrected, how context is preserved, and how useful work can continue after the first answer.

Dory is designed as an agent-first SQL workspace where every important operation is action-based and can be used by both humans and agents. Agents can list connections, explore schemas, run read-only SQL, create or update workspace tabs, and organize saved queries through the same underlying action system that powers the product UI.

We believe the future data workflow will not be a standalone chatbot beside a database. It will be a shared working environment where an agent can create a complete analytical workspace, produce SQL and result sets, and let the user open, inspect, filter, chart, edit, and continue the work directly.

In Dory, the result is not just text. SQL tabs, query results, filters, charts, saved queries, and workspace state are first-class parts of the workflow. This makes Dory different from simply connecting an LLM to a database through MCP: the agent does not just return an answer — it creates a real workspace that humans can trust, modify, and build on.

Our long-term goal is to make Dory the default data workbench for agentic data analysis:

- agents can understand database structure and execute safe analytical actions;
- humans can review and refine the agent’s work in a real SQL workspace;
- every meaningful step can be recorded, reopened, and continued;
- query results can become charts, dashboards, exports, or reusable analysis artifacts;
- external agents such as coding assistants can use Dory as their data execution layer through MCP.

Dory is not trying to replace SQL professionals with a black-box assistant. It is building the interface where humans and agents collaborate on data with transparency, control, and persistent context.

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


## ✨ Key Features

### 🧠 SQL Copilot

An AI assistant grounded in real database schema and current query context.

- **Ask** — Generate SQL from natural language  
- **Action** — Fix or rewrite the current SQL  
- **Context** — Explain query logic and field semantics  

AI that understands your database — not just text completion.

---

### ⌨️ Schema-Aware Autocomplete

- SQL completion based on real database schema  
- Suggests tables, columns, functions, and aliases  
- Supports multi-table joins and subqueries  

---
<img alt="image" src="https://github.com/user-attachments/assets/c1775613-5773-4552-a188-90442f8f82ad" />

### ✍️ Intelligent SQL Editor

- Multi-tab SQL workspace with support for multiple result sets
- Save and organize frequently used queries
- AI-powered SQL Copilot for writing, explaining, and optimizing queries
- Instant query visualization with built-in charts

---
<img alt="image" src="https://github.com/user-attachments/assets/d3e0b7a7-8c16-44d0-b248-685f7e386b6b" />

### 💬 Database Chatbot

- Built-in conversational AI assistant  
- Automatically understands connected database schema  
- Ask questions directly about tables and SQL  
- Quickly locate field meanings and query ideas  

---
<!-- <img alt="image" src="https://github.com/user-attachments/assets/4397055f7c74-4505-90dc-8d822845b670" /> -->

### 🔗 Agent Access via MCP

- Desktop MCP endpoint for local agent clients
- No manual token copy/paste in the desktop app
- Supports schema discovery, saved queries, read-only SQL, table previews, monitoring summaries, and analysis tools

---

### 📈 ClickHouse Monitoring (Deep Integration)

A native observability interface designed specifically for ClickHouse.

- Real-time metrics:
  - Total queries  
  - Slow queries  
  - Error queries  
  - Active users  
- Query latency trends (P50 / P95)  
- Query throughput trends (QPM)  
- Multi-dimensional filtering:
  - User  
  - Database  
  - Query type  
  - Time range  

---

![Dory Preview](./public/monitor-overview.png)

### 🔐 ClickHouse Privileges (Deep Integration)

Native ClickHouse user and role management UI.

- Create, edit, and delete database users  
- Create roles and configure grant relationships  
- Configure:
  - Login username and password  
  - Allowed host addresses  
  - Granted roles and default roles  
- Supports cluster-level privilege operations (On Cluster)  
- No need to manually write GRANT / CREATE USER SQL  

---

## 🔌 Database Support

| Database   | Status              |
| ---------- | ------------------- |
| ClickHouse | ✅ Deeply integrated |
| PostgreSQL | ✅ Supported         |
| Neon       | ✅ Supported         |
| MySQL      | ✅ Supported         |
| MariaDB    | ✅ Supported         |
| SQLite     | ✅ Supported         |
| DuckDB     | ✅ Supported         |
| SQL Server | ✅ Supported         |
| Oracle     | ✅ Supported         |
| Snowflake  | 🚧 Planned           |

---

## 🧠 Supported AI Providers

Dory is built with a pluggable AI provider architecture.
You can freely switch between different model vendors by changing environment variables — no code changes required.

Currently supported providers:

| Provider          | Env `DORY_AI_PROVIDER` | Description                                           |
| ----------------- | ---------------------- | ----------------------------------------------------- |
| OpenAI            | `openai`               | Default provider. Uses official OpenAI API.           |
| OpenAI-Compatible | `openai-compatible`    | Any service exposing an OpenAI-compatible API.        |
| Anthropic         | `anthropic`            | Claude models via Anthropic official API.             |
| Google            | `google`               | Gemini models via Google Generative AI API.           |
| Qwen (Alibaba)    | `qwen`                 | Qwen models via DashScope OpenAI-compatible endpoint. |
| xAI               | `xai`                  | Grok models via xAI API.                              |

---

## 🔗 Desktop MCP

The Dory desktop app includes local MCP (Model Context Protocol) support, so agent clients can use your Dory connections without manually copying API tokens.

To enable it:

1. Open the Dory desktop app.
2. Go to **Settings → Agent Access**.
3. Turn on **Enable**.
4. Add the displayed local endpoint to your MCP client.

By default, desktop MCP runs at:

```text
http://127.0.0.1:3318/api/mcp
```

For Codex CLI:

```bash
codex mcp add dory --url http://127.0.0.1:3318/api/mcp
codex mcp list
```

For Claude Code:

```bash
claude mcp add --transport http dory http://127.0.0.1:3318/api/mcp
claude mcp list
```

Dory manages the desktop MCP grant automatically. The local MCP endpoint can list connections, inspect schemas, read saved queries, preview tables, run read-only SQL, and build analysis context for connected databases.

---

## 🗺️ Roadmap

See the latest roadmap here:

- [Dory Roadmap](./ROADMAP.md)
- Historical reference: <a href="https://github.com/dorylab/dory/discussions/35" target="_blank" rel="noopener noreferrer">GitHub Discussion #35</a>

---

## ⚙️ Tech Stack

- Next.js + React + Tailwind
- Drizzle ORM  
- Multi-model AI SDK integration
- PGLite
- Resend
- Shadcn UI
- Monaco Editor

---

## 🎯 Who is it for?

- Data engineers  
- Data analysts  
- Database platform teams  
- ClickHouse operations teams  

---

<h3>
Your data stays yours.
Except for AI requests sent through Cloudflare Gateway,
everything — connections, tabs, and saved queries — is stored locally on your device.
<h3>

## 📄 License

Apache-2.0

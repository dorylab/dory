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


### 🧠 Supported AI Providers

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

## 🗺️ Roadmap

See the latest roadmap here:

<a href="https://github.com/dorylab/dory/discussions/35" target="_blank" rel="noopener noreferrer">Dory Roadmap</a>

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

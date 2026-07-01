# Dory

**Dory 是面向人和 Agent 的 AI-native SQL 客户端。**

Dory 是一个 SQL 工作区：人可以在这里查询、探索和可视化数据，AI Agent 也可以通过 MCP 安全地使用数据库。

普通数据库 MCP server 通常只是把查询结果发回聊天窗口。Dory 不一样：它会把 Agent 的数据库工作变成可编辑的 SQL 工作区。SQL 标签页、结果集、图表、已保存查询和执行上下文，都可以被人打开、检查、修改和继续。

你可以把 Dory 当作日常 SQL 客户端使用，也可以把它作为 Claude Code、Codex CLI 和其他 MCP 兼容 Agent 的数据库执行层。

## 为什么是 Dory？

AI Agent 已经可以写 SQL、查看 schema、回答数据分析问题。但真实的数据工作不能只停留在聊天输出里。

团队仍然需要：

- 看到实际执行过的 SQL
- 检查真实结果集
- 修正错误查询
- 把结果转成图表或导出
- 保留多步上下文
- 在真正的 SQL 工作区里继续工作

Dory 就是为这个流程构建的。

## Dory 如何工作？

Dory 把同一套数据库能力同时提供给 UI 和 Agent：

- 人把 Dory 当作 SQL 客户端使用：写 SQL、浏览 schema、执行查询、过滤结果、创建图表、保存查询。
- Agent 通过 MCP 使用 Dory：列出连接、探索 schema、执行只读 SQL、创建标签页，并组织数据库工作。
- Agent 生成的内容会变成真实工作区，人可以继续 review、编辑和接手。

## Dory vs 普通数据库 MCP Server

| 能力 | 普通数据库 MCP Server | Dory |
| --- | ---: | ---: |
| Agent 执行 SQL | 支持 | 支持 |
| 探索 schema | 支持 | 支持 |
| 可编辑 SQL 标签页 | 不支持 | 支持 |
| 持久结果集 | 不支持 | 支持 |
| 图表和过滤器 | 不支持 | 支持 |
| 人工 review 流程 | 有限 | 支持 |
| 已保存查询和工作区上下文 | 有限 | 支持 |
| 可作为日常 SQL 客户端 | 不支持 | 支持 |

## 核心能力

### 可编辑的 Agent 工作区

Agent 的数据库工作不应该消失在聊天记录里。

- 打开 Agent 创建的 SQL 标签页
- 检查 SQL、结果集、过滤器、图表和已保存上下文
- 修改生成的 SQL，并由人重新执行
- 从同一个工作区继续 Agent Run，而不是从零开始

### 面向 Claude Code / Codex CLI 的 Desktop MCP

Dory 桌面端提供本地 MCP endpoint，外部 Agent 可以使用你的 Dory 数据库连接，而不需要手动复制 token。

- 支持 Claude Code、Codex CLI 和其他 MCP 兼容客户端
- 使用 Dory 的连接列表、schema 探索、已保存查询和只读 SQL 执行能力
- Desktop MCP 授权由 Dory 自动管理，不把 token 操作暴露给普通用户

### 面向人的 SQL 工作区

- 多标签 SQL 编辑器，支持多个结果集
- Schema 浏览器，可查看表、字段和数据库对象
- 已保存查询，方便复用分析
- 内置查询执行历史和工作区上下文

### 结果集、过滤器和图表

- 在表格视图中检查真实结果集
- 过滤、搜索和 review 返回数据
- 直接在工作区中把查询结果转成图表
- 让结果集始终保留和 SQL 的关系

### 理解 schema 的 AI Assistant

Dory 的 AI Assistant 会结合真实数据库 schema 和当前查询上下文工作。

- 用自然语言生成 SQL
- 在当前标签页中改写、修复和解释 SQL
- 使用当前数据库 schema 和查询上下文
- 让 AI 能力留在真实 SQL 工作区里

### 已保存查询和可复用上下文

- 保存有价值的 SQL
- 按连接和工作区组织查询工作
- 让人和 Agent 可以基于之前的数据库工作继续推进
- 保留超过单次聊天回复的上下文

### 多数据库支持

Dory 是多数据库 SQL 客户端，支持广泛的数据库驱动，并在部分数据库上提供更深入的能力。

| 数据库 | 状态 |
| --- | --- |
| ClickHouse | 深度集成 |
| PostgreSQL | 支持 |
| Neon | 支持 |
| MySQL | 支持 |
| MariaDB | 支持 |
| SQLite | 支持 |
| DuckDB | 支持 |
| SQL Server | 支持 |
| Oracle | 支持 |
| Snowflake | 计划中 |

### ClickHouse 深度集成

Dory 为需要更强运维能力的 ClickHouse 团队提供原生操作界面。

- 查询监控：慢查询、错误、活跃用户、延迟和吞吐
- 按用户、数据库、查询类型和时间范围多维过滤
- 用户和角色管理，不需要手写所有 `GRANT` 或 `CREATE USER`
- 支持 On Cluster 的集群级权限操作

## 快速开始

### 使用 Homebrew 安装 macOS 版本

```bash
brew install dorylab/dory/dory
```

### 使用 Docker 运行

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

默认管理员账号：

`Username: admin@getdory.dev`

`Password: admin`

### Docker Compose 自托管

```bash
cp docker-compose.env.example .env
# 编辑 .env 并替换所有占位 secret/password。
docker compose up -d
```

完整自托管文档见：[Self-Hosting Documentation](https://www.getdory.dev/docs/deploy/self-hosting)。

## Desktop MCP

Dory 桌面端包含本地 MCP 支持，Agent 客户端可以使用你的 Dory 连接，而不需要手动复制 API token。

启用方式：

1. 打开 Dory 桌面端。
2. 进入 **Settings → Agent Access**。
3. 打开 **Enable**。
4. 把界面中显示的本地 endpoint 添加到 MCP 客户端。

默认 Desktop MCP 地址：

```text
http://127.0.0.1:3318/api/mcp
```

Codex CLI：

```bash
codex mcp add dory --url http://127.0.0.1:3318/api/mcp
codex mcp list
```

Claude Code：

```bash
claude mcp add --transport http dory http://127.0.0.1:3318/api/mcp
claude mcp list
```

Dory 会自动管理 Desktop MCP grant。本地 MCP endpoint 可以列出连接、查看 schema、读取已保存查询、预览表、执行只读 SQL，并为连接的数据库构建分析上下文。

## 支持的 AI Provider

Dory 使用可插拔的 AI Provider 架构。你可以通过环境变量切换模型供应商，不需要改代码。

| Provider | Env `DORY_AI_PROVIDER` | 说明 |
| --- | --- | --- |
| OpenAI | `openai` | 默认 provider，使用 OpenAI 官方 API |
| OpenAI-Compatible | `openai-compatible` | 任何兼容 OpenAI API 的服务 |
| Anthropic | `anthropic` | Anthropic 官方 Claude 模型 |
| Google | `google` | Google Gemini 模型 |
| Qwen (Alibaba) | `qwen` | 通过 DashScope OpenAI-compatible endpoint 使用 Qwen |
| xAI | `xai` | xAI Grok 模型 |

## Roadmap

- [Dory Roadmap](../ROADMAP.md)
- [GitHub Discussion #35](https://github.com/dorylab/dory/discussions/35)

## License

Apache-2.0

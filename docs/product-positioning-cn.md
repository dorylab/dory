# 当 Agent 开始写 SQL，我们需要的不只是一个数据库 MCP

[English](./product-positioning.md) | [简体中文](./product-positioning-cn.md) | [Español](./product-positioning-es.md) | [日本語](./product-positioning-jp.md)

> **Dory is an AI-native SQL client for humans and agents. Query, explore, visualize, and open agent database work as editable SQL workspaces.**

SQL 客户端曾经完全属于人：人连接数据库、阅读 Schema、编写查询、检查结果，再把结论整理成图表或报告。

现在，Agent 也开始进入这个流程。它们可以理解问题、探索数据库结构、生成 SQL，并在几分钟内完成过去需要多轮操作的分析。但新的问题也随之出现：如果 Agent 的工作最终只留下聊天窗口中的一段 SQL 和几行结果，我们得到的仍然只是一次性答案，而不是可以继续推进的数据工作。

这正是 Dory 想解决的问题。

Dory 是一款面向人和 Agent 的 AI-native SQL Client。它既可以作为开发者、数据分析师和数据工程师日常使用的 SQL 工作区，也可以通过 MCP 成为 Codex CLI、Claude Code 等 Agent 的数据库工作层。

与普通数据库 MCP 不同，Dory 不只负责“执行查询并返回结果”。它会把 Agent 完成的数据库工作保存为一个真实、可编辑的 SQL Workspace：人可以打开 Agent 创建的 SQL 标签页，查看实际执行过的语句和 ResultSet，检查过滤条件与图表，修正查询，然后从同一个上下文继续工作。

## Agent 交付的应该是工作，而不只是答案

在真实的数据工作中，“得出一个答案”往往只是开始。

我们需要知道 Agent 使用了哪些表、如何理解字段含义、实际执行了什么 SQL、结果是否完整，以及查询中有没有错误的关联、过滤或聚合。发现问题后，我们还要修改 SQL、重新执行、比较结果，最后制作图表、导出数据，或者把有价值的查询保存下来。

如果这些过程只存在于聊天记录里，人就不得不在 Agent、数据库工具和文档之间反复复制内容。执行上下文容易丢失，结果与 SQL 逐渐分离，后续接手的人也很难准确还原分析过程。

Dory 将这些内容组织在 Agent Run 中。Agent Run 是一次数据库工作的持续上下文，其中可以包含连接信息、Schema 探索过程、SQL 标签页、查询结果、图表、Saved Queries 和执行记录。Agent 可以从这里开始工作，人也可以随时打开同一个工作区接手。

这意味着 Agent 的产出不再是一条无法延续的消息，而是一份可以检查、修改和复用的工作成果。

## 从一次查询，变成可接管的 SQL Workspace

设想你想了解一项产品指标最近为什么发生变化。

Agent 可以先通过 Dory 列出可用连接，探索相关 Schema，确认表、字段和关系，再执行只读 SQL 验证假设。每次查询都会保留对应的 SQL 和 ResultSet，而不是只把截取后的结果送回聊天窗口。

随后，你可以在 Dory 中直接打开这次 Agent Run：

- 检查 Agent 实际使用了哪些表和过滤条件；
- 查看多个查询产生的真实结果集；
- 修改 SQL，并在同一个标签页重新执行；
- 搜索、排序和过滤返回的数据；
- 将结果切换为柱状图、折线图、饼图、散点图、直方图或热力图；
- 导出结果，或者将查询保存到 Saved Queries 中供以后复用。

整个过程不需要把 SQL 从聊天窗口复制到另一个客户端，也不需要重新向下一位协作者解释上下文。Agent 和人使用的是同一套数据库能力，面对的是同一份工作。

## AI-native，不等于把 SQL 藏起来

不少 AI 数据产品试图让 SQL 消失。但在 Dory 看来，SQL 恰恰是人和 Agent 之间最重要的协作界面。

自然语言适合描述目标，SQL 则提供了精确、可验证的执行过程。一个真正 AI-native 的 SQL Client，不应该用一个看似完整的答案替代 SQL，而应该让 Agent 更高效地生成和组织 SQL，同时保留人检查与修改它的能力。

因此，Dory 的 AI Assistant 会结合真实数据库 Schema 和当前标签页上下文工作。它可以根据自然语言生成 SQL，也可以解释、改写或修复当前查询。AI 能力不是悬浮在数据库之外的聊天框，而是进入实际使用的 SQL Workspace。

Dory 的 Schema Explorer 同样服务于这种协作。人可以浏览表、字段和数据库对象，通过关系图理解主键、外键及表之间的联系；Agent 也可以通过 MCP 探索 Schema，再基于真实结构构建查询。关系图支持搜索、自动布局，以及 PNG、SVG 导出，让陌生数据库更容易被理解和交流。

## 给 Agent 能力，也保留清晰的安全边界

让 Agent 连接数据库，不意味着放弃控制。

Dory 为 Agent 提供明确的只读 SQL 工具。Agent 可以查看连接、探索 Schema、预览表、读取 Saved Queries 和执行只读分析；涉及创建、更新或删除 Dory 资源的操作，则需要独立的写权限和明确授权。

Schema Compare 也遵循同样的原则。它可以读取数据库目录信息，对 PostgreSQL、Neon、Supabase、MySQL、MariaDB、SQLite 和 Cloudflare D1 等同方言数据库进行确定性的结构比较，识别表、字段、索引、约束和视图变化，并给出风险证据。它不会读取业务数据、生成迁移 SQL，或直接修改目标数据库。

安全不是一句“AI 会小心”的承诺，而应该落实为可理解、可配置的产品边界。

## 一套产品，多种工作方式

Dory 支持 PostgreSQL、ClickHouse、MySQL、MariaDB、SQLite、DuckDB、Cloudflare D1、Neon、Supabase、SQL Server、Oracle 和 Snowflake。对于 ClickHouse，Dory 还提供查询监控、慢查询与错误分析、用户和角色管理，以及集群级权限操作等深度能力。

你可以将 Dory 作为 Desktop 应用使用，也可以部署 Web 自托管版本。`@getdory/cli` 则提供 Standalone Headless Runtime，可通过 stdio 或 HTTP 运行 MCP；已有 Dory Web 部署也可以通过 Hosted Bridge 接入本地 Agent。

这让 Dory 可以出现在个人开发环境、数据团队的共享服务、自托管基础设施或自动化任务中，同时保持一致的 SQL Workspace 和数据库能力。

Dory 采用 Apache-2.0 许可证开源。我们希望数据库工具的下一步，不是把人从工作流中移除，而是让人和 Agent 在同一个可见、可编辑、可延续的工作空间里协作。

AI-native SQL Client 的价值，不是替人藏起 SQL，而是让 Agent 的数据库工作真正进入可以审阅和继续的数据流程。

**让 Agent 开始工作，让人随时接手。**

立即体验：

- [在线体验 Dory](https://app.getdory.dev)
- [访问 GitHub 并 Star Dory](https://github.com/dorylab/dory)
- macOS 安装：`brew install dorylab/dory/dory`
- 通过 Docker 或 Docker Compose 自托管 Dory Web

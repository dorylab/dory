# When Agents Start Writing SQL, We Need More Than a Database MCP Server

[English](./product-positioning.md) | [简体中文](./product-positioning-cn.md) | [Español](./product-positioning-es.md) | [日本語](./product-positioning-jp.md)

> **Dory is an AI-native SQL client for humans and agents. Query, explore, visualize, and open agent database work as editable SQL workspaces.**

SQL clients used to belong entirely to humans. People connected to databases, read schemas, wrote queries, inspected results, and turned their findings into charts or reports.

Agents are now entering that workflow. They can understand a question, explore a database schema, generate SQL, and complete in minutes an analysis that once required many manual steps. But this creates a new problem: if an agent leaves behind only a SQL snippet and a few result rows in a chat window, what we have is still a disposable answer—not database work that can be reviewed and continued.

That is the problem Dory is built to solve.

Dory is an AI-native SQL client for humans and agents. It works as an everyday SQL workspace for developers, analysts, and data engineers, while also serving as a database work layer for agents such as Codex CLI and Claude Code through MCP.

Unlike a plain database MCP server, Dory does more than execute a query and return the output. It turns agent activity into a real, editable SQL workspace. A human can open the SQL tabs created by an agent, inspect the exact statements and ResultSets, review filters and charts, correct a query, and continue from the same context.

## Agents Should Deliver Work, Not Just Answers

In real data work, getting an answer is often only the beginning.

We need to know which tables an agent used, how it interpreted the columns, what SQL it actually ran, whether the result is complete, and whether a join, filter, or aggregation is wrong. When we find a problem, we need to edit the SQL, run it again, compare the results, create a chart, export the data, or save a useful query for later.

When that process exists only in a chat transcript, people are forced to copy content between an agent, a database tool, and a document. Execution context is easily lost, results drift away from the SQL that produced them, and the next person has to reconstruct the analysis from scratch.

Dory organizes this work in an Agent Run: a durable context for a database task that can contain connection context, schema exploration, SQL tabs, query results, charts, Saved Queries, and an execution timeline. An agent can begin there, and a human can open the same workspace and take over at any point.

The output is no longer a message that cannot be continued. It is a piece of work that can be inspected, edited, and reused.

## From a Single Query to a Workspace You Can Take Over

Suppose you want to understand why a product metric changed recently.

An agent can use Dory to list available connections, explore the relevant schema, confirm tables and relationships, and then run read-only SQL to test its hypotheses. Each query keeps the SQL and its ResultSet together instead of sending only a shortened answer back to chat.

You can then open the Agent Run in Dory and:

- inspect the tables and filters the agent actually used;
- review the real ResultSets produced by multiple queries;
- edit the SQL and rerun it in the same tab;
- search, sort, and filter returned data;
- visualize results as bar, line, pie, scatter, histogram, or heatmap charts;
- export the result or save the query for reuse.

There is no need to copy SQL from a chat window into another client or explain the context again to the next collaborator. Humans and agents work through the same database capabilities and on the same underlying work.

## AI-Native Does Not Mean Hiding SQL

Many AI data products try to make SQL disappear. Dory takes the opposite view: SQL is one of the most important collaboration interfaces between humans and agents.

Natural language is effective for expressing intent. SQL provides a precise, verifiable record of what will be executed. A truly AI-native SQL client should not replace SQL with an authoritative-looking answer. It should help agents generate and organize SQL efficiently while preserving a human's ability to inspect and change it.

Dory's AI Assistant therefore works with the real database schema and the context of the current tab. It can generate SQL from natural language and explain, rewrite, or fix an existing query. AI is not isolated in a chat box outside the database workflow; it operates inside the SQL workspace people actually use.

Dory's Schema Explorer supports the same collaboration model. Humans can browse tables, columns, and database objects and use a relationship graph to understand primary keys, foreign keys, and connections between tables. Agents can explore that same schema through MCP and build queries from the actual structure. The graph supports search, automatic layout, and PNG or SVG export, making unfamiliar databases easier to understand and discuss.

## Give Agents Capabilities, With Clear Safety Boundaries

Letting an agent connect to a database does not mean giving up control.

Dory provides agents with an explicit read-only SQL tool. Agents can list connections, explore schemas, preview tables, read Saved Queries, and perform read-only analysis. Operations that create, update, or delete Dory resources require separate write permission and explicit approval.

Schema Compare follows the same principle. It can read catalog metadata and perform deterministic comparisons for databases in the same dialect family, including PostgreSQL, Neon, Supabase, MySQL, MariaDB, SQLite, and Cloudflare D1. It identifies changes to tables, columns, indexes, constraints, and views, and records the evidence behind its risk assessment. It does not read application rows, generate migration SQL, or modify either connected database.

Security should not rely on a promise that an AI will be careful. It should be expressed as product boundaries that people can understand and configure.

## One Product, Multiple Ways to Work

Dory supports PostgreSQL, ClickHouse, MySQL, MariaDB, SQLite, DuckDB, Cloudflare D1, Neon, Supabase, SQL Server, Oracle, and Snowflake. For ClickHouse, Dory also provides deeper operational capabilities, including query monitoring, slow-query and error analysis, user and role management, and cluster-level privilege operations.

Dory can run as a desktop application or as a self-hosted web deployment. `@getdory/cli` provides a standalone headless runtime that can expose MCP over stdio or HTTP, while an existing Dory Web deployment can connect to local agents through a hosted bridge.

This allows Dory to fit into a developer's local environment, a shared data-team service, self-hosted infrastructure, or automated workflows while preserving the same SQL workspace and database capabilities.

Dory is open source under the Apache-2.0 license. We believe the next step for database tools is not to remove humans from the workflow, but to let humans and agents collaborate in the same visible, editable, and continuous workspace.

The value of an AI-native SQL client is not that it hides SQL from people. It is that it brings agent database work into a process people can review and continue.

**Let agents start the work. Let humans take over at any time.**

Get started:

- [Try Dory online](https://app.getdory.dev)
- [Visit Dory on GitHub and give the project a star](https://github.com/dorylab/dory)
- Install on macOS: `brew install dorylab/dory/dory`
- Self-host Dory Web with Docker or Docker Compose

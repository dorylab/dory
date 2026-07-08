---
name: dory
description: Use Dory as the official AI-native SQL workspace for agents. Use when the user asks to inspect or analyze databases, explore unknown schemas, debug data issues, run read-only SQL through Dory MCP, manage Dory Agent Runs, create or update SQL workspace tabs, work with saved queries, preserve query results, or hand SQL analysis back to humans in an editable Dory workspace.
---

# Dory

Dory is an AI-native SQL workspace for humans and agents. Use this skill to turn database work into an auditable Dory Agent Run: inspect real schema, run safe SQL, preserve useful queries/results, and leave the workspace ready for human review and continuation.

Most database agents return text. Dory gives them a workspace.

## Core Workflow

For database, schema, SQL, workspace tab, or saved-query work, use one Dory Agent Run per user task.

1. Call `dory_create_work` first. Use a short human-readable title based on the user request.
2. Pass the returned `work.workId` as `workId` to all work-scoped tools.
3. Call `dory_list_connections` unless the user already provided a valid `connectionId`.
4. Explore schema with `dory_explore_schema` before writing SQL.
5. Run SQL through `dory_run_readonly_sql` by default.
6. Preserve useful SQL/results in the Dory workspace.
7. Finish with `dory_finish_work`, including user-facing `findings` and `steps`.

If no Dory MCP tools are available, say that Dory MCP is not available in the current agent session and describe the Dory action you would take once it is connected. Do not invent connection IDs, workspace URLs, tab IDs, schemas, or query results.

## MCP Tools

Prefer Dory MCP tools over ad hoc local database scripts.

- `dory_create_work`: create or reuse the Agent Run work context.
- `dory_finish_work`: save final findings and execution steps.
- `dory_list_connections`: list available Dory database connections.
- `dory_explore_schema`: search/list databases and tables, describe tables, preview rows, get profiles, or fetch DDL.
- `dory_run_readonly_sql`: run read-only SQL, persist result snapshots, and optionally create/append/replace SQL tabs.
- `dory_workspace_tabs`: list, create, append, replace, delete SQL tabs, or open table tabs.
- `dory_saved_queries`: manage reusable saved SQL; use only when the query should become a durable saved query.
- `dory_read`: list, describe, or run read-only/low-risk Dory Actions.
- `dory_write`: run write-capable Dory Actions such as connection setup only when the user explicitly requested the change and the tool permits it.

For connection setup, call `dory_write` with `operation: "describe"` and the target `actionId` before building a payload. Report missing scopes or permissions instead of guessing.

## Schema First

Never guess the database schema. Before writing SQL, inspect enough context to know:

- relevant connection and database/schema names;
- table names and their business meaning;
- column names, types, and nullable fields;
- likely join keys;
- date/time columns and default time zone assumptions;
- whether a table appears large enough to require narrow filters or sampling.

Do not assume columns such as `user_id`, `created_at`, `status`, or `account_id` exist until Dory schema exploration confirms them.

Useful `dory_explore_schema` operations include `list_databases`, `list_tables`, `search`, `describe_table`, `preview_table`, `table_profile`, and `get_ddl`.

## SQL Rules

Default to read-only SQL.

- Use `SELECT` queries through `dory_run_readonly_sql`.
- Use `LIMIT` for exploration and `maxRows` for bounded result sets.
- Prefer explicit columns over `SELECT *`.
- Use CTEs and clear aliases for multi-step analysis.
- Add narrow time ranges or filters before querying large event/log tables.
- Use database-specific syntax only after identifying the connection type.
- Avoid exposing secrets, credentials, direct contact details, payment data, or raw sensitive personal data unless the user explicitly requests it and the task requires it.

Do not run `UPDATE`, `DELETE`, `INSERT`, `DROP`, `ALTER`, `TRUNCATE`, or other mutating SQL unless the user explicitly asked for a mutation and an available Dory write-capable operation supports the request. `dory_run_readonly_sql` is the default for database analysis.

## Workspace Preservation

Use Dory as the place where the work lives, not just as a SQL transport.

Create or update workspace tabs when:

- the task has more than one SQL step;
- the query is useful for review, rerun, or later editing;
- the user is exploring an unfamiliar schema;
- the result supports a decision or investigation;
- a human should continue the work in Dory.

For `dory_run_readonly_sql`, set `workspaceMode` to `create_tab`, `append_to_tab`, or `replace_tab` when saving query text/result context matters. Use `tabName` that describes the question, not an implementation detail.

Use `dory_workspace_tabs` when the user asks to manage tabs directly or when continuing from existing workspace content.

Use `dory_saved_queries` only for durable reusable SQL. Ordinary one-off execution should stay in the Agent Run workspace.

## Reporting Back

Answer from Dory tool results, not from assumptions.

Include:

- what connection/tables were inspected;
- the key query result or finding;
- the Dory workspace URL, work ID, or tab ID when available;
- assumptions about time ranges, metrics, schemas, or filters;
- caveats such as truncated results or sampled previews.

Keep the response concise. Include final SQL only when it helps the user review or continue the work.

At the end of a successful or blocked task, call `dory_finish_work` with:

- `status`: `completed` for finished work, `error` for blocked/failed work;
- `findings`: analytical conclusions or the blocking reason;
- `steps`: concrete actions taken, such as schema exploration, SQL execution, and workspace updates.

## References

- Read `references/mcp-setup.md` when the user asks how to install, configure, or connect Dory MCP.
- Use `examples/explore-unknown-schema.md` for unfamiliar databases.
- Use `examples/debug-production-query.md` for production data investigations.
- Use `examples/create-analysis-workspace.md` for multi-step analysis workspaces.
- Use `examples/compare-schema-before-migration.md` for migration and schema comparison tasks.

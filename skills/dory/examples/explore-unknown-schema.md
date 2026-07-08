# Explore Unknown Schema

Use this pattern when the user asks to understand an unfamiliar database or find where specific business data lives.

## Workflow

1. Call `dory_create_work` with a short title such as `Explore customer schema`.
2. Call `dory_list_connections` and choose the relevant connection.
3. Use `dory_explore_schema` with `list_databases`, `list_tables`, and `search` to identify candidate tables.
4. For promising tables, call `describe_table`, then `preview_table` or `table_profile` with bounded limits.
5. Summarize likely entities, join keys, and date columns.
6. Save useful exploratory SQL with `dory_run_readonly_sql` using `workspaceMode: "create_tab"` or `append_to_tab`.
7. Call `dory_finish_work` with findings and steps.

## Guardrails

- Do not infer schema from common naming conventions.
- Use small previews before broader queries.
- Prefer aggregate or sampled results when exploring user/customer data.
- State assumptions about business meaning and time zones.

## Report Shape

Mention the chosen connection, inspected tables, likely relationships, useful caveats, and the Dory workspace URL or work ID.

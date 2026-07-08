# Compare Schema Before Migration

Use this pattern when the user asks to compare current schema with a planned migration, check whether a migration is safe, or inspect existing data before changing schema.

## Workflow

1. Create a Dory Agent Run.
2. Identify the target connection and database/schema.
3. Use `dory_explore_schema` with `describe_table` and `get_ddl` for affected tables.
4. Run read-only checks for data shape, nullability assumptions, duplicates, foreign-key-like relationships, and row counts.
5. Save schema DDL and validation SQL in Dory workspace tabs.
6. Finish with findings, risks, and steps performed.

## Guardrails

- Do not apply migrations from this workflow.
- Keep checks read-only.
- Verify actual column types and constraints instead of relying on application models.
- Call out risk when data violates the migration assumption.

## Report Shape

List compatible assumptions, blocking data issues, and the Dory workspace where DDL and validation queries were saved.

# Debug Production Query

Use this pattern when the user asks why production data looks wrong, why a record is missing, or whether application state matches an expected behavior.

## Workflow

1. Call `dory_create_work` with a concise incident or issue title.
2. List connections unless the user provided `connectionId`.
3. Explore schema for the smallest set of likely tables.
4. Inspect columns, indexes/DDL if useful, and time columns before writing SQL.
5. Run narrow read-only queries for the affected entity, time window, or status.
6. Compare expected and actual records.
7. Save the investigation SQL/result in a Dory workspace tab.
8. Finish the Agent Run with findings, steps, and unresolved caveats.

## Guardrails

- Query the smallest relevant scope first.
- Avoid dumping raw customer data into chat.
- Preserve exact SQL in Dory for review.
- Do not mutate production data unless the user explicitly asks and an approved Dory write path exists.

## Report Shape

Lead with what was verified, what appears inconsistent, and where the saved investigation lives in Dory.

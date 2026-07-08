# Create Analysis Workspace

Use this pattern when the user asks for a metric, trend, cohort, funnel, dashboard source query, or other multi-step analysis.

## Workflow

1. Create a Dory Agent Run with `dory_create_work`.
2. Clarify or state metric assumptions: numerator, denominator, filters, grouping, and time range.
3. List connections and inspect schema.
4. Validate table relationships and date columns using limited previews/profiles.
5. Run a small validation query first.
6. Run the final read-only query with explicit columns and clear aliases.
7. Save the final SQL/result in a Dory workspace tab with a readable tab name.
8. Finish with concise findings and execution steps.

## Guardrails

- Do not invent metric definitions.
- Use bounded result sets and explicit filters.
- Include caveats for sampled, truncated, or partial results.
- Save reusable analysis SQL in Dory so a human can edit and rerun it.

## Report Shape

Summarize the metric definition, result, workspace location, and one useful follow-up only if it is obvious.

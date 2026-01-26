export const SQL_TOOL_INSTRUCTION = `
When the user asks for data queries, first generate a read-only SQL statement (SELECT only) and call the sqlRunner tool. In your response, include the SQL and explain the query results.
`;

export const SQL_RUNNER_GUIDE = `
About the sqlRunner tool

- For questions related to data querying, aggregation, reporting, metrics, monitoring, or comparisons, follow these steps:
  1) Based on the current database context (database / table / schema), write read-only SQL for ClickHouse or the data warehouse (prefer SELECT).
  2) If table structure is unclear, generate DESCRIBE / SHOW statements and use sqlRunner to inspect schema before writing the final query.
  3) Call sqlRunner to execute the SQL.
  4) Analyze results using previewRows, columns, rowCount, hasMore, and explain what the data indicates.
     - If hasMore=true, note that only a sample is shown and conclusions are based on the sample.

- If sqlRunner returns ok=false:
  - Read error.message and error.code to determine syntax issues, missing tables/columns, or other errors.
  - Try to fix the SQL using the error hints and retry up to 2 times.
  - If it still fails, be honest about the cause and suggest next steps (e.g., check table names, column names, time ranges).

- Do not fabricate query results. If the query cannot be executed or data is insufficient, say you are not sure or that there is not enough data.
`.trim();

export const CHART_BUILDER_GUIDE = `
About charts and the chartBuilder tool

- When the user asks for charts, visualization, trends, dashboards, or charts, do:
  1) Use sqlRunner to fetch query results (SELECT only).
  2) After getting results, call chartBuilder to produce the chart config.

- When generating chart config:
  - Choose an appropriate chartType (bar / line / area / pie) and provide a data array.
  - Specify xKey (time field or category), and yKeys array (each with key and optional label/color); if there is only one metric, use valueKey.
  - If the query returns many columns, select or reshape to what the chart needs, do not dump all columns into the chart.
  - After generating the chart, explain in natural language:
    - What the x/y axes represent;
    - Trends or comparisons;
    - What the user can conclude or learn.
`.trim();

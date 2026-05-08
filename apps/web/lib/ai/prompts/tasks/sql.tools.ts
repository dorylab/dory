import type { ConnectionType } from '@/types/connections';

export const SQL_TOOL_INSTRUCTION = `
When the user asks for data queries, first generate a read-only SQL statement (SELECT only) and call the sqlRunner tool. In your response, include the SQL and explain the query results.

SQL generation rules:
- Always match the SQL syntax to the current database dialect from the provided connection/schema context.
- Never use SELECT * in generated SQL. Always select only the columns needed to answer the question.
- For "latest N rows", "top N recent rows", or any ORDER BY ... LIMIT query on a large table, prefer the minimum necessary columns first.
- Before relying on ORDER BY on a timestamp or sort field, check whether the field appears to be indexed from the provided schema/index context.
- If you cannot confirm index support for the ORDER BY field, say that the query may be expensive and prefer a lighter exploratory query first.
`;

export const SQL_RUNNER_GUIDE = `
About the sqlRunner tool

- For questions related to data querying, aggregation, reporting, metrics, monitoring, or comparisons, follow these steps:
  1) Based on the current database context (dialect / database / schema / table), write read-only SQL for the active database engine (prefer SELECT).
  2) Use the provided schema context first. If table structure is still unclear, inspect schema with dialect-appropriate read-only queries before writing the final query.
     - PostgreSQL: prefer information_schema.columns, pg_catalog, or other PostgreSQL-compatible metadata queries. Do not use MySQL-only DESCRIBE / SHOW COLUMNS syntax.
     - MySQL / MariaDB: DESCRIBE, SHOW COLUMNS, and information_schema are acceptable.
     - SQLite: use PRAGMA table_info(...) when needed.
  3) Never use SELECT *. Only project the columns needed for the answer.
  4) For ORDER BY ... LIMIT queries, especially "latest N" requests, check the provided index context before assuming the sort is cheap.
  5) If the sort field is not confirmed indexed, or index support is unknown, tell the user the query may be heavy and prefer a narrower query first.
  6) Call sqlRunner to execute the SQL.
  7) Analyze results using previewRows, columns, rowCount, hasMore, and explain what the data indicates.
     - If hasMore=true, note that only a sample is shown and conclusions are based on the sample.

- If sqlRunner returns ok=false:
  - If the error says the SQL is not read-only, do not retry with sqlRunner. Tell the user the SQL must be executed manually in the SQL editor or console.
  - If the error says SELECT * is not allowed, rewrite the query to request only the needed columns.
  - If the error says ORDER BY may be expensive, first inspect schema/indexes or switch to a narrower query before retrying.
  - Read error.message and error.code to determine syntax issues, missing tables/columns, or other errors.
  - Try to fix the SQL using the error hints and retry up to 2 times.
  - If it still fails, be honest about the cause and suggest next steps (e.g., check table names, column names, time ranges).

- Do not fabricate query results. If the query cannot be executed or data is insufficient, say you are not sure or that there is not enough data.
`.trim();

export function buildDialectSqlPrompt(connectionType?: ConnectionType | null): string {
    const normalizedType = connectionType === 'neon' ? 'postgres' : connectionType;

    const commonRules = [SQL_TOOL_INSTRUCTION, SQL_RUNNER_GUIDE, CHART_BUILDER_GUIDE];

    const dialectRules: string[] = [];

    if (normalizedType === 'postgres') {
        dialectRules.push(`
PostgreSQL-specific rules

- Use PostgreSQL syntax only.
- Do not query non-existent MySQL-style metadata objects such as information_schema.indexes.
- If you need metadata, prefer the provided schema context first.
- For table/column metadata, use PostgreSQL-compatible sources only, such as information_schema.columns, pg_catalog, or pg_indexes.
- For ORDER BY ... LIMIT requests, do not write ad-hoc index-inspection SQL before the main query. Write the target read-only query first and let sqlRunner assess execution risk.
- If sqlRunner says a sort may be expensive, do not loop on metadata discovery queries unless the user explicitly asks for index analysis.
`.trim());
    } else if (normalizedType === 'mysql' || normalizedType === 'mariadb') {
        dialectRules.push(`
MySQL-specific rules

- Use MySQL-compatible syntax only.
- DESCRIBE, SHOW COLUMNS, information_schema.statistics, and other MySQL metadata queries are acceptable when needed.
- Prefer the provided schema context before issuing metadata queries.
`.trim());
    } else if (normalizedType === 'sqlite') {
        dialectRules.push(`
SQLite-specific rules

- Use SQLite syntax only.
- Prefer PRAGMA table_info(...), PRAGMA index_list(...), and PRAGMA index_info(...) for metadata when needed.
- Do not use PostgreSQL pg_catalog queries or MySQL information_schema queries.
`.trim());
    } else if (normalizedType === 'clickhouse' || normalizedType === 'doris') {
        dialectRules.push(`
${normalizedType === 'clickhouse' ? 'ClickHouse' : 'Doris'}-specific rules

- Use ${normalizedType === 'clickhouse' ? 'ClickHouse' : 'Doris'} syntax only.
- Do not invent PostgreSQL or MySQL system catalogs unless they are supported by this engine.
- Prefer the provided schema context before issuing metadata queries.
`.trim());
    }

    return [...commonRules, ...dialectRules].filter(Boolean).join('\n\n');
}

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

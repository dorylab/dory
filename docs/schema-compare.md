# Schema Compare

Dory Schema Compare helps humans and agents understand database changes. It is a deployment-review workflow, not a migration executor.

## Direction

Every comparison is directional:

```text
Current → Desired
```

The result describes what would change when evolving Current toward Desired. Dory does not infer table or column renames and does not generate or execute migration SQL in this phase.

## Supported comparisons

All registered drivers expose schema snapshots. Comparisons are limited to the same dialect family:

- PostgreSQL, Neon, and Supabase
- MySQL and MariaDB
- SQLite and Cloudflare D1
- ClickHouse, DuckDB, Oracle, Snowflake, and SQL Server within their own engine

Drivers report metadata coverage as `complete`, `partial`, `unavailable`, or `not_applicable`. Missing metadata never becomes a false “removed” change. A coverage gap downgrades deployment readiness to `unknown` or `review_required`.

## What Dory compares

Phase 1 covers:

- tables and columns
- indexes
- primary key, foreign key, unique, and check constraints
- views and materialized views
- safe catalog statistics such as estimated rows, table bytes, and cumulative index scans

Dory does not read application rows, run `count(*)`, sample tables, or perform full scans. Cumulative index scans remain labeled as catalog counters and are never converted into “queries per month.”

## Results and risk

The deterministic engine classifies the comparison as:

- `compatible`
- `review_required`
- `unsafe`
- `unknown`

Each change is stored in a reusable `schema-diff` ResultSet. The Compare page can render that same ResultSet as cards, a table, or a chart and can filter, sort, search, and export it as CSV or Parquet.

The optional AI Review runs after the deterministic diff. It receives coverage, the canonical summary, safe statistics, and at most the 100 highest-priority changes. It does not receive data rows, credentials, or connection secrets. AI can explain evidence and cite canonical `changeId` values, but it cannot modify risk levels or deployment readiness.

## Agent workflow

1. Create a Dory Agent Run with `dory_create_work`.
2. Call `dory_compare_schema` with the returned `workId` and explicit Current and Desired endpoints.
3. Inspect the bounded summary or open the returned workspace URL for the complete ResultSet.
4. Call `dory_analyze_database_changes` with the same `workId` and `comparisonId` when an AI explanation is useful.

Comparison tools write timeline events and link the Diff ResultSet to the Agent Run.

## Retention and deletion

Comparison jobs, snapshots, and derived ResultSets use the organization ResultSet retention period. A failed job remains visible with diagnostic state; incomplete artifacts are cleaned. Timed-out running jobs are marked failed and can be replaced by a new comparison.

Deleting a comparison removes only Dory-owned job metadata, snapshots, the derived ResultSet, and its exports. It never changes either connected database.

## Local verification fixtures

Generate four Current/Desired SQLite pairs, register them in a local Dory workspace, and create their initial immutable comparisons:

```bash
yarn workspace web schema-compare:fixtures
```

By default the command adds the fixtures to every organization in the configured local Dory database. Limit it to one organization by ID or slug:

```bash
yarn workspace web schema-compare:fixtures --organization my-organization
```

Open `/<organization>/compare`, then select each matching pair:

| Pair | Expected deterministic result |
| --- | --- |
| `Compare Lab · 01 No changes` | Zero changes |
| `Compare Lab · 02 Safe additions` | Table/index additions, a nullable column, and a compatible `VARCHAR` widening; no breaking changes |
| `Compare Lab · 03 Review changes` | Default, view, and ordinary-index changes; a required column with a default; an index semantic rename |
| `Compare Lab · 04 Unsafe breaking` | Removed table/columns/key behavior and a required column without a default; readiness is `unsafe` |

Use the `prod` connection as Current and the corresponding `staging` connection as Desired. SQLite does not expose every constraint or statistics capability, so otherwise safe or identical pairs can still have `unknown` readiness; the individual changes and risks remain deterministic.

The generated databases live under `apps/web/.tmp/schema-compare-fixtures`. Re-running the command recreates those fixture files, updates the existing named connections, and reuses an existing successful comparison for each pair instead of creating duplicate history.

PGlite storage should only be opened by one process. When the local app uses `DB_TYPE=pglite`, stop the dev server before running the seed command, then restart it. To seed and verify an already-running demo server through its authenticated Action API, use:

```bash
SCHEMA_COMPARE_FIXTURES_LIVE=1 \
PLAYWRIGHT_BASE_URL=http://localhost:3000 \
yarn exec playwright test tests/e2e/schema-compare-live-fixtures.spec.ts --project=chromium
```

# Schema Compare

Dory Schema Compare helps humans and agents understand database changes. A saved `Comparison` describes a database relationship that matters over time; each immutable `Run` captures one deterministic check. It is a deployment-review workflow, not a migration executor.

The supported product routes are `/<organization>/comparisons/**`. The earlier `/<organization>/compare/**` routes are not redirected and return 404.

## Direction

Every comparison is directional:

```text
Source → Target
```

Source is the current/base state and Target is the desired state. The result describes what would change when evolving Source toward Target. Dory does not infer table or column renames and does not generate or execute migration SQL.

## Supported comparisons

The first release supports the drivers that implement Schema Snapshot, and both endpoints must belong to the same dialect family:

- PostgreSQL, Neon, and Supabase
- MySQL and MariaDB
- SQLite and Cloudflare D1

Drivers report metadata coverage as `complete`, `partial`, `unavailable`, or `not_applicable`. Missing metadata never becomes a false “removed” change. A coverage gap downgrades deployment readiness to `unknown` or `review_required`.

## What Dory compares

Each Comparison can include or exclude these deterministic Diff types:

- tables and columns
- indexes
- primary key, foreign key, unique, and check constraints
- views and materialized views

Safe catalog statistics such as estimated rows, table bytes, and cumulative index scans are always collected as risk evidence; they are not a selectable Diff type. One schema filter applies to both endpoints. Drivers without schema support store an empty filter.

Dory does not read application rows, run `count(*)`, sample tables, or perform full scans. Cumulative index scans remain labeled as catalog counters and are never converted into “queries per month.”

## Results and risk

The deterministic engine classifies the comparison as:

- `compatible`
- `review_required`
- `unsafe`
- `unknown`

Each successful Run stores immutable Source and Target snapshots, the canonical Diff, and its summary. It also creates a permanent `schema-diff` ResultSet projection for cards, tables, charts, filters, search, and CSV or Parquet export. The Run page groups Git-style before/after changes by tables, columns, indexes, constraints, and views.

The optional AI Review runs after the deterministic diff. It receives coverage, the canonical summary, safe statistics, and at most the 100 highest-priority changes. It does not receive data rows, credentials, or connection secrets. AI can explain evidence and cite canonical `changeId` values, but it cannot modify risk levels or deployment readiness.

## Agent workflow

1. Create a Dory Agent Run with `dory_create_work`.
2. Call `dory_compare_schema` with the returned `workId`.
    - Pass `comparisonId` to run an existing saved Comparison.
    - Or pass `name`, `source`, and `target` to save a Comparison and execute its first Run.
3. Inspect the returned `comparisonId`, `runId`, changes, risks, readiness, and highest-risk changes, or open the workspace URL for the immutable Run.
4. Call `dory_analyze_database_changes` with the same `workId` and returned `runId` when an AI explanation is useful.

Comparison tools write timeline events and can link an organization-accessible existing Run to the current Agent Run. AI Review explains deterministic risk but cannot modify canonical risk or readiness.

## Lifecycle and retention

Creating a Comparison immediately executes its first Run. Editing Source, Target, schema filter, or selected object types increments the configuration version and executes a new Run; renaming alone does not. Editing and deletion are blocked while a Run is active. A failed first Run leaves the saved Comparison and failed Run available for repair and retry.

Runs, snapshots, AI Review files, and derived ResultSets are retained until the entire Comparison is deleted. Individual Runs cannot be deleted. Deleting a Comparison removes only Dory-owned metadata, artifacts, ResultSets, and exports; it never changes either connected database.

The first-class Comparison migration starts with an empty Comparison catalog. One-off `comparison_jobs`, their ResultSet projections, and their Artifact references are not imported into the new model.

## Local verification fixtures

Generate four Source/Target SQLite pairs, register them in a local Dory workspace, and create their initial saved Comparisons and immutable Runs:

```bash
yarn workspace web schema-compare:fixtures
```

By default the command adds the fixtures to every organization in the configured local Dory database. Limit it to one organization by ID or slug:

```bash
yarn workspace web schema-compare:fixtures --organization my-organization
```

Open `/<organization>/comparisons` to inspect the saved fixture Comparisons:

| Pair                               | Expected deterministic result                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `Compare Lab · 01 No changes`      | Zero changes                                                                                          |
| `Compare Lab · 02 Safe additions`  | Table/index additions, a nullable column, and a compatible `VARCHAR` widening; no breaking changes    |
| `Compare Lab · 03 Review changes`  | Default, view, and ordinary-index changes; a required column with a default; an index semantic rename |
| `Compare Lab · 04 Unsafe breaking` | Removed table/columns/key behavior and a required column without a default; readiness is `unsafe`     |

The `prod` connection is Source and the corresponding `staging` connection is Target. SQLite does not expose every constraint or statistics capability, so otherwise safe or identical pairs can still have `unknown` readiness; the individual changes and risks remain deterministic.

The generated databases live under `apps/web/.tmp/schema-compare-fixtures`. Re-running the command recreates those fixture files, updates the existing named connections, and reuses the saved Comparison for each pair instead of creating duplicates.

PGlite storage should only be opened by one process. When the local app uses `DB_TYPE=pglite`, stop the dev server before running the seed command, then restart it. To seed and verify an already-running demo server through its authenticated Action API, use:

```bash
SCHEMA_COMPARE_FIXTURES_LIVE=1 \
PLAYWRIGHT_BASE_URL=http://localhost:3000 \
yarn exec playwright test tests/e2e/schema-compare-live-fixtures.spec.ts --project=chromium
```

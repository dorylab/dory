# Dory Now Supports Snowflake

Published: 2026-07-03

Dory now supports Snowflake as a first-class data source, giving teams a faster way to query, explore, and collaborate on Snowflake data from an AI-native SQL workspace.

With this release, Snowflake users can create and test connections, run SQL in the console, browse databases, schemas, tables, and views, preview table data, and use Dory's workspace model to keep queries, result sets, and context organized in one place.

## Why Snowflake Support Matters

Snowflake is a core analytical database for many modern data teams. It often holds the datasets that matter most for reporting, product analytics, finance, operations, and AI-assisted analysis. But working with those datasets increasingly involves more than writing a query and copying the result somewhere else.

Teams need a workspace where humans and AI agents can work against the same database context:

- Analysts need a focused SQL console for exploring and validating data.
- Engineers need predictable connection behavior across desktop and self-hosted deployments.
- Operators need clear authentication boundaries and safe secret handling.
- AI agents need structured schema access and query execution without turning database work into an opaque chat transcript.

Dory's Snowflake support is designed for that workflow.

## What Is Included

The first Snowflake release supports the core database workflows needed for everyday analysis:

- Create and test Snowflake connections
- Run SQL from Dory's SQL Console
- Browse Snowflake databases and schemas
- List tables and views
- Inspect table columns
- Preview table data
- Use default warehouse, database, schema, and role session options
- Authenticate with password or key-pair authentication

Snowflake joins Dory's existing data source system as a native connection type, so it participates in the same workspace, query, result set, and schema browsing flows as other supported databases.

## Authentication Options

Dory supports two Snowflake authentication methods in this release.

### Password Authentication

Password authentication is the simplest setup path. Users provide:

- Account identifier
- Warehouse
- Default database
- Default schema
- Username
- Optional default role
- Password

This is useful for quick validation, small self-hosted deployments, and teams that already manage Snowflake users with password-based access.

### Key-Pair Authentication

Dory also supports Snowflake key-pair authentication using a pasted PEM private key. This is the recommended path for many production-style service users because it avoids storing a normal Snowflake password.

Users provide:

- Account identifier
- Warehouse
- Default database
- Default schema
- Username
- Optional default role
- PEM private key
- Optional private key passphrase

Dory uses the private key content directly. It does not rely on a local private key file path, which keeps behavior consistent across Dory Desktop and web self-hosted deployments.

## How It Works in the Workspace

After a Snowflake connection is saved, users can open it in Dory and start working immediately.

In the SQL Console, users can run normal Snowflake SQL such as:

```sql
select current_database(), current_schema(), current_role(), current_warehouse();
```

In the Explorer, users can navigate Snowflake's object hierarchy:

```text
Database
  Schema
    Tables
    Views
    Columns
```

Table previews use Snowflake-aware identifier quoting and pagination, so users can inspect data without manually writing preview queries.

## Built for Human and Agent Workflows

Dory is not just a SQL editor. It is an AI-native data workspace where SQL, result sets, schema context, charts, saved queries, and agent work can live together.

Snowflake support extends that model to one of the most important cloud data platforms. A user can explore Snowflake manually, ask an AI assistant to help write or refine SQL, inspect the exact query that was executed, and continue the analysis inside the same workspace.

For agent workflows, this matters because database actions become reviewable and editable. Instead of returning only a text answer, Dory preserves the real SQL and result context so humans can audit, rerun, adjust, and build on the work.

## Deployment Notes

Snowflake support is available in the shared Dory web application runtime, which powers both Dory Desktop and web self-hosted deployments.

The first release intentionally keeps the supported surface focused:

- Supported: password authentication
- Supported: key-pair authentication with PEM private key content
- Supported: warehouse, database, schema, and role session options
- Supported: databases, schemas, tables, views, columns, and table preview
- Not included yet: SSO, OAuth, MFA, native Okta SSO, token cache, workload identity federation, or local private key file paths

This focused scope keeps the first release predictable and portable across deployment modes.

## Getting Started

To connect Dory to Snowflake:

1. Create a Snowflake user or service user with access to the target warehouse, database, schema, tables, and views.
2. Open Dory and create a new Snowflake connection.
3. Enter the Snowflake account identifier, warehouse, database, schema, username, and role.
4. Choose password or key-pair authentication.
5. Test the connection.
6. Save the connection and open it in the SQL Console.

A simple validation query is:

```sql
select
    current_database() as database_name,
    current_schema() as schema_name,
    current_role() as role_name,
    current_warehouse() as warehouse_name;
```

If that query succeeds, users can move on to schema browsing, table preview, and normal SQL analysis.

## What Comes Next

This release establishes the foundation for Snowflake in Dory. Future iterations can expand the integration with deeper governance metadata, richer object coverage, advanced authentication options, and more Snowflake-specific workflow improvements.

For now, the goal is straightforward: make Snowflake feel like a native part of Dory's SQL and AI workspace.


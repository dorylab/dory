import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { eq, sql } from 'drizzle-orm';

const dbDir = await mkdtemp(path.join(os.tmpdir(), 'dory-query-history-restore-db-'));

process.env.DB_TYPE = 'pglite';
process.env.PGLITE_DB_PATH = dbDir;

const { getClient } = await import('@dory/database/postgres/client');
const { resetPgliteClient } = await import('@dory/database/postgres/client/pglite');
const { queryAudit } = await import('@dory/database/postgres/schemas');
const { PgAuditQueryRepository } = await import('@dory/database/postgres/impl/audit/query');

const db = await getClient();

async function initSchema() {
    await db.execute(sql`
        CREATE TABLE "query_audit" (
            "id" text PRIMARY KEY NOT NULL,
            "organization_id" text NOT NULL,
            "tab_id" text,
            "user_id" text NOT NULL,
            "source" text NOT NULL,
            "connection_id" text,
            "connection_name" text,
            "identity_id" text,
            "identity_name" text,
            "identity_username" text,
            "identity_role" text,
            "identity_database" text,
            "database_name" text,
            "query_id" text,
            "sql_text" text NOT NULL,
            "status" text NOT NULL,
            "error_message" text,
            "duration_ms" integer,
            "rows_read" integer,
            "bytes_read" integer,
            "rows_written" integer,
            "created_at" timestamp with time zone NOT NULL,
            "extra_json" jsonb
        )
    `);
    await db.execute(sql`
        CREATE TABLE "connections" (
            "id" text PRIMARY KEY NOT NULL,
            "organization_id" text NOT NULL,
            "type" text NOT NULL,
            "host" text,
            "port" integer,
            "http_port" integer,
            "options" text NOT NULL DEFAULT '{}'
        )
    `);
    await db.execute(sql`
        CREATE TABLE "result_sets" (
            "id" text PRIMARY KEY NOT NULL,
            "organization_id" text NOT NULL,
            "session_id" text,
            "set_index" integer,
            "row_count" integer,
            "preview_row_count" integer NOT NULL DEFAULT 0,
            "schema_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
            "data_availability" text NOT NULL DEFAULT 'none',
            "status" text NOT NULL,
            "limited" boolean NOT NULL DEFAULT false,
            "limit" integer
        )
    `);
}

async function seedHistory() {
    await db.execute(sql`
        INSERT INTO "connections" ("id", "organization_id", "type", "host", "port", "http_port", "options")
        VALUES ('conn_history', 'org_history', 'postgres', 'localhost', 5432, NULL, '{}')
    `);
    await db.execute(sql`
        INSERT INTO "query_audit" (
            "id",
            "organization_id",
            "tab_id",
            "user_id",
            "source",
            "connection_id",
            "query_id",
            "sql_text",
            "status",
            "duration_ms",
            "created_at",
            "extra_json"
        )
        VALUES
            ('audit_set_0', 'org_history', 'tab_history', 'user_history', 'user_sql_console', 'conn_history', 'session_history', 'select 1', 'success', 11, '2026-07-09T00:00:00.000Z', '{"statementIndex": 0}'::jsonb),
            ('audit_set_1', 'org_history', 'tab_history', 'user_history', 'user_sql_console', 'conn_history', 'session_history', 'select 2', 'success', 22, '2026-07-09T00:00:01.000Z', '{"statementIndex": 1}'::jsonb),
            ('audit_old', 'org_history', 'tab_history', 'user_history', 'user_sql_console', 'conn_history', 'session_history', 'select old', 'success', 33, '2026-07-09T00:00:02.000Z', '{}'::jsonb)
    `);
    await db.execute(sql`
        INSERT INTO "result_sets" (
            "id",
            "organization_id",
            "session_id",
            "set_index",
            "row_count",
            "preview_row_count",
            "schema_json",
            "data_availability",
            "status",
            "limited",
            "limit"
        )
        VALUES
            ('rs_history_0', 'org_history', 'session_history', 0, 1, 1, '[{"name":"one","logicalType":"number"}]'::jsonb, 'full', 'success', false, 100),
            ('rs_history_1', 'org_history', 'session_history', 1, 1, 1, '[{"name":"two","logicalType":"number"}]'::jsonb, 'full', 'success', true, 200)
    `);
}

await initSchema();
await seedHistory();

test.after(async () => {
    await resetPgliteClient();
    await rm(dbDir, { recursive: true, force: true });
});

test('query audit search returns result set summaries by session id and statement index', async () => {
    const repo = new PgAuditQueryRepository();
    const result = await repo.search({
        organizationId: 'org_history',
        sources: ['user_sql_console'],
        connectionId: 'conn_history',
        limit: 10,
    });

    const set0 = result.items.find(item => item.id === 'audit_set_0');
    const set1 = result.items.find(item => item.id === 'audit_set_1');
    const old = result.items.find(item => item.id === 'audit_old');

    assert.equal(set0?.query_id, 'session_history');
    assert.equal(set0?.result_set?.resultSetId, 'rs_history_0');
    assert.equal(set0?.result_set?.sessionId, 'session_history');
    assert.equal(set0?.result_set?.setIndex, 0);
    assert.equal(set0?.result_set?.durationMs, 11);
    assert.deepEqual(set0?.result_set?.columns, [{ name: 'one', logicalType: 'number' }]);

    assert.equal(set1?.result_set?.resultSetId, 'rs_history_1');
    assert.equal(set1?.result_set?.setIndex, 1);
    assert.equal(set1?.result_set?.limited, true);
    assert.equal(set1?.result_set?.limit, 200);

    assert.equal(old?.result_set, null);
});

test('query audit search keeps history but omits result set after cleanup deletes the result set row', async () => {
    await db.delete(queryAudit).where(eq(queryAudit.id, 'audit_old'));
    await db.execute(sql`DELETE FROM "result_sets" WHERE "id" = 'rs_history_0'`);

    const repo = new PgAuditQueryRepository();
    const result = await repo.search({
        organizationId: 'org_history',
        sources: ['user_sql_console'],
        connectionId: 'conn_history',
        q: 'select 1',
        limit: 10,
    });

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.id, 'audit_set_0');
    assert.equal(result.items[0]?.sql_text, 'select 1');
    assert.equal(result.items[0]?.result_set, null);
});

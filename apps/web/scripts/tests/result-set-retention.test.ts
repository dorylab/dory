import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { eq, sql } from 'drizzle-orm';

import { AgentRunArtifactStore, FilesystemObjectStore, ResultSetArtifactStore, type DoryArtifactStore } from '@dory/artifacts';
import { NoopFullDataWriter } from '@dory/resultset';

const dbDir = await mkdtemp(path.join(os.tmpdir(), 'dory-result-set-retention-db-'));
const artifactDir = await mkdtemp(path.join(os.tmpdir(), 'dory-result-set-retention-artifacts-'));

process.env.DB_TYPE = 'pglite';
process.env.PGLITE_DB_PATH = dbDir;

const { getClient } = await import('@dory/database/postgres/client');
const { resetPgliteClient } = await import('@dory/database/postgres/client/pglite');
const { user, organizations, resultSets, queryRuns, agentRunResultSets } = await import('@dory/database/postgres/schemas');
const { PostgresOrganizationsRepository, DEFAULT_RESULT_SET_RETENTION_DAYS } = await import('@dory/database/postgres/impl/organization');
const { PostgresResultSetsRepository } = await import('@dory/database/postgres/impl/result-sets');

const db = await getClient();
const objectStore = new FilesystemObjectStore(artifactDir);
const artifacts: DoryArtifactStore = {
    objectStore,
    resultSets: new ResultSetArtifactStore(objectStore, ''),
    agentRuns: new AgentRunArtifactStore(objectStore, ''),
};

async function initSchema() {
    await db.execute(sql`
        CREATE TABLE "user" (
            "id" text PRIMARY KEY NOT NULL,
            "name" text NOT NULL,
            "email" text NOT NULL,
            "is_anonymous" boolean NOT NULL DEFAULT false,
            "email_verified" boolean NOT NULL,
            "created_at" timestamp with time zone NOT NULL,
            "updated_at" timestamp with time zone NOT NULL,
            "image" text,
            "stripe_customer_id" text,
            "last_active_at" timestamp with time zone
        )
    `);
    await db.execute(sql`
        CREATE TABLE "organizations" (
            "id" text PRIMARY KEY NOT NULL,
            "name" text NOT NULL,
            "owner_user_id" text NOT NULL,
            "slug" text,
            "provisioning_kind" text,
            "logo" text,
            "metadata" text,
            "stripe_customer_id" text,
            "created_at" timestamp with time zone NOT NULL,
            "updated_at" timestamp with time zone NOT NULL
        )
    `);
    await db.execute(sql`
        CREATE TABLE "query_runs" (
            "id" text PRIMARY KEY NOT NULL,
            "organization_id" text NOT NULL,
            "connection_id" text,
            "workspace_id" text,
            "tab_id" text,
            "work_id" text,
            "agent_run_id" text,
            "session_id" text,
            "set_index" integer,
            "actor_type" text NOT NULL,
            "actor_id" text,
            "sql" text NOT NULL,
            "status" text NOT NULL DEFAULT 'running',
            "duration_ms" integer,
            "error_message" text,
            "result_set_id" text,
            "created_at" timestamp with time zone NOT NULL,
            "updated_at" timestamp with time zone NOT NULL
        )
    `);
    await db.execute(sql`
        CREATE TABLE "result_sets" (
            "id" text PRIMARY KEY NOT NULL,
            "organization_id" text NOT NULL,
            "connection_id" text,
            "workspace_id" text,
            "tab_id" text,
            "work_id" text,
            "agent_run_id" text,
            "session_id" text,
            "set_index" integer,
            "source_query_run_id" text,
            "source_type" text NOT NULL,
            "kind" text NOT NULL,
            "status" text NOT NULL,
            "row_count" integer,
            "preview_row_count" integer NOT NULL DEFAULT 0,
            "limited" boolean NOT NULL DEFAULT false,
            "limit" integer,
            "schema_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
            "sql" text,
            "operation" text,
            "error_message" text,
            "artifact_ref_json" jsonb NOT NULL,
            "data_availability" text NOT NULL DEFAULT 'none',
            "parent_result_set_id" text,
            "previous_result_set_id" text,
            "refresh_of_result_set_id" text,
            "derived_from_result_set_id" text,
            "created_by_actor_type" text NOT NULL,
            "created_by_actor_id" text,
            "content_hash" text,
            "byte_size" integer,
            "expires_at" timestamp with time zone,
            "created_at" timestamp with time zone NOT NULL,
            "updated_at" timestamp with time zone NOT NULL
        )
    `);
    await db.execute(sql`
        CREATE TABLE "agent_run_result_sets" (
            "id" text PRIMARY KEY NOT NULL,
            "agent_run_id" text NOT NULL,
            "result_set_id" text NOT NULL,
            "query_run_id" text,
            "role" text NOT NULL DEFAULT 'generated',
            "created_at" timestamp with time zone NOT NULL
        )
    `);
    await db.execute(sql`
        CREATE TABLE "work_query_result_sets" (
            "work_id" text NOT NULL,
            "session_id" text NOT NULL,
            "set_index" integer NOT NULL,
            "sql_text" text NOT NULL,
            "sql_op" text,
            "title" text,
            "columns" jsonb,
            "stats" jsonb,
            "view_state" jsonb,
            "ai_profile_version" integer NOT NULL DEFAULT 1,
            "row_count" integer,
            "limited" boolean NOT NULL DEFAULT false,
            "limit" integer,
            "affected_rows" integer,
            "status" text NOT NULL DEFAULT 'success',
            "error_message" text,
            "error_code" text,
            "error_sql_state" text,
            "error_meta" jsonb,
            "warnings" jsonb,
            "started_at" timestamp with time zone,
            "finished_at" timestamp with time zone,
            "duration_ms" integer,
            "result_set_id" text,
            "artifact_ref_json" jsonb
        )
    `);
}

await initSchema();

async function createRepositories() {
    const organizationsRepo = new PostgresOrganizationsRepository();
    await organizationsRepo.init();
    const resultSetsRepo = new PostgresResultSetsRepository(artifacts, new NoopFullDataWriter());
    await resultSetsRepo.init();
    return { organizationsRepo, resultSetsRepo };
}

async function seedOrganization(metadata?: string | null) {
    await db.insert(user).values({
        id: 'user_retention',
        name: 'Retention User',
        email: 'retention@example.com',
        emailVerified: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await db.insert(organizations).values({
        id: 'org_retention',
        name: 'Retention Org',
        ownerUserId: 'user_retention',
        slug: 'retention-org',
        metadata,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
}

test.after(async () => {
    await resetPgliteClient();
    await rm(dbDir, { recursive: true, force: true });
    await rm(artifactDir, { recursive: true, force: true });
});

test('defaults result set retention to 7 days and preserves organization metadata when updated', async () => {
    await seedOrganization(JSON.stringify({ mcp: { enabled: true } }));
    const { organizationsRepo } = await createRepositories();

    assert.equal(await organizationsRepo.getResultSetRetentionDays('org_retention'), DEFAULT_RESULT_SET_RETENTION_DAYS);
    await organizationsRepo.setResultSetRetentionDays('org_retention', 14);
    assert.equal(await organizationsRepo.getResultSetRetentionDays('org_retention'), 14);

    const rows = await db.select({ metadata: organizations.metadata }).from(organizations);
    assert.deepEqual(JSON.parse(rows[0]!.metadata ?? '{}'), {
        mcp: { enabled: true },
        resultSets: { retentionDays: 14 },
    });
});

test('writes expiresAt when persisting result sets and streams', async () => {
    const { resultSetsRepo } = await createRepositories();

    const persisted = await resultSetsRepo.persistQueryResultSet({
        organizationId: 'org_retention',
        userId: 'user_retention',
        connectionId: 'conn_retention',
        tabId: 'tab_retention',
        sessionId: 'session_retention',
        sessionSqlText: 'select 1',
        resultSet: {
            sessionId: 'session_retention',
            setIndex: 0,
            sqlText: 'select 1',
            status: 'success',
            rowCount: 1,
            columns: [{ name: 'id', type: 'integer' }],
        },
        rows: [{ id: 1 }],
    });

    const [persistedRow] = await db.select().from(resultSets).where(eq(resultSets.id, persisted.resultSetId)).limit(1);
    assert.ok(persistedRow);
    assert.ok(persistedRow.expiresAt);
    assert.equal(persistedRow.sessionId, 'session_retention');
    assert.equal(persistedRow.setIndex, 0);
    assert.equal(persistedRow.expiresAt.getTime() - persistedRow.createdAt.getTime(), 14 * 24 * 60 * 60 * 1000);
    const [persistedRun] = await db.select().from(queryRuns).where(eq(queryRuns.resultSetId, persisted.resultSetId)).limit(1);
    assert.equal(persistedRun?.sessionId, 'session_retention');
    assert.equal(persistedRun?.setIndex, 0);

    const streamed = await resultSetsRepo.persistQueryResultSetStream({
        organizationId: 'org_retention',
        userId: 'user_retention',
        connectionId: 'conn_retention',
        tabId: 'tab_retention',
        sessionId: 'session_retention_stream',
        sessionSqlText: 'select 2',
        resultSet: {
            sessionId: 'session_retention_stream',
            setIndex: 0,
            sqlText: 'select 2',
            status: 'success',
            rowCount: 1,
        },
        rows: (async function* () {
            yield { id: 2 };
        })(),
        columns: [{ name: 'id', logicalType: 'number' }],
    });

    const [streamedRow] = await db.select().from(resultSets).where(eq(resultSets.id, streamed.resultSetId)).limit(1);
    assert.ok(streamedRow);
    assert.ok(streamedRow.expiresAt);
    assert.equal(streamedRow.sessionId, 'session_retention_stream');
    assert.equal(streamedRow.setIndex, 0);
    assert.equal(streamedRow.expiresAt.getTime() - streamedRow.createdAt.getTime(), 14 * 24 * 60 * 60 * 1000);
});

test('cleanup deletes expired artifacts and result set rows while keeping query history', async () => {
    const { resultSetsRepo } = await createRepositories();
    const persisted = await resultSetsRepo.persistQueryResultSet({
        organizationId: 'org_retention',
        userId: 'user_retention',
        connectionId: 'conn_retention',
        tabId: 'tab_retention',
        agentRunId: 'run_retention',
        sessionId: 'session_cleanup',
        sessionSqlText: 'select cleanup',
        resultSet: {
            sessionId: 'session_cleanup',
            setIndex: 0,
            sqlText: 'select cleanup',
            status: 'success',
            rowCount: 1,
            columns: [{ name: 'id', type: 'integer' }],
        },
        rows: [{ id: 3 }],
    });

    await db.update(resultSets).set({ expiresAt: new Date('2026-01-01T00:00:00.000Z') }).where(eq(resultSets.id, persisted.resultSetId));
    assert.equal(await artifacts.resultSets.exists(persisted.artifactRef), true);

    const summary = await resultSetsRepo.cleanupExpiredResultSets({ organizationId: 'org_retention', now: new Date('2026-02-01T00:00:00.000Z') });
    assert.deepEqual(summary, { scanned: 1, deleted: 1 });
    assert.equal(await artifacts.resultSets.exists(persisted.artifactRef), false);
    assert.equal((await db.select().from(resultSets).where(eq(resultSets.id, persisted.resultSetId))).length, 0);
    assert.equal((await db.select().from(agentRunResultSets).where(eq(agentRunResultSets.resultSetId, persisted.resultSetId))).length, 0);

    const [queryRun] = await db.select().from(queryRuns).where(eq(queryRuns.id, persisted.queryRunId)).limit(1);
    assert.equal(queryRun?.sql, 'select cleanup');
    assert.equal(queryRun?.resultSetId, null);
});

test('cleanup keeps DB records when artifact deletion fails', async () => {
    const failingArtifacts: DoryArtifactStore = {
        ...artifacts,
        resultSets: ({
            putResultSet: artifacts.resultSets.putResultSet.bind(artifacts.resultSets),
            readManifest: artifacts.resultSets.readManifest.bind(artifacts.resultSets),
            readPreview: artifacts.resultSets.readPreview.bind(artifacts.resultSets),
            openDataParts: artifacts.resultSets.openDataParts.bind(artifacts.resultSets),
            exists: artifacts.resultSets.exists.bind(artifacts.resultSets),
            basePath: artifacts.resultSets.basePath.bind(artifacts.resultSets),
            deleteResultSet: async () => {
                throw new Error('delete failed');
            },
        } as unknown) as DoryArtifactStore['resultSets'],
    };
    const resultSetsRepo = new PostgresResultSetsRepository(failingArtifacts, new NoopFullDataWriter());
    await resultSetsRepo.init();
    const persisted = await resultSetsRepo.persistQueryResultSet({
        organizationId: 'org_retention',
        userId: 'user_retention',
        connectionId: 'conn_retention',
        tabId: 'tab_retention',
        sessionId: 'session_cleanup_failed',
        sessionSqlText: 'select cleanup failed',
        resultSet: {
            sessionId: 'session_cleanup_failed',
            setIndex: 0,
            sqlText: 'select cleanup failed',
            status: 'success',
            rowCount: 1,
            columns: [{ name: 'id', type: 'integer' }],
        },
        rows: [{ id: 4 }],
    });

    await db.update(resultSets).set({ expiresAt: new Date('2026-01-01T00:00:00.000Z') }).where(eq(resultSets.id, persisted.resultSetId));
    await assert.rejects(() => resultSetsRepo.cleanupExpiredResultSets({ organizationId: 'org_retention', now: new Date('2026-02-01T00:00:00.000Z') }), /delete failed/);
    assert.equal((await db.select().from(resultSets).where(eq(resultSets.id, persisted.resultSetId))).length, 1);
});

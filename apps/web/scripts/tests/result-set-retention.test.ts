import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { eq, sql } from 'drizzle-orm';

import { AgentRunArtifactStore, ComparisonArtifactStore, FilesystemObjectStore, ResultSetArtifactStore, type DoryArtifactStore } from '@dory/artifacts';
import { NoopFullDataWriter, type ResultSetDataWriter } from '@dory/resultset';

const dbDir = await mkdtemp(path.join(os.tmpdir(), 'dory-result-set-retention-db-'));
const artifactDir = await mkdtemp(path.join(os.tmpdir(), 'dory-result-set-retention-artifacts-'));

process.env.DB_TYPE = 'pglite';
process.env.PGLITE_DB_PATH = dbDir;

const { getClient } = await import('@dory/database/postgres/client');
const { resetPgliteClient } = await import('@dory/database/postgres/client/pglite');
const { user, organizations, resultSets, resultSetExports, queryRuns, agentRunResultSets } = await import('@dory/database/postgres/schemas');
const {
    ALLOWED_RESULT_SET_MAX_STORAGE_BYTES,
    PostgresOrganizationsRepository,
    DEFAULT_RESULT_SET_MAX_STORAGE_BYTES,
    DEFAULT_RESULT_SET_RETENTION_DAYS,
    isAllowedResultSetMaxStorageBytes,
} = await import('@dory/database/postgres/impl/organization');
const { PostgresResultSetsRepository } = await import('@dory/database/postgres/impl/result-sets');
const { PostgresComparisonsRepository } = await import('@dory/database/postgres/impl/comparisons');

const db = await getClient();
const objectStore = new FilesystemObjectStore(artifactDir);
const artifacts: DoryArtifactStore = {
    objectStore,
    resultSets: new ResultSetArtifactStore(objectStore, ''),
    agentRuns: new AgentRunArtifactStore(objectStore, ''),
    comparisons: new ComparisonArtifactStore(objectStore, ''),
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
        CREATE TABLE "connections" (
            "id" text PRIMARY KEY NOT NULL,
            "organization_id" text NOT NULL,
            "type" text NOT NULL,
            "database" text
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
            "source_connection_type" text,
            "source_database_name" text,
            "workspace_id" text,
            "tab_id" text,
            "work_id" text,
            "agent_run_id" text,
            "session_id" text,
            "set_index" integer,
            "source_query_run_id" text,
            "comparison_id" text,
            "comparison_run_id" text,
            "source_type" text NOT NULL,
            "kind" text NOT NULL,
            "status" text NOT NULL,
            "row_count" integer,
            "preview_row_count" integer NOT NULL DEFAULT 0,
            "limited" boolean NOT NULL DEFAULT false,
            "limit" integer,
            "schema_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
            "view_state" jsonb,
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
            "byte_size" bigint,
            "storage_limit_applied" boolean NOT NULL DEFAULT false,
            "expires_at" timestamp with time zone,
            "created_at" timestamp with time zone NOT NULL,
            "updated_at" timestamp with time zone NOT NULL
        )
    `);
    await db.execute(sql`
        CREATE TABLE "result_set_exports" (
            "id" text PRIMARY KEY NOT NULL,
            "organization_id" text NOT NULL,
            "result_set_id" text,
            "object_path" text NOT NULL,
            "format" text NOT NULL,
            "file_name" text NOT NULL,
            "byte_size" bigint NOT NULL,
            "expires_at" timestamp with time zone NOT NULL,
            "created_at" timestamp with time zone NOT NULL
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
        CREATE TABLE "comparisons" (
            "id" text PRIMARY KEY NOT NULL,
            "organization_id" text NOT NULL,
            "created_by_user_id" text NOT NULL,
            "name" text NOT NULL,
            "kind" text NOT NULL DEFAULT 'schema',
            "source_endpoint" jsonb NOT NULL,
            "target_endpoint" jsonb NOT NULL,
            "schema_filter" jsonb NOT NULL DEFAULT '[]'::jsonb,
            "object_types" jsonb NOT NULL DEFAULT '[]'::jsonb,
            "dialect_family" text NOT NULL,
            "configuration_version" integer NOT NULL DEFAULT 1,
            "latest_run_id" text,
            "latest_successful_run_id" text,
            "created_at" timestamp with time zone NOT NULL,
            "updated_at" timestamp with time zone NOT NULL
        )
    `);
    await db.execute(sql`
        CREATE TABLE "comparison_runs" (
            "id" text PRIMARY KEY NOT NULL,
            "organization_id" text NOT NULL,
            "comparison_id" text NOT NULL,
            "created_by_user_id" text NOT NULL,
            "actor_type" text NOT NULL DEFAULT 'user',
            "work_id" text,
            "status" text NOT NULL DEFAULT 'running',
            "configuration_snapshot" jsonb NOT NULL,
            "coverage" jsonb,
            "summary" jsonb,
            "source_snapshot_hash" text,
            "target_snapshot_hash" text,
            "artifact_ref" jsonb,
            "result_set_id" text,
            "ai_review_status" text NOT NULL DEFAULT 'pending',
            "ai_review" jsonb,
            "ai_review_error" text,
            "failure_code" text,
            "failure_message" text,
            "started_at" timestamp with time zone NOT NULL,
            "updated_at" timestamp with time zone NOT NULL,
            "completed_at" timestamp with time zone
        )
    `);
    await db.execute(sql`
        CREATE UNIQUE INDEX "uidx_comparison_runs_active"
        ON "comparison_runs" ("comparison_id")
        WHERE "status" = 'running'
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
    assert.deepEqual(await organizationsRepo.getResultSetStorageSettings('org_retention'), {
        retentionDays: DEFAULT_RESULT_SET_RETENTION_DAYS,
        maxStorageBytes: DEFAULT_RESULT_SET_MAX_STORAGE_BYTES,
    });
    assert.deepEqual(
        ALLOWED_RESULT_SET_MAX_STORAGE_BYTES,
        [1, 5, 10, 25, 50].map(value => value * 1024 ** 3),
    );
    assert.equal(isAllowedResultSetMaxStorageBytes(25 * 1024 ** 3), true);
    assert.equal(isAllowedResultSetMaxStorageBytes(2 * 1024 ** 3), false);
    await organizationsRepo.setResultSetStorageSettings('org_retention', { retentionDays: 14, maxStorageBytes: 10 * 1024 ** 3 });

    const rows = await db.select({ metadata: organizations.metadata }).from(organizations);
    assert.deepEqual(JSON.parse(rows[0]!.metadata ?? '{}'), {
        mcp: { enabled: true },
        resultSets: { retentionDays: 14, maxStorageBytes: 10 * 1024 ** 3 },
    });
});

test('persists failed queries as metadata without creating result data', async () => {
    const { resultSetsRepo } = await createRepositories();
    const storageBefore = await resultSetsRepo.getStorageUsage('org_retention');

    const persisted = await resultSetsRepo.persistQueryError({
        organizationId: 'org_retention',
        userId: 'user_retention',
        connectionId: 'conn_retention',
        tabId: 'tab_error',
        sessionId: 'session_error',
        sessionSqlText: 'select * from missing_table',
        source: 'sql-console',
        resultSet: {
            sessionId: 'session_error',
            setIndex: 0,
            sqlText: 'select * from missing_table',
            status: 'error',
            durationMs: 7,
            errorMessage: 'no such table: missing_table',
        },
    });

    const [run] = await db.select().from(queryRuns).where(eq(queryRuns.id, persisted.queryRunId)).limit(1);
    const storedResults = await db.select().from(resultSets).where(eq(resultSets.sessionId, 'session_error'));
    const storageAfter = await resultSetsRepo.getStorageUsage('org_retention');
    const session = await resultSetsRepo.getQuerySession({ organizationId: 'org_retention', sessionId: 'session_error' });
    const [errorMeta] = await resultSetsRepo.listSessionResultSets({ organizationId: 'org_retention', sessionId: 'session_error' });

    assert.equal(run?.status, 'error');
    assert.equal(run?.resultSetId, null);
    assert.equal(run?.errorMessage, 'no such table: missing_table');
    assert.equal(storedResults.length, 0);
    assert.deepEqual(storageAfter, storageBefore);
    assert.equal(session?.status, 'error');
    assert.equal(session?.resultSetCount, 1);
    assert.equal(errorMeta?.status, 'error');
    assert.equal(errorMeta?.resultSetId, null);
    assert.equal(errorMeta?.dataAvailability, 'none');
    assert.equal(errorMeta?.byteSize, null);
    assert.equal(errorMeta?.expiresAt, null);
    assert.equal(errorMeta?.errorMessage, 'no such table: missing_table');
});

test('persists Comparison Run projections permanently with both stable identifiers', async () => {
    const { resultSetsRepo } = await createRepositories();
    const persisted = await resultSetsRepo.persistDerivedResultSet({
        organizationId: 'org_retention',
        userId: 'user_retention',
        comparisonId: 'cmp_retention',
        comparisonRunId: 'cmprun_retention',
        rows: [{ changeId: 'chg_1', objectType: 'table', riskLevel: 'low' }],
        kind: 'schema-diff',
        sourceConnectionType: 'sqlite',
        sourceDatabaseName: 'source → target',
        persistent: true,
    });

    const [record] = await db.select().from(resultSets).where(eq(resultSets.id, persisted.resultSetId)).limit(1);
    assert.equal(persisted.expiresAt, null);
    assert.equal(record?.comparisonId, 'cmp_retention');
    assert.equal(record?.comparisonRunId, 'cmprun_retention');
    assert.equal(record?.expiresAt, null);
});

test('Comparison repository maintains immutable Run history, latest pointers, concurrency, and cascade deletion', async () => {
    const { resultSetsRepo } = await createRepositories();
    const comparisonsRepo = new PostgresComparisonsRepository(resultSetsRepo, artifacts);
    await comparisonsRepo.init();
    const comparison = await comparisonsRepo.createComparison({
        organizationId: 'org_retention',
        userId: 'user_retention',
        name: 'Production vs Staging',
        source: { connectionId: 'conn_source', identityId: null, database: 'source' },
        target: { connectionId: 'conn_target', identityId: null, database: 'target' },
        schemaFilter: ['public'],
        objectTypes: ['table', 'column', 'index', 'constraint', 'view'],
        dialectFamily: 'postgres',
    });
    const configurationSnapshot = {
        version: 1 as const,
        configurationVersion: 1,
        name: comparison.name,
        source: comparison.sourceEndpoint,
        target: comparison.targetEndpoint,
        schemaFilter: comparison.schemaFilter,
        objectTypes: comparison.objectTypes,
        dialectFamily: comparison.dialectFamily,
    };
    const firstRun = await comparisonsRepo.createRun({
        organizationId: 'org_retention',
        comparisonId: comparison.id,
        userId: 'user_retention',
        actorType: 'user',
        configurationSnapshot,
    });
    await assert.rejects(
        comparisonsRepo.createRun({
            organizationId: 'org_retention',
            comparisonId: comparison.id,
            userId: 'user_retention',
            actorType: 'user',
            configurationSnapshot,
        }),
        /already in progress/,
    );
    await comparisonsRepo.failRun({
        organizationId: 'org_retention',
        comparisonId: comparison.id,
        runId: firstRun.id,
        code: 'connection_failed',
        message: 'Connection refused',
    });
    const secondRun = await comparisonsRepo.createRun({
        organizationId: 'org_retention',
        comparisonId: comparison.id,
        userId: 'user_retention',
        actorType: 'agent',
        workId: 'work_comparison',
        configurationSnapshot,
    });
    await comparisonsRepo.completeRun({
        organizationId: 'org_retention',
        comparisonId: comparison.id,
        runId: secondRun.id,
        comparison: {
            version: 1,
            family: 'postgres',
            currentHash: 'source_hash',
            desiredHash: 'target_hash',
            coverage: {
                tables: 'complete',
                columns: 'complete',
                indexes: 'complete',
                constraints: 'complete',
                views: 'complete',
                statistics: 'complete',
            },
            summary: {
                totalChanges: 0,
                breakingChanges: 0,
                added: 0,
                removed: 0,
                modified: 0,
                renamed: 0,
                highRisk: 0,
                mediumRisk: 0,
                lowRisk: 0,
                unknownRisk: 0,
                readiness: 'compatible',
            },
            changes: [],
            warnings: [],
        },
        artifactRef: {
            version: 1,
            store: 'filesystem',
            comparisonId: comparison.id,
            runId: secondRun.id,
            basePath: `org_retention/comparisons/${comparison.id}/runs/${secondRun.id}`,
            manifestPath: 'manifest.json',
            sourcePath: 'source.json',
            targetPath: 'target.json',
            diffPath: 'diff.json',
            summaryPath: 'summary.json',
            aiReviewPath: 'ai-review.json',
        },
        resultSetId: 'rs_missing_cleanup_is_tolerated',
    });

    const loaded = await comparisonsRepo.get('org_retention', comparison.id);
    assert.equal(loaded.latestRunId, secondRun.id);
    assert.equal(loaded.latestSuccessfulRunId, secondRun.id);
    assert.equal(loaded.latestSuccessfulRun?.aiReviewStatus, 'not_needed');
    const history = await comparisonsRepo.listRuns('org_retention', comparison.id);
    assert.equal(history.total, 2);
    assert.deepEqual(new Set(history.rows.map(run => run.id)), new Set([firstRun.id, secondRun.id]));

    await comparisonsRepo.delete('org_retention', comparison.id);
    await assert.rejects(comparisonsRepo.get('org_retention', comparison.id), /not found/i);
    assert.equal((await db.select().from(resultSets).where(eq(resultSets.comparisonId, comparison.id))).length, 0);
});

test('writes expiresAt when persisting result sets and streams', async () => {
    const { resultSetsRepo } = await createRepositories();

    const persisted = await resultSetsRepo.persistQueryResultSet({
        organizationId: 'org_retention',
        userId: 'user_retention',
        connectionId: 'conn_retention',
        sourceConnectionType: 'sqlite',
        sourceDatabaseName: 'main',
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
    assert.equal(persistedRow.sourceConnectionType, 'sqlite');
    assert.equal(persistedRow.sourceDatabaseName, 'main');
    assert.equal(persistedRow.expiresAt.getTime() - persistedRow.createdAt.getTime(), 14 * 24 * 60 * 60 * 1000);
    assert.equal(persisted.artifactStore, 'filesystem');
    assert.equal(persisted.storageFormat, 'json');
    assert.equal(persisted.sourceConnectionType, 'sqlite');
    assert.equal(persisted.sourceDatabaseName, 'main');
    assert.equal(persisted.createdAt, persistedRow.createdAt.getTime());
    assert.equal(persisted.expiresAt, persistedRow.expiresAt.getTime());
    assert.ok(persisted.byteSize > 0);
    const [persistedRun] = await db.select().from(queryRuns).where(eq(queryRuns.resultSetId, persisted.resultSetId)).limit(1);
    assert.equal(persistedRun?.sessionId, 'session_retention');
    assert.equal(persistedRun?.setIndex, 0);

    const streamed = await resultSetsRepo.persistQueryResultSetStream({
        organizationId: 'org_retention',
        userId: 'user_retention',
        connectionId: 'conn_retention',
        sourceConnectionType: 'sqlite',
        sourceDatabaseName: 'main',
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
    assert.equal(streamedRow.sourceConnectionType, 'sqlite');
    assert.equal(streamedRow.sourceDatabaseName, 'main');
    assert.equal(streamedRow.expiresAt.getTime() - streamedRow.createdAt.getTime(), 14 * 24 * 60 * 60 * 1000);
    assert.equal(streamed.artifactStore, 'filesystem');
    assert.equal(streamed.storageFormat, 'json');
    assert.equal(streamed.sourceConnectionType, 'sqlite');
    assert.equal(streamed.sourceDatabaseName, 'main');
    assert.equal(streamed.createdAt, streamedRow.createdAt.getTime());
    assert.equal(streamed.expiresAt, streamedRow.expiresAt.getTime());
    assert.ok(streamed.byteSize > 0);

    const [reloaded] = await resultSetsRepo.listSessionResultSets({
        organizationId: 'org_retention',
        sessionId: 'session_retention_stream',
    });
    assert.ok(reloaded);
    assert.equal(reloaded.byteSize, streamed.byteSize);
    assert.equal(reloaded.artifactStore, streamed.artifactStore);
    assert.equal(reloaded.storageFormat, streamed.storageFormat);
    assert.equal(reloaded.sourceConnectionType, streamed.sourceConnectionType);
    assert.equal(reloaded.sourceDatabaseName, streamed.sourceDatabaseName);
    assert.equal(reloaded.createdAt, streamed.createdAt);
    assert.equal(reloaded.expiresAt, streamed.expiresAt);

    await db.execute(sql`
        INSERT INTO "connections" ("id", "organization_id", "type", "database")
        VALUES ('conn_retention', 'org_retention', 'sqlite', 'changed_database')
    `);
    await db.update(resultSets).set({ sourceConnectionType: null, sourceDatabaseName: null }).where(eq(resultSets.id, streamed.resultSetId));
    const [legacyReloaded] = await resultSetsRepo.listSessionResultSets({
        organizationId: 'org_retention',
        sessionId: 'session_retention_stream',
    });
    assert.equal(legacyReloaded?.sourceConnectionType, 'sqlite');
    assert.equal(legacyReloaded?.sourceDatabaseName, 'main');
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

    await db
        .update(resultSets)
        .set({ expiresAt: new Date('2026-01-01T00:00:00.000Z') })
        .where(eq(resultSets.id, persisted.resultSetId));
    assert.equal(await artifacts.resultSets.exists(persisted.artifactRef), true);

    const summary = await resultSetsRepo.cleanupExpiredResultSets({ organizationId: 'org_retention', now: new Date('2026-02-01T00:00:00.000Z') });
    assert.equal(summary.scanned, 1);
    assert.equal(summary.deleted, 1);
    assert.equal(summary.deletedResultSets, 1);
    assert.equal(summary.deletedExports, 0);
    assert.equal(summary.hasMore, false);
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
        resultSets: {
            putResultSet: artifacts.resultSets.putResultSet.bind(artifacts.resultSets),
            readManifest: artifacts.resultSets.readManifest.bind(artifacts.resultSets),
            readPreview: artifacts.resultSets.readPreview.bind(artifacts.resultSets),
            openDataParts: artifacts.resultSets.openDataParts.bind(artifacts.resultSets),
            exists: artifacts.resultSets.exists.bind(artifacts.resultSets),
            basePath: artifacts.resultSets.basePath.bind(artifacts.resultSets),
            deleteResultSet: async () => {
                throw new Error('delete failed');
            },
        } as unknown as DoryArtifactStore['resultSets'],
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

    await db
        .update(resultSets)
        .set({ expiresAt: new Date('2026-01-01T00:00:00.000Z') })
        .where(eq(resultSets.id, persisted.resultSetId));
    const summary = await resultSetsRepo.cleanupExpiredResultSets({ organizationId: 'org_retention', now: new Date('2026-02-01T00:00:00.000Z') });
    assert.equal(summary.failures, 1);
    assert.equal(summary.hasMore, true);
    assert.equal((await db.select().from(resultSets).where(eq(resultSets.id, persisted.resultSetId))).length, 1);
});

test('stores bigint usage and removes exports before result sets when over quota', async () => {
    await db.insert(organizations).values({
        id: 'org_quota',
        name: 'Quota Org',
        ownerUserId: 'user_retention',
        slug: 'quota-org',
        metadata: JSON.stringify({ resultSets: { retentionDays: 7, maxStorageBytes: 1024 ** 3 } }),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const { resultSetsRepo } = await createRepositories();
    const persisted = await resultSetsRepo.persistQueryResultSet({
        organizationId: 'org_quota',
        userId: 'user_retention',
        sessionId: 'session_quota',
        sessionSqlText: 'select quota',
        resultSet: { sessionId: 'session_quota', setIndex: 0, sqlText: 'select quota', status: 'success', rowCount: 1 },
        rows: [{ id: 1 }],
    });
    await db
        .update(resultSets)
        .set({ byteSize: 800 * 1024 ** 2, expiresAt: new Date('2027-01-01T00:00:00.000Z') })
        .where(eq(resultSets.id, persisted.resultSetId));

    const exportPath = 'result-set-exports/org_quota/rse_quota/result.csv';
    await objectStore.put(exportPath, 'export');
    await db.insert(resultSetExports).values({
        id: 'rse_quota',
        organizationId: 'org_quota',
        resultSetId: persisted.resultSetId,
        objectPath: exportPath,
        format: 'csv',
        fileName: 'result.csv',
        byteSize: 400 * 1024 ** 2,
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const before = await resultSetsRepo.getStorageUsage('org_quota');
    assert.equal(before.totalBytes, 1200 * 1024 ** 2);
    const cleanup = await resultSetsRepo.cleanupWorkspaceStorage({ organizationId: 'org_quota', now: new Date('2026-07-01T00:00:00.000Z') });
    assert.equal(cleanup.deletedExports, 1);
    assert.equal(cleanup.deletedResultSets, 0);
    assert.equal(cleanup.usageAfter.totalBytes, 800 * 1024 ** 2);
    assert.equal((await db.select().from(resultSets).where(eq(resultSets.id, persisted.resultSetId))).length, 1);

    await db
        .update(resultSets)
        .set({ byteSize: 3 * 1024 ** 3 })
        .where(eq(resultSets.id, persisted.resultSetId));
    assert.equal((await resultSetsRepo.getStorageUsage('org_quota')).resultSetsBytes, 3 * 1024 ** 3);
});

test('keeps only preview when a single full result exceeds the Workspace limit', async () => {
    const oversizedWriter: ResultSetDataWriter = {
        async write() {
            return {
                format: 'parquet',
                rowCount: 1,
                byteSize: 2 * 1024 ** 3,
                parts: [{ path: 'data/part-00000.parquet', format: 'parquet', rowCount: 1, byteSize: 2 * 1024 ** 3, data: Buffer.from('fake') }],
            };
        },
    };
    const repo = new PostgresResultSetsRepository(artifacts, oversizedWriter);
    await repo.init();
    const persisted = await repo.persistQueryResultSet({
        organizationId: 'org_quota',
        userId: 'user_retention',
        sessionId: 'session_oversized',
        sessionSqlText: 'select oversized',
        resultSet: { sessionId: 'session_oversized', setIndex: 0, sqlText: 'select oversized', status: 'success', rowCount: 1 },
        rows: [{ id: 1 }],
    });

    assert.equal(persisted.storageLimitApplied, true);
    assert.equal(persisted.dataAvailability, 'preview-only');
    assert.match(persisted.warning ?? '', /Workspace storage limit/);
});

test('reclaims unregistered legacy exports after 24 hours', async () => {
    const { resultSetsRepo } = await createRepositories();
    const legacyPath = 'result-set-exports/org_quota/rse_legacy/legacy.csv';
    await objectStore.put(legacyPath, 'legacy');
    const cleanup = await resultSetsRepo.cleanupWorkspaceStorage({ organizationId: 'org_quota', now: new Date(Date.now() + 25 * 60 * 60 * 1000) });
    assert.equal(await objectStore.exists(legacyPath), false);
    assert.equal(cleanup.deletedExports, 1);
    assert.equal(cleanup.bytesFreed, Buffer.byteLength('legacy'));
});

test('deleting a completed export removes its file and database record only', async () => {
    const { resultSetsRepo } = await createRepositories();
    const requestedExportPath = 'result-set-exports/org_retention/rse_export/result.csv';
    const similarlyNamedExportPath = 'result-set-exports/org_retention/rse_export_other/result.csv';
    await objectStore.put(requestedExportPath, 'requested');
    await objectStore.put(similarlyNamedExportPath, 'other');
    await db.insert(resultSetExports).values({
        id: 'rse_export',
        organizationId: 'org_retention',
        resultSetId: null,
        objectPath: requestedExportPath,
        format: 'csv',
        fileName: 'result.csv',
        byteSize: Buffer.byteLength('requested'),
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await resultSetsRepo.deleteExport({ organizationId: 'org_retention', exportId: 'rse_export' });

    assert.equal(await objectStore.exists(requestedExportPath), false);
    assert.equal(await objectStore.exists(similarlyNamedExportPath), true);
    assert.equal((await db.select().from(resultSetExports).where(eq(resultSetExports.id, 'rse_export'))).length, 0);
});

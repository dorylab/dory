import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { PGlite } from '@electric-sql/pglite';

const releasedMigrationHash = '2e273d975e1613f47ee4b4e2bcb87b066a090fd5152031a8866debeeb037cddd';
const migrationRoots = {
    PostgreSQL: new URL('../../../../packages/database/src/postgres/migrations/', import.meta.url),
    PGlite: new URL('../../../../packages/database/src/pglite/migrations/', import.meta.url),
} as const;

async function readMigration(root: URL, name: string) {
    return readFile(new URL(name, root), 'utf8');
}

async function executeMigration(client: PGlite, migration: string) {
    const statements = migration
        .split('--> statement-breakpoint')
        .map(statement => statement.trim())
        .filter(Boolean);

    for (const statement of statements) {
        await client.exec(statement);
    }
}

async function getColumnTypes(client: PGlite, tableName: string) {
    const columns = await client.query<{ column_name: string; data_type: string }>(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
        [tableName],
    );
    return new Map(columns.rows.map(row => [row.column_name, row.data_type]));
}

async function tableExists(client: PGlite, tableName: string) {
    const table = await client.query<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_name = $1`, [tableName]);
    return table.rows.length === 1;
}

test('keeps the PostgreSQL and PGlite ResultSet migrations in sync', async () => {
    for (const name of ['0019_resultset_artifacts.sql', '0020_resultset_schema_updates.sql', '0023_import_runs.sql', '0024_import_transform_stats.sql', '0025_export_runs.sql']) {
        const postgres = await readMigration(migrationRoots.PostgreSQL, name);
        const pglite = await readMigration(migrationRoots.PGlite, name);
        assert.equal(postgres, pglite, `${name} differs between PostgreSQL and PGlite`);
    }
    assert.equal(
        await readMigration(migrationRoots.PostgreSQL, '0021_romantic_paibok.sql'),
        await readMigration(migrationRoots.PGlite, '0021_skinny_squirrel_girl.sql'),
        '0021 Schema Compare migration differs between PostgreSQL and PGlite',
    );
    const firstClassComparisons = await readMigration(migrationRoots.PostgreSQL, '0022_first_class_comparisons.sql');
    const pgliteFirstClassComparisons = await readMigration(migrationRoots.PGlite, '0022_first_class_comparisons.sql');
    assert.equal(firstClassComparisons, pgliteFirstClassComparisons, '0022_first_class_comparisons.sql differs between PostgreSQL and PGlite');
});

test('keeps the compiled PGlite bundle on the released 0019 through export runs', async () => {
    const bundleUrl = new URL('../../../../packages/database/src/pglite/migrations.json', import.meta.url);
    const bundle = JSON.parse(await readFile(bundleUrl, 'utf8')) as Array<{
        folderMillis: number;
        hash: string;
        sql: string[];
    }>;
    const byCreatedAt = new Map(bundle.map(migration => [migration.folderMillis, migration]));
    const releasedMigration = byCreatedAt.get(1783075200000);
    const schemaUpdateMigration = byCreatedAt.get(1784296092000);
    const comparisonMigration = byCreatedAt.get(1784780119152);
    const firstClassComparisonMigration = byCreatedAt.get(1784796637312);
    const importRunsMigration = byCreatedAt.get(1785851842755);
    const transformStatsMigration = byCreatedAt.get(1785866199860);
    const exportRunsMigration = byCreatedAt.get(1786028223308);

    assert.ok(releasedMigration);
    assert.ok(schemaUpdateMigration);
    assert.ok(comparisonMigration);
    assert.ok(firstClassComparisonMigration);
    assert.ok(importRunsMigration);
    assert.ok(transformStatsMigration);
    assert.ok(exportRunsMigration);
    assert.equal(releasedMigration.folderMillis, 1783075200000);
    assert.equal(releasedMigration.hash, releasedMigrationHash);
    assert.equal(schemaUpdateMigration.folderMillis, 1784296092000);
    assert.equal(comparisonMigration.folderMillis, 1784780119152);
    assert.equal(firstClassComparisonMigration.folderMillis, 1784796637312);

    const schemaUpdateSql = await readMigration(migrationRoots.PGlite, '0020_resultset_schema_updates.sql');
    assert.equal(schemaUpdateMigration.hash, createHash('sha256').update(schemaUpdateSql).digest('hex'));
    const comparisonSql = await readMigration(migrationRoots.PGlite, '0021_skinny_squirrel_girl.sql');
    assert.equal(comparisonMigration.hash, createHash('sha256').update(comparisonSql).digest('hex'));
    const firstClassComparisonSql = await readMigration(migrationRoots.PGlite, '0022_first_class_comparisons.sql');
    assert.equal(firstClassComparisonMigration.hash, createHash('sha256').update(firstClassComparisonSql).digest('hex'));
    const importRunsSql = await readMigration(migrationRoots.PGlite, '0023_import_runs.sql');
    assert.equal(importRunsMigration.hash, createHash('sha256').update(importRunsSql).digest('hex'));
    const transformStatsSql = await readMigration(migrationRoots.PGlite, '0024_import_transform_stats.sql');
    assert.equal(transformStatsMigration.hash, createHash('sha256').update(transformStatsSql).digest('hex'));
    const exportRunsSql = await readMigration(migrationRoots.PGlite, '0025_export_runs.sql');
    assert.equal(exportRunsMigration.hash, createHash('sha256').update(exportRunsSql).digest('hex'));
});

for (const [dialect, migrationRoot] of Object.entries(migrationRoots)) {
    test(`creates export run storage with the ${dialect} migration`, async () => {
        const client = new PGlite();
        try {
            await executeMigration(client, await readMigration(migrationRoot, '0025_export_runs.sql'));
            assert.equal(await tableExists(client, 'export_runs'), true);
            assert.equal(await tableExists(client, 'export_run_events'), true);
            const columns = await getColumnTypes(client, 'export_runs');
            assert.equal(columns.get('plan'), 'jsonb');
            assert.equal(columns.get('processed_rows'), 'bigint');
            assert.equal(columns.get('artifact_expires_at'), 'timestamp with time zone');
        } finally {
            await client.close();
        }
    });
}

for (const [dialect, migrationRoot] of Object.entries(migrationRoots)) {
    test(`adds import filtered row counts with the ${dialect} migration`, async () => {
        const client = new PGlite();
        try {
            await client.exec('CREATE TABLE "import_runs" ("id" text PRIMARY KEY NOT NULL);');
            await executeMigration(client, await readMigration(migrationRoot, '0024_import_transform_stats.sql'));
            const columns = await getColumnTypes(client, 'import_runs');
            assert.equal(columns.get('filtered_rows'), 'bigint');
            await client.exec(`INSERT INTO "import_runs" ("id") VALUES ('run_default');`);
            const result = await client.query<{ filtered_rows: bigint }>(`SELECT "filtered_rows" FROM "import_runs" WHERE "id" = 'run_default'`);
            assert.equal(Number(result.rows[0]?.filtered_rows), 0);
        } finally {
            await client.close();
        }
    });
}

for (const [dialect, migrationRoot] of Object.entries(migrationRoots)) {
    test(`upgrades the v0.30.0 ResultSet schema with the ${dialect} migrations`, async () => {
        const client = new PGlite();
        try {
            await client.exec('CREATE TABLE "tabs" ("id" text PRIMARY KEY NOT NULL);');
            await client.exec('CREATE TABLE "work_query_result_sets" ("id" text PRIMARY KEY NOT NULL);');

            const releasedMigration = await readMigration(migrationRoot, '0019_resultset_artifacts.sql');
            const schemaUpdateMigration = await readMigration(migrationRoot, '0020_resultset_schema_updates.sql');
            const comparisonMigration = await readMigration(migrationRoot, dialect === 'PostgreSQL' ? '0021_romantic_paibok.sql' : '0021_skinny_squirrel_girl.sql');
            const firstClassComparisonMigration = await readMigration(migrationRoot, '0022_first_class_comparisons.sql');

            assert.equal(createHash('sha256').update(releasedMigration).digest('hex'), releasedMigrationHash);
            await executeMigration(client, releasedMigration);

            const releasedColumns = await getColumnTypes(client, 'result_sets');
            assert.equal(releasedColumns.get('byte_size'), 'integer');
            assert.equal(releasedColumns.has('source_connection_type'), false);
            assert.equal(releasedColumns.has('source_database_name'), false);
            assert.equal(releasedColumns.has('session_id'), false);
            assert.equal(releasedColumns.has('set_index'), false);
            assert.equal(releasedColumns.has('view_state'), false);
            assert.equal(releasedColumns.has('storage_limit_applied'), false);
            assert.equal(await tableExists(client, 'result_set_exports'), false);

            await client.exec(`
                INSERT INTO "result_sets" (
                    "id",
                    "organization_id",
                    "source_type",
                    "kind",
                    "status",
                    "artifact_ref_json",
                    "created_by_actor_type",
                    "byte_size"
                ) VALUES (
                    'rs_existing',
                    'org_existing',
                    'query',
                    'sql-result-set',
                    'success',
                    '{}'::jsonb,
                    'user',
                    2147483647
                );
            `);

            await executeMigration(client, schemaUpdateMigration);
            await executeMigration(client, schemaUpdateMigration);

            const queryRunColumns = await getColumnTypes(client, 'query_runs');
            assert.equal(queryRunColumns.get('session_id'), 'text');
            assert.equal(queryRunColumns.get('set_index'), 'integer');

            const resultSetColumns = await getColumnTypes(client, 'result_sets');
            assert.equal(resultSetColumns.get('source_connection_type'), 'text');
            assert.equal(resultSetColumns.get('source_database_name'), 'text');
            assert.equal(resultSetColumns.get('session_id'), 'text');
            assert.equal(resultSetColumns.get('set_index'), 'integer');
            assert.equal(resultSetColumns.get('view_state'), 'jsonb');
            assert.equal(resultSetColumns.get('byte_size'), 'bigint');
            assert.equal(resultSetColumns.get('storage_limit_applied'), 'boolean');
            assert.equal(await tableExists(client, 'result_set_exports'), true);

            await executeMigration(client, comparisonMigration);
            assert.equal(await tableExists(client, 'comparison_jobs'), true);
            const comparisonColumns = await getColumnTypes(client, 'comparison_jobs');
            assert.equal(comparisonColumns.get('current_endpoint'), 'jsonb');
            assert.equal(comparisonColumns.get('desired_endpoint'), 'jsonb');
            assert.equal(comparisonColumns.get('snapshot_artifact_ref'), 'jsonb');
            const resultSetColumnsAfterComparison = await getColumnTypes(client, 'result_sets');
            assert.equal(resultSetColumnsAfterComparison.get('comparison_id'), 'text');

            await client.exec(`
                INSERT INTO "comparison_jobs" (
                    "id",
                    "organization_id",
                    "created_by_user_id",
                    "status",
                    "current_endpoint",
                    "desired_endpoint",
                    "dialect_family",
                    "summary",
                    "result_set_id",
                    "created_at",
                    "updated_at",
                    "completed_at"
                ) VALUES (
                    'job_obsolete',
                    'org_existing',
                    'user_existing',
                    'success',
                    '{"connectionId":"conn_source","identityId":null,"database":"source","schemas":["public"]}'::jsonb,
                    '{"connectionId":"conn_target","identityId":null,"database":"target","schemas":["public"]}'::jsonb,
                    'postgres',
                    '{"totalChanges":1,"breakingChanges":0,"added":1,"removed":0,"modified":0,"renamed":0,"highRisk":0,"mediumRisk":0,"lowRisk":1,"unknownRisk":0,"readiness":"compatible"}'::jsonb,
                    'rs_existing',
                    '2026-07-23T00:00:00.000Z',
                    '2026-07-23T00:00:01.000Z',
                    '2026-07-23T00:00:01.000Z'
                );
                UPDATE "result_sets"
                SET "comparison_id" = 'job_obsolete',
                    "expires_at" = now()
                WHERE "id" = 'rs_existing';
            `);

            await executeMigration(client, firstClassComparisonMigration);
            assert.equal(await tableExists(client, 'comparison_jobs'), false);
            assert.equal(await tableExists(client, 'comparisons'), true);
            assert.equal(await tableExists(client, 'comparison_runs'), true);
            const comparisons = await client.query<{ id: string }>(`SELECT id FROM comparisons`);
            assert.deepEqual(comparisons.rows, []);
            const runs = await client.query<{ id: string }>(`SELECT id FROM comparison_runs`);
            assert.deepEqual(runs.rows, []);
            const runColumns = await getColumnTypes(client, 'comparison_runs');
            assert.equal(runColumns.get('comparison_id'), 'text');
            assert.equal(runColumns.get('configuration_snapshot'), 'jsonb');
            assert.equal(runColumns.get('artifact_ref'), 'jsonb');
            const discardedProjection = await client.query<{ id: string }>(`SELECT id FROM result_sets WHERE id = 'rs_existing'`);
            assert.deepEqual(discardedProjection.rows, []);

            const indexes = await client.query<{ indexname: string }>(`
                SELECT indexname
                FROM pg_indexes
                WHERE indexname IN (
                    'idx_query_runs_session_set',
                    'idx_result_sets_session_set',
                    'idx_result_sets_expires_at',
                    'idx_result_set_exports_org_created',
                    'idx_result_set_exports_org_expires',
                    'idx_result_set_exports_result_set'
                )
            `);
            assert.deepEqual(
                new Set(indexes.rows.map(row => row.indexname)),
                new Set([
                    'idx_query_runs_session_set',
                    'idx_result_sets_session_set',
                    'idx_result_sets_expires_at',
                    'idx_result_set_exports_org_created',
                    'idx_result_set_exports_org_expires',
                    'idx_result_set_exports_result_set',
                ]),
            );
        } finally {
            await client.close();
        }
    });
}

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
    for (const name of ['0019_resultset_artifacts.sql', '0020_resultset_schema_updates.sql']) {
        const postgres = await readMigration(migrationRoots.PostgreSQL, name);
        const pglite = await readMigration(migrationRoots.PGlite, name);
        assert.equal(postgres, pglite, `${name} differs between PostgreSQL and PGlite`);
    }
});

test('keeps the compiled PGlite bundle on the released 0019 and the new 0020', async () => {
    const bundleUrl = new URL('../../../../packages/database/src/pglite/migrations.json', import.meta.url);
    const bundle = JSON.parse(await readFile(bundleUrl, 'utf8')) as Array<{
        folderMillis: number;
        hash: string;
        sql: string[];
    }>;
    const releasedMigration = bundle.at(-2);
    const schemaUpdateMigration = bundle.at(-1);

    assert.ok(releasedMigration);
    assert.ok(schemaUpdateMigration);
    assert.equal(releasedMigration.folderMillis, 1783075200000);
    assert.equal(releasedMigration.hash, releasedMigrationHash);
    assert.equal(schemaUpdateMigration.folderMillis, 1784296092000);

    const schemaUpdateSql = await readMigration(migrationRoots.PGlite, '0020_resultset_schema_updates.sql');
    assert.equal(schemaUpdateMigration.hash, createHash('sha256').update(schemaUpdateSql).digest('hex'));
});

for (const [dialect, migrationRoot] of Object.entries(migrationRoots)) {
    test(`upgrades the v0.30.0 ResultSet schema with the ${dialect} migrations`, async () => {
        const client = new PGlite();
        try {
            await client.exec('CREATE TABLE "tabs" ("id" text PRIMARY KEY NOT NULL);');
            await client.exec('CREATE TABLE "work_query_result_sets" ("id" text PRIMARY KEY NOT NULL);');

            const releasedMigration = await readMigration(migrationRoot, '0019_resultset_artifacts.sql');
            const schemaUpdateMigration = await readMigration(migrationRoot, '0020_resultset_schema_updates.sql');

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

            const existingResultSet = await client.query<{ byte_size: string; storage_limit_applied: boolean }>(
                `SELECT byte_size::text AS byte_size, storage_limit_applied FROM result_sets WHERE id = 'rs_existing'`,
            );
            assert.deepEqual(existingResultSet.rows, [{ byte_size: '2147483647', storage_limit_applied: false }]);

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

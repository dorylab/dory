import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { PGlite } from '@electric-sql/pglite';

const migrations = [
    new URL('../../../../packages/database/src/postgres/migrations/0019_resultset_artifacts.sql', import.meta.url),
    new URL('../../../../packages/database/src/pglite/migrations/0019_resultset_artifacts.sql', import.meta.url),
];

for (const migrationUrl of migrations) {
    test(`creates the complete ResultSet schema with the ${migrationUrl.pathname.includes('/pglite/') ? 'PGlite' : 'PostgreSQL'} migration`, async () => {
        const client = new PGlite();
        try {
            await client.exec('CREATE TABLE "tabs" ("id" text PRIMARY KEY NOT NULL);');
            await client.exec('CREATE TABLE "work_query_result_sets" ("id" text PRIMARY KEY NOT NULL);');
            const migration = await readFile(migrationUrl, 'utf8');
            const statements = migration.split('--> statement-breakpoint').map(statement => statement.trim());

            for (const statement of statements) {
                await client.exec(statement);
            }
            for (const statement of statements) {
                await client.exec(statement);
            }

            const columns = await client.query<{ column_name: string; data_type: string }>(
                `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'result_sets' ORDER BY ordinal_position`,
            );
            const columnTypes = new Map(columns.rows.map(row => [row.column_name, row.data_type]));
            assert.equal(columnTypes.get('source_connection_type'), 'text');
            assert.equal(columnTypes.get('source_database_name'), 'text');
            assert.equal(columnTypes.get('session_id'), 'text');
            assert.equal(columnTypes.get('set_index'), 'integer');
            assert.equal(columnTypes.get('view_state'), 'jsonb');
            assert.equal(columnTypes.get('byte_size'), 'bigint');
            assert.equal(columnTypes.get('storage_limit_applied'), 'boolean');

            const exportsTable = await client.query<{ table_name: string }>(
                `SELECT table_name FROM information_schema.tables WHERE table_name = 'result_set_exports'`,
            );
            assert.deepEqual(exportsTable.rows, [{ table_name: 'result_set_exports' }]);
        } finally {
            await client.close();
        }
    });
}

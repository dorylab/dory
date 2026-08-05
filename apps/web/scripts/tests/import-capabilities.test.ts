import assert from 'node:assert/strict';
import test from 'node:test';

import { DATA_IMPORT_CONNECTION_TYPES, driverSupportsDataImport } from '@/lib/client/import-capabilities';

test('data import is available for every registered datasource writer', () => {
    assert.deepEqual(DATA_IMPORT_CONNECTION_TYPES, [
        'clickhouse',
        'cloudflare-d1',
        'duckdb',
        'mariadb',
        'mysql',
        'neon',
        'oracle',
        'postgres',
        'sqlite',
        'snowflake',
        'supabase',
        'sqlserver',
    ]);

    for (const connectionType of DATA_IMPORT_CONNECTION_TYPES) {
        assert.equal(driverSupportsDataImport(connectionType), true, connectionType);
    }
});

test('data import remains hidden for explorer-only and unknown datasource types', () => {
    assert.equal(driverSupportsDataImport('doris'), false);
    assert.equal(driverSupportsDataImport('unknown'), false);
    assert.equal(driverSupportsDataImport(null), false);
    assert.equal(driverSupportsDataImport(undefined), false);
});

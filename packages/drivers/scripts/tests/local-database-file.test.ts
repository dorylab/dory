import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createLocalDatabaseFile } from '../../src/database/local-database-file.ts';
import { DuckDbDatasource } from '../../src/database/duckdb/datasource.ts';
import { SqliteDatasource } from '../../src/database/sqlite/datasource.ts';

test('creates valid empty SQLite and DuckDB database files', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dory-local-database-file-'));
    try {
        const sqlitePath = path.join(directory, 'empty.sqlite');
        await createLocalDatabaseFile('sqlite', sqlitePath);
        const sqlite = new SqliteDatasource({ id: 'sqlite-create-test', type: 'sqlite', path: sqlitePath });
        await sqlite.init();
        assert.equal((await sqlite.ping()).ok, true);
        await sqlite.close();

        const duckDbPath = path.join(directory, 'empty.duckdb');
        await createLocalDatabaseFile('duckdb', duckDbPath);
        const duckdb = new DuckDbDatasource({ id: 'duckdb-create-test', type: 'duckdb', path: duckDbPath });
        await duckdb.init();
        assert.equal((await duckdb.ping()).ok, true);
        await duckdb.close();
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

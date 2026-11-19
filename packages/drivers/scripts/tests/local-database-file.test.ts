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

test('DuckDB resolves unqualified SQL in the requested catalog and schema for queries and streams', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dory-duckdb-context-'));
    const databasePath = path.join(directory, 'workspace.duckdb');
    const duckdb = new DuckDbDatasource({ id: 'duckdb-context-test', type: 'duckdb', path: databasePath });
    try {
        await createLocalDatabaseFile('duckdb', databasePath);
        await duckdb.init();
        await duckdb.command("ATTACH ':memory:' AS china_data");
        await duckdb.command('CREATE SCHEMA china_data.reporting');
        await duckdb.command('CREATE TABLE china_data.reporting.china_financials AS SELECT 2025 AS fiscal_year');

        const source = { database: 'china_data', schema: 'reporting' };
        const sql = 'SELECT fiscal_year FROM china_financials';
        assert.deepEqual((await duckdb.queryWithContext(sql, source)).rows, [{ fiscal_year: 2025 }]);

        const cursor = await duckdb.openRowCursorWithContext(sql, source);
        try {
            assert.deepEqual(await Array.fromAsync(cursor.rows), [[2025]]);
        } finally {
            await cursor.close();
        }

        assert.deepEqual((await duckdb.query('SELECT current_database() AS database, current_schema() AS schema')).rows, [{ database: 'workspace', schema: 'main' }]);
    } finally {
        await duckdb.close();
        await rm(directory, { recursive: true, force: true });
    }
});

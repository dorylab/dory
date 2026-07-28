import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { DuckDbDatasource } from '../../src/database/duckdb/datasource.ts';
import { MySqlDatasource } from '../../src/database/mysql/datasource.ts';
import { PostgresDatasource } from '../../src/database/postgres/datasource.ts';
import { SqliteDatasource } from '../../src/database/sqlite/datasource.ts';
import { buildTableUpdatePreview, buildTableUpdateStatements, TableMutationConflictError } from '../../src/table-mutations.ts';
import type { TableMutationDialect, TableUpdateBatch } from '../../src/types/index.ts';

const compositeBatch: TableUpdateBatch = {
    database: 'app',
    table: 'sales.order"items',
    primaryKeyColumns: ['tenant_id', 'id'],
    rows: [
        {
            key: { tenant_id: 'acme', id: 7 },
            changes: [
                { column: 'status', originalValue: null, nextValue: 'paid' },
                { column: 'total', originalValue: '12.5000', nextValue: '13.7500' },
            ],
        },
    ],
};

for (const dialect of ['postgres', 'mysql', 'sqlite', 'duckdb'] satisfies TableMutationDialect[]) {
    const [statement] = buildTableUpdateStatements(dialect, compositeBatch);
    assert.ok(statement);
    assert.equal(statement.changedColumns.length, 2);
    assert.deepEqual(statement.params, ['paid', '13.7500', 'acme', 7, null, '12.5000']);
    assert.match(statement.previewSql, /SET .*status.*paid.*total.*13\.7500/s);
    assert.match(statement.previewSql, /tenant_id/);
    assert.match(statement.previewSql, /id/);
    assert.match(statement.previewSql, /status/);

    if (dialect === 'postgres' || dialect === 'duckdb') {
        assert.match(statement.sql, /IS NOT DISTINCT FROM/);
    } else if (dialect === 'mysql') {
        assert.match(statement.sql, /<=>/);
        assert.match(statement.sql, /`order"items`/);
    } else {
        assert.match(statement.sql, /\sIS\s\?/);
    }
}

const postgresStatement = buildTableUpdateStatements('postgres', compositeBatch)[0]!;
assert.match(postgresStatement.sql, /"sales"\."order""items"/);
assert.match(postgresStatement.sql, /\$1/);
assert.match(postgresStatement.sql, /\$6/);
assert.equal((postgresStatement.sql.match(/^UPDATE/gm) ?? []).length, 1);
assert.equal((buildTableUpdatePreview('postgres', compositeBatch).match(/^UPDATE/gm) ?? []).length, 1);

assert.throws(
    () =>
        buildTableUpdateStatements('sqlite', {
            ...compositeBatch,
            rows: [{ key: { tenant_id: 'acme', id: 7 }, changes: [{ column: 'id', originalValue: 7, nextValue: 8 }] }],
        }),
    /Primary key column "id" is read-only/,
);
assert.throws(
    () =>
        buildTableUpdateStatements('sqlite', {
            ...compositeBatch,
            rows: [{ key: { id: 7 }, changes: [{ column: 'status', originalValue: 'open', nextValue: 'paid' }] }],
        }),
    /complete primary key/,
);

const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'dory-table-mutations-'));
try {
    const sqlitePath = path.join(tempDirectory, 'updates.sqlite');
    await writeFile(sqlitePath, '');
    const sqlite = new SqliteDatasource({ id: 'sqlite_updates', type: 'sqlite', path: sqlitePath } as any);
    await sqlite.init();
    try {
        await sqlite.command('CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, note TEXT)');
        await sqlite.command(`INSERT INTO items (id, name, note) VALUES (1, 'one', NULL), (2, 'two', 'stable')`);
        await sqlite.commitTableUpdates({
            database: 'main',
            table: 'items',
            primaryKeyColumns: ['id'],
            rows: [
                {
                    key: { id: 1 },
                    changes: [
                        { column: 'name', originalValue: 'one', nextValue: 'updated' },
                        { column: 'note', originalValue: null, nextValue: 'set' },
                    ],
                },
            ],
        });
        assert.deepEqual((await sqlite.query('SELECT name, note FROM items WHERE id = 1')).rows, [{ name: 'updated', note: 'set' }]);

        await assert.rejects(
            () =>
                sqlite.commitTableUpdates({
                    database: 'main',
                    table: 'items',
                    primaryKeyColumns: ['id'],
                    rows: [
                        { key: { id: 1 }, changes: [{ column: 'name', originalValue: 'updated', nextValue: 'rolled-back' }] },
                        { key: { id: 2 }, changes: [{ column: 'name', originalValue: 'stale', nextValue: 'conflict' }] },
                    ],
                }),
            TableMutationConflictError,
        );
        assert.deepEqual((await sqlite.query('SELECT name FROM items ORDER BY id')).rows, [{ name: 'updated' }, { name: 'two' }]);
    } finally {
        await sqlite.close();
    }

    const duckDbPath = path.join(tempDirectory, 'updates.duckdb');
    const duckdb = new DuckDbDatasource({ id: 'duckdb_updates', type: 'duckdb', path: duckDbPath, options: { createIfMissing: true } } as any);
    await duckdb.init();
    try {
        await duckdb.command('CREATE TABLE items (id INTEGER PRIMARY KEY, name VARCHAR)');
        await duckdb.command(`INSERT INTO items VALUES (1, 'one'), (2, 'two')`);
        const database = (await duckdb.listDatabases())[0]?.value;
        assert.ok(database);
        const duckDbColumns = await duckdb.describeTable(database, 'items');
        assert.equal(duckDbColumns.find(column => column.columnName === 'id')?.isPrimaryKey, true);
        assert.equal(duckDbColumns.find(column => column.columnName === 'id')?.nullable, false);
        await duckdb.commitTableUpdates({
            database,
            table: 'items',
            primaryKeyColumns: ['id'],
            rows: [{ key: { id: 1 }, changes: [{ column: 'name', originalValue: 'one', nextValue: 'updated' }] }],
        });
        assert.deepEqual((await duckdb.query('SELECT name FROM items WHERE id = 1')).rows, [{ name: 'updated' }]);

        await assert.rejects(
            () =>
                duckdb.commitTableUpdates({
                    database,
                    table: 'items',
                    primaryKeyColumns: ['id'],
                    rows: [
                        { key: { id: 1 }, changes: [{ column: 'name', originalValue: 'updated', nextValue: 'rolled-back' }] },
                        { key: { id: 2 }, changes: [{ column: 'name', originalValue: 'stale', nextValue: 'conflict' }] },
                    ],
                }),
            TableMutationConflictError,
        );
        assert.deepEqual((await duckdb.query('SELECT name FROM items ORDER BY id')).rows, [{ name: 'updated' }, { name: 'two' }]);
    } finally {
        await duckdb.close();
    }
} finally {
    await rm(tempDirectory, { recursive: true, force: true });
}

function createPostgresHarness(rowCounts: number[]) {
    const calls: string[] = [];
    const boundParams: unknown[][] = [];
    let updateIndex = 0;
    const client = {
        query: async (sql: string, params?: unknown[]) => {
            calls.push(sql);
            if (/^UPDATE/.test(sql)) {
                boundParams.push(params ?? []);
                return { rowCount: rowCounts[updateIndex++] ?? 1 };
            }
            return { rowCount: null };
        },
        release: () => calls.push('RELEASE'),
    };
    const datasource = new PostgresDatasource({ id: 'pg_mock', type: 'postgres', host: 'localhost' } as any);
    (datasource as any)._initialized = true;
    (datasource as any).resolvePool = () => ({ connect: async () => client });
    return { datasource, calls, boundParams };
}

function createMysqlHarness(affectedRows: number[]) {
    const calls: string[] = [];
    const boundParams: unknown[][] = [];
    let updateIndex = 0;
    const connection = {
        beginTransaction: async () => calls.push('BEGIN'),
        query: async (sql: string, params?: unknown[]) => {
            calls.push(sql);
            boundParams.push(params ?? []);
            return [{ affectedRows: affectedRows[updateIndex++] ?? 1 }];
        },
        commit: async () => calls.push('COMMIT'),
        rollback: async () => calls.push('ROLLBACK'),
        release: () => calls.push('RELEASE'),
    };
    const datasource = new MySqlDatasource({ id: 'mysql_mock', type: 'mysql', host: 'localhost' } as any);
    (datasource as any)._initialized = true;
    (datasource as any).resolvePool = () => ({ getConnection: async () => connection });
    return { datasource, calls, boundParams };
}

const simpleBatch: TableUpdateBatch = {
    database: 'app',
    table: 'items',
    primaryKeyColumns: ['id'],
    rows: [{ key: { id: 1 }, changes: [{ column: 'name', originalValue: 'one', nextValue: 'updated' }] }],
};

const postgresSuccess = createPostgresHarness([1]);
await postgresSuccess.datasource.commitTableUpdates(simpleBatch);
assert.deepEqual(
    postgresSuccess.calls.map(call => call.split(/\s/)[0]),
    ['BEGIN', 'UPDATE', 'COMMIT', 'RELEASE'],
);
assert.deepEqual(postgresSuccess.boundParams, [['updated', 1, 'one']]);

const postgresConflict = createPostgresHarness([0]);
await assert.rejects(() => postgresConflict.datasource.commitTableUpdates(simpleBatch), TableMutationConflictError);
assert.deepEqual(
    postgresConflict.calls.map(call => call.split(/\s/)[0]),
    ['BEGIN', 'UPDATE', 'ROLLBACK', 'RELEASE'],
);

const mysqlSuccess = createMysqlHarness([1]);
await mysqlSuccess.datasource.commitTableUpdates(simpleBatch);
assert.deepEqual(
    mysqlSuccess.calls.map(call => call.split(/\s/)[0]),
    ['BEGIN', 'UPDATE', 'COMMIT', 'RELEASE'],
);
assert.deepEqual(mysqlSuccess.boundParams, [['updated', 1, 'one']]);

const mysqlConflict = createMysqlHarness([0]);
await assert.rejects(() => mysqlConflict.datasource.commitTableUpdates(simpleBatch), TableMutationConflictError);
assert.deepEqual(
    mysqlConflict.calls.map(call => call.split(/\s/)[0]),
    ['BEGIN', 'UPDATE', 'ROLLBACK', 'RELEASE'],
);

console.log('table mutation tests passed');

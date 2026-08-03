import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { DuckDbDatasource } from '../../src/database/duckdb/datasource.ts';
import { buildCloudflareD1AtomicUpdate } from '../../src/database/cloudflare-d1/datasource.ts';
import { ClickhouseDatasource } from '../../src/database/clickhouse/datasource.ts';
import { MySqlDatasource } from '../../src/database/mysql/datasource.ts';
import { OracleDatasource } from '../../src/database/oracle/datasource.ts';
import { PostgresDatasource } from '../../src/database/postgres/datasource.ts';
import { SnowflakeDatasource } from '../../src/database/snowflake/datasource.ts';
import { SqliteDatasource } from '../../src/database/sqlite/datasource.ts';
import { executeSqlServerUpdateTransaction } from '../../src/database/sqlserver/datasource.ts';
import {
    buildTableUpdatePreview,
    buildTableUpdateStatements,
    getTableMutationProfile,
    TableMutationConflictError,
    TableMutationPartialCommitError,
} from '../../src/table-mutations.ts';
import type { TableMutationDialect, TableUpdateBatch } from '../../src/types/index.ts';

const compositeBatch: TableUpdateBatch = {
    database: 'app',
    table: 'sales.order"items',
    identityColumns: ['tenant_id', 'id'],
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

for (const dialect of ['postgres', 'mysql', 'sqlite', 'duckdb', 'oracle', 'snowflake', 'sqlserver'] satisfies TableMutationDialect[]) {
    const [statement] = buildTableUpdateStatements(dialect, compositeBatch);
    assert.ok(statement);
    assert.equal(statement.changedColumns.length, 2);
    assert.deepEqual(statement.params, ['paid', '13.7500', 'acme', 7, null, '12.5000']);
    assert.match(statement.previewSql, /SET .*status.*paid.*total.*13\.7500/s);
    assert.match(statement.previewSql, /tenant_id/);
    assert.match(statement.previewSql, /id/);
    assert.match(statement.previewSql, /status/);

    if (dialect === 'postgres' || dialect === 'duckdb' || dialect === 'snowflake') {
        assert.match(statement.sql, /IS NOT DISTINCT FROM/);
    } else if (dialect === 'mysql') {
        assert.match(statement.sql, /<=>/);
        assert.match(statement.sql, /`order"items`/);
    } else if (dialect === 'sqlite') {
        assert.match(statement.sql, /\sIS\s\?/);
    } else if (dialect === 'oracle') {
        assert.match(statement.sql, /:p1/);
    } else {
        assert.match(statement.sql, /@p1/);
    }
}

for (const driver of ['postgres', 'neon', 'supabase', 'mysql', 'mariadb', 'sqlite', 'duckdb', 'cloudflare-d1', 'oracle', 'snowflake', 'sqlserver'] as const) {
    assert.equal(getTableMutationProfile(driver)?.atomicity, 'atomic');
}
assert.deepEqual(getTableMutationProfile('clickhouse'), { dialect: 'clickhouse', atomicity: 'best-effort' });

const postgresStatement = buildTableUpdateStatements('postgres', compositeBatch)[0]!;
assert.match(postgresStatement.sql, /"sales"\."order""items"/);
assert.match(postgresStatement.sql, /\$1/);
assert.match(postgresStatement.sql, /\$6/);
assert.equal((postgresStatement.sql.match(/^UPDATE/gm) ?? []).length, 1);
assert.equal((buildTableUpdatePreview('postgres', compositeBatch).match(/^UPDATE/gm) ?? []).length, 1);
assert.match(buildTableUpdatePreview('clickhouse', compositeBatch), /^ALTER TABLE/);
assert.match(buildTableUpdatePreview('clickhouse', compositeBatch), /mutations_sync = 1/);

assert.throws(
    () =>
        buildTableUpdateStatements('sqlite', {
            ...compositeBatch,
            rows: [{ key: { tenant_id: 'acme', id: 7 }, changes: [{ column: 'id', originalValue: 7, nextValue: 8 }] }],
        }),
    /Row identity column "id" is read-only/,
);
assert.throws(
    () =>
        buildTableUpdateStatements('sqlite', {
            ...compositeBatch,
            rows: [{ key: { id: 7 }, changes: [{ column: 'status', originalValue: 'open', nextValue: 'paid' }] }],
        }),
    /complete row identity/,
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
            identityColumns: ['id'],
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
                    identityColumns: ['id'],
                    rows: [
                        { key: { id: 1 }, changes: [{ column: 'name', originalValue: 'updated', nextValue: 'rolled-back' }] },
                        { key: { id: 2 }, changes: [{ column: 'name', originalValue: 'stale', nextValue: 'conflict' }] },
                    ],
                }),
            TableMutationConflictError,
        );
        assert.deepEqual((await sqlite.query('SELECT name FROM items ORDER BY id')).rows, [{ name: 'updated' }, { name: 'two' }]);

        await sqlite.command(`INSERT INTO items (id, name, note) VALUES (3, 'three', NULL), (4, 'four', NULL)`);
        const guardedD1Batch: TableUpdateBatch = {
            database: 'main',
            table: 'items',
            identityColumns: ['id'],
            rows: [
                { key: { id: 3 }, changes: [{ column: 'name', originalValue: 'three', nextValue: 'updated-three' }] },
                { key: { id: 4 }, changes: [{ column: 'name', originalValue: 'stale', nextValue: 'updated-four' }] },
            ],
        };
        const guardedD1Statement = buildCloudflareD1AtomicUpdate(guardedD1Batch);
        assert.match(guardedD1Statement.sql, /FROM json_each\(\?1\)/);
        await sqlite.query(guardedD1Statement.sql.replace('?1', '?'), [guardedD1Statement.payload]);
        assert.deepEqual((await sqlite.query('SELECT id, name FROM items WHERE id IN (3, 4) ORDER BY id')).rows, [
            { id: 3, name: 'three' },
            { id: 4, name: 'four' },
        ]);

        guardedD1Batch.rows[1]!.changes[0]!.originalValue = 'four';
        const successfulD1Statement = buildCloudflareD1AtomicUpdate(guardedD1Batch);
        await sqlite.query(successfulD1Statement.sql.replace('?1', '?'), [successfulD1Statement.payload]);
        assert.deepEqual((await sqlite.query('SELECT id, name FROM items WHERE id IN (3, 4) ORDER BY id')).rows, [
            { id: 3, name: 'updated-three' },
            { id: 4, name: 'updated-four' },
        ]);
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
            identityColumns: ['id'],
            rows: [{ key: { id: 1 }, changes: [{ column: 'name', originalValue: 'one', nextValue: 'updated' }] }],
        });
        assert.deepEqual((await duckdb.query('SELECT name FROM items WHERE id = 1')).rows, [{ name: 'updated' }]);

        await assert.rejects(
            () =>
                duckdb.commitTableUpdates({
                    database,
                    table: 'items',
                    identityColumns: ['id'],
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
    identityColumns: ['id'],
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

function createOracleHarness(rowsAffected: number[]) {
    const calls: string[] = [];
    let updateIndex = 0;
    const connection = {
        execute: async (sql: string) => {
            calls.push(sql);
            return { rowsAffected: rowsAffected[updateIndex++] ?? 1 };
        },
        commit: async () => calls.push('COMMIT'),
        rollback: async () => calls.push('ROLLBACK'),
        close: async () => calls.push('CLOSE'),
    };
    const datasource = new OracleDatasource({ id: 'oracle_mock', type: 'oracle', host: 'localhost' } as any);
    (datasource as any)._initialized = true;
    (datasource as any).resolvePool = async () => ({ getConnection: async () => connection });
    return { datasource, calls };
}

const oracleSuccess = createOracleHarness([1]);
await oracleSuccess.datasource.commitTableUpdates(simpleBatch);
assert.deepEqual(
    oracleSuccess.calls.map(call => call.split(/\s/)[0]),
    ['UPDATE', 'COMMIT', 'CLOSE'],
);
const oracleConflict = createOracleHarness([0]);
await assert.rejects(() => oracleConflict.datasource.commitTableUpdates(simpleBatch), TableMutationConflictError);
assert.deepEqual(
    oracleConflict.calls.map(call => call.split(/\s/)[0]),
    ['UPDATE', 'ROLLBACK', 'CLOSE'],
);

function createSnowflakeHarness(updatedRows: number[]) {
    const calls: string[] = [];
    let updateIndex = 0;
    const datasource = new SnowflakeDatasource({ id: 'snowflake_mock', type: 'snowflake', host: 'localhost', database: 'app' } as any);
    (datasource as any)._initialized = true;
    (datasource as any).connection = {
        execute: (options: { sqlText: string; complete: (error: Error | null, statement: unknown, rows: unknown[]) => void }) => {
            calls.push(options.sqlText);
            const count = /^UPDATE/.test(options.sqlText) ? (updatedRows[updateIndex++] ?? 1) : 0;
            const statement = {
                getNumUpdatedRows: () => count,
                getColumns: () => [],
                cancel: () => undefined,
            };
            queueMicrotask(() => options.complete(null, statement, []));
            return statement;
        },
    };
    return { datasource, calls };
}

const snowflakeSuccess = createSnowflakeHarness([1]);
await snowflakeSuccess.datasource.commitTableUpdates(simpleBatch);
assert.deepEqual(
    snowflakeSuccess.calls.map(call => call.split(/\s/)[0]),
    ['BEGIN', 'UPDATE', 'COMMIT'],
);
const snowflakeConflict = createSnowflakeHarness([0]);
await assert.rejects(() => snowflakeConflict.datasource.commitTableUpdates(simpleBatch), TableMutationConflictError);
assert.deepEqual(
    snowflakeConflict.calls.map(call => call.split(/\s/)[0]),
    ['BEGIN', 'UPDATE', 'ROLLBACK'],
);

async function runSqlServerHarness(affectedRows: number[], calls: string[] = []) {
    let updateIndex = 0;
    const transaction = {
        begin: async () => calls.push('BEGIN'),
        commit: async () => calls.push('COMMIT'),
        rollback: async () => calls.push('ROLLBACK'),
    };
    await executeSqlServerUpdateTransaction(buildTableUpdateStatements('sqlserver', simpleBatch), transaction, () => ({
        input: (name: string) => calls.push(`BIND:${name}`),
        query: async (statement: string) => {
            calls.push(statement);
            return { rowsAffected: [affectedRows[updateIndex++] ?? 1] };
        },
    }));
    return calls;
}

const sqlServerSuccessCalls = await runSqlServerHarness([1]);
assert.deepEqual(
    sqlServerSuccessCalls.filter(call => !call.startsWith('BIND:')).map(call => call.split(/\s/)[0]),
    ['BEGIN', 'UPDATE', 'COMMIT'],
);
const sqlServerConflictCalls: string[] = [];
await assert.rejects(() => runSqlServerHarness([0], sqlServerConflictCalls), TableMutationConflictError);
assert.equal(sqlServerConflictCalls.at(-1), 'ROLLBACK');

function createClickhouseHarness(applied: boolean[]) {
    const commands: string[] = [];
    let verificationIndex = 0;
    const datasource = new ClickhouseDatasource({ id: 'clickhouse_mock', type: 'clickhouse', host: 'localhost', database: 'app' } as any);
    (datasource as any)._initialized = true;
    (datasource as any).queryWithContext = async (sql: string) => {
        if (/SELECT engine/.test(sql)) return { rows: [{ engine: 'MergeTree' }] };
        if (/count\(\) AS identityCount/.test(sql)) return { rows: [{ identityCount: 1, matchCount: 1 }] };
        return { rows: [{ appliedCount: applied[verificationIndex++] ? 1 : 0 }] };
    };
    (datasource as any).command = async (sql: string) => commands.push(sql);
    return { datasource, commands };
}

const clickhouseSuccess = createClickhouseHarness([true]);
const clickhouseResult = await clickhouseSuccess.datasource.commitTableUpdates(simpleBatch);
assert.equal(clickhouseResult.atomicity, 'best-effort');
assert.match(clickhouseSuccess.commands[0]!, /ALTER TABLE/);
assert.match(clickhouseSuccess.commands[0]!, /mutations_sync = 1/);

const clickhousePartialBatch: TableUpdateBatch = {
    ...simpleBatch,
    rows: [simpleBatch.rows[0]!, { key: { id: 2 }, changes: [{ column: 'name', originalValue: 'two', nextValue: 'updated-two' }] }],
};
const clickhousePartial = createClickhouseHarness([true, false]);
await assert.rejects(
    () => clickhousePartial.datasource.commitTableUpdates(clickhousePartialBatch),
    error => error instanceof TableMutationPartialCommitError && error.committedRowIndexes[0] === 0 && error.pendingRowIndexes[0] === 1,
);

console.log('table mutation tests passed');

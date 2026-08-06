import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SqliteDatasource } from '../../src/database/sqlite/datasource.ts';
import { executeSqliteQueryRowStream, previewSqliteTable } from '../../src/database/sqlite/runtime.ts';
import { buildTablePreviewClauses, normalizeTablePreviewLimit, normalizeTablePreviewOffset } from '../../src/database/shared/table-preview-query.ts';

const quoteDouble = (value: string) => `"${value.replace(/"/g, '""')}"`;

const sorted = buildTablePreviewClauses({
    dialect: 'postgres',
    quoteIdentifier: quoteDouble,
    sort: { column: 'created_at', direction: 'desc' },
    filters: [
        { col: 'status', kind: 'string', op: 'equals', value: 'paid' },
        { col: 'amount', kind: 'number', op: 'gt', value: '10' },
    ],
    search: 'alice',
    searchColumns: ['customer_name', 'note'],
});

assert.equal(sorted.whereSql, ` WHERE LOWER("status"::text) = $1 AND "amount" > $2 AND (LOWER("customer_name"::text) ILIKE $3 OR LOWER("note"::text) ILIKE $4)`);
assert.equal(sorted.orderBySql, ' ORDER BY "created_at" DESC');
assert.deepEqual(sorted.params, ['paid', 10, '%alice%', '%alice%']);
assert.equal(sorted.nextParameterIndex, 5);

const mysql = buildTablePreviewClauses({
    dialect: 'mysql',
    quoteIdentifier: value => `\`${value.replace(/`/g, '``')}\``,
    sort: { column: 'name` DESC; DROP TABLE users; --', direction: 'asc' },
    filters: [{ col: 'email', kind: 'string', op: 'contains', value: 'openai' }],
});

assert.equal(mysql.whereSql, ' WHERE LOWER(CAST(`email` AS CHAR)) LIKE ?');
assert.equal(mysql.orderBySql, ' ORDER BY `name`` DESC; DROP TABLE users; --` ASC');
assert.deepEqual(mysql.params, ['%openai%']);

const sqlserver = buildTablePreviewClauses({
    dialect: 'sqlserver',
    quoteIdentifier: value => `[${value.replace(/]/g, ']]')}]`,
    filters: [{ col: 'deleted_at', kind: 'string', op: 'empty' }],
});

assert.equal(sqlserver.whereSql, " WHERE ([deleted_at] IS NULL OR CAST([deleted_at] AS nvarchar(max)) = '')");
assert.deepEqual(sqlserver.params, {});

const clickhouse = buildTablePreviewClauses({
    dialect: 'clickhouse',
    quoteIdentifier: value => `\`${value.replace(/`/g, '``')}\``,
    filters: [{ col: 'duration_ms', kind: 'number', op: 'le', value: '250' }],
});

assert.equal(clickhouse.whereSql, ' WHERE `duration_ms` <= {previewParam1:Float64}');
assert.deepEqual(clickhouse.params, { previewParam1: 250 });

const snowflake = buildTablePreviewClauses({
    dialect: 'snowflake',
    quoteIdentifier: quoteDouble,
    filters: [{ col: 'email', kind: 'string', op: 'contains', value: 'OPENAI' }],
    search: 'alice',
    searchColumns: ['customer_name'],
});

assert.equal(snowflake.whereSql, ' WHERE LOWER(TO_VARCHAR("email")) LIKE ? AND (LOWER(TO_VARCHAR("customer_name")) LIKE ?)');
assert.deepEqual(snowflake.params, ['%openai%', '%alice%']);

assert.equal(normalizeTablePreviewLimit(undefined), 200);
assert.equal(normalizeTablePreviewLimit(25.9), 25);
assert.equal(normalizeTablePreviewLimit(-1), 200);
assert.equal(normalizeTablePreviewOffset(undefined), 0);
assert.equal(normalizeTablePreviewOffset(40.9), 40);
assert.equal(normalizeTablePreviewOffset(-5), 0);

const db = new Database(':memory:');
db.exec(`
    CREATE TABLE orders (id INTEGER PRIMARY KEY, status TEXT);
    INSERT INTO orders (status) VALUES ('paid'), ('paid'), ('void');
`);

const exactPreview = previewSqliteTable(db, 'main', 'orders', 2, 0, {});
assert.equal(exactPreview.totalRows, 3);
assert.equal(exactPreview.unfilteredTotalRows, 3);
assert.equal(exactPreview.rows.length, 2);

const noCountPreview = previewSqliteTable(db, 'main', 'orders', 2, 0, { countMode: 'none' });
assert.equal(noCountPreview.totalRows, null);
assert.equal(noCountPreview.unfilteredTotalRows, null);
assert.equal(noCountPreview.rows.length, 2);

const stream = executeSqliteQueryRowStream<[number]>(db, 'SELECT id FROM orders ORDER BY id');
const streamIterator = (stream.rows as Iterable<[number]>)[Symbol.iterator]();
assert.deepEqual(streamIterator.next().value, [1]);
stream.close?.();
assert.doesNotThrow(() => db.pragma('schema_version'));

db.close();

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dory-sqlite-stream-test-'));
try {
    const dbPath = path.join(tempDir, 'data.sqlite');
    const fileDb = new Database(dbPath);
    fileDb.exec(`
        CREATE TABLE stream_orders (id INTEGER PRIMARY KEY, status TEXT);
        INSERT INTO stream_orders (status) VALUES ('paid'), ('paid'), ('void');
    `);
    fileDb.close();

    const datasource = new SqliteDatasource({ id: 'sqlite_stream_test', type: 'sqlite', path: dbPath } as any);
    await datasource.init();
    try {
        const datasourceStream = await datasource.openRowCursorWithContext<[number]>('SELECT id FROM stream_orders ORDER BY id');
        const datasourceIterator = (datasourceStream.rows as Iterable<[number]>)[Symbol.iterator]();
        assert.deepEqual(datasourceIterator.next().value, [1]);
        assert.doesNotThrow(() => datasource.getDatabase().pragma('schema_version'));
        await datasourceStream.close?.();
    } finally {
        await datasource.close();
    }
} finally {
    await rm(tempDir, { recursive: true, force: true });
}

console.log('table-preview query tests passed');

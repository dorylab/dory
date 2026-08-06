import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import Database from 'better-sqlite3';

import { collectSerializableDataPage } from '@dory/data-plane';

import { dataStreamFromDriverRows } from '../../src/core/data-reader';
import { SqliteDatasource } from '../../src/database/sqlite/datasource';

test('SQLite readQuery exposes schema before rows and returns bounded Arrow batches', async t => {
    const fixture = await sqliteFixture(t);
    const stream = await fixture.datasource.readQuery({ sql: 'SELECT id, amount, payload FROM orders ORDER BY id' }, { batchRows: 1 });
    assert.deepEqual(
        stream.schema.fields.map(field => field.name),
        ['id', 'amount', 'payload'],
    );
    const sizes: number[] = [];
    for await (const batch of stream.batches()) sizes.push(batch.numRows);
    assert.deepEqual(sizes, [1, 1, 1]);
});

test('SQLite readQuery keeps schema for an empty result', async t => {
    const fixture = await sqliteFixture(t);
    const stream = await fixture.datasource.readQuery({ sql: 'SELECT id, amount FROM orders WHERE 0 = 1' });
    assert.deepEqual(
        stream.schema.fields.map(field => field.name),
        ['id', 'amount'],
    );
    const page = await collectSerializableDataPage(stream, 10);
    assert.deepEqual(page.rows, []);
});

test('SQLite readQuery preserves duplicate column values by ordinal position', async t => {
    const fixture = await sqliteFixture(t);
    const stream = await fixture.datasource.readQuery({ sql: 'SELECT id AS value, amount AS value FROM orders WHERE id = 1' });
    assert.deepEqual(
        stream.schema.fields.map(field => [field.name, field.metadata.get('dory.displayName')]),
        [
            ['value', 'value'],
            ['value__2', 'value'],
        ],
    );
    assert.deepEqual((await collectSerializableDataPage(stream, 1)).rows, [{ value: '1', value__2: '10' }]);
});

test('SQLite readTable preserves database-side filter, sort, paging, and counts', async t => {
    const fixture = await sqliteFixture(t);
    const result = await fixture.datasource.readTable({
        database: 'main',
        table: 'orders',
        options: {
            limit: 1,
            offset: 0,
            countMode: 'exact',
            filters: [{ col: 'status', kind: 'string', op: 'equals', value: 'paid' }],
            sort: { column: 'amount', direction: 'desc' },
        },
    });
    const page = await collectSerializableDataPage(result.stream, 1);
    assert.equal(result.totalRows, 2);
    assert.equal(result.unfilteredTotalRows, 3);
    assert.equal(page.rows[0]?.amount, '20');
    assert.equal(result.limited, true);
});

test('reader resolves cursor metadata after an empty result without first-row inference', async () => {
    let columns: Array<{ name: string; type?: string }> | undefined;
    const stream = await dataStreamFromDriverRows(
        {
            rows: (async function* () {
                columns = [{ name: 'id', type: 'BIGINT' }];
            })(),
            get columns() {
                return columns;
            },
            rowCount: 0,
        },
        { source: 'postgres-contract' },
    );
    assert.equal(stream.schema.fields[0]?.name, 'id');
    assert.equal((await collectSerializableDataPage(stream, 1)).rowCount, 0);
});

for (const driverType of ['postgres', 'neon', 'supabase', 'mysql', 'mariadb', 'sqlite', 'duckdb', 'clickhouse', 'oracle', 'snowflake', 'sqlserver', 'cloudflare-d1']) {
    test(`${driverType} row-cursor contract is sealed behind a DataStream`, async () => {
        const stream = await dataStreamFromDriverRows(
            {
                rows: [[9_007_199_254_740_993n]],
                columns: [{ name: 'id', type: 'BIGINT' }],
                rowCount: 1,
            },
            { source: `${driverType}-contract`, metadata: { driverType } },
        );
        assert.equal(stream.metadata.driverType, driverType);
        assert.deepEqual((await collectSerializableDataPage(stream, 1)).rows, [{ id: '9007199254740993' }]);
    });
}

async function sqliteFixture(t: test.TestContext) {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dory-data-reader-'));
    const filePath = path.join(dir, 'data.sqlite');
    const database = new Database(filePath);
    database.exec(`
        CREATE TABLE orders (id INTEGER PRIMARY KEY, status TEXT, amount INTEGER, payload BLOB);
        INSERT INTO orders (status, amount, payload) VALUES
            ('paid', 10, X'01'),
            ('paid', 20, X'02'),
            ('void', 30, X'03');
    `);
    database.close();
    const datasource = new SqliteDatasource({ id: 'reader-fixture', type: 'sqlite', host: '', path: filePath });
    await datasource.init();
    t.after(async () => {
        await datasource.close();
        await rm(dir, { recursive: true, force: true });
    });
    return { datasource };
}

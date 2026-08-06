import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import Database from 'better-sqlite3';
import { SqliteDatasource } from '@dory/drivers/database/sqlite/datasource';

import { buildTablePreviewPayload } from '@/lib/connection/table-preview';

test('table preview keeps its JSON contract while using the driver DataReader', async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dory-table-preview-plane-'));
    const filePath = path.join(dir, 'data.sqlite');
    const database = new Database(filePath);
    database.exec(`
        CREATE TABLE orders (id INTEGER PRIMARY KEY, status TEXT, amount INTEGER);
        INSERT INTO orders (status, amount) VALUES ('paid', 10), ('paid', 20), ('void', 30);
    `);
    database.close();

    const datasource = new SqliteDatasource({ id: 'preview-fixture', type: 'sqlite', host: '', path: filePath });
    await datasource.init();
    t.after(async () => {
        await datasource.close();
        await rm(dir, { recursive: true, force: true });
    });

    const payload = await buildTablePreviewPayload({
        connection: datasource,
        connectionId: 'preview-fixture',
        database: 'main',
        table: 'orders',
        limit: 1,
        countMode: 'exact',
        filters: [{ col: 'status', kind: 'string', op: 'equals', value: 'paid' }],
        sort: { column: 'amount', direction: 'desc' },
    });

    assert.equal(payload.queryResultSets[0]?.totalRows, 2);
    assert.equal(payload.queryResultSets[0]?.unfilteredTotalRows, 3);
    assert.equal(payload.queryResultSets[0]?.columns?.[0]?.name, 'id');
    assert.deepEqual(payload.results, [[{ id: '2', status: 'paid', amount: '20' }]]);
});

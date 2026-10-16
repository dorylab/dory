import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { SqliteDatasource } from '../../src/database/sqlite/datasource';

test('SQLite getSchema works through the shared driver facade with tables, views and quoted names', async t => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dory-sqlite-schema-'));
    const filePath = path.join(directory, 'schema.sqlite');
    new Database(filePath).close();
    const datasource = new SqliteDatasource({ id: 'schema-test', type: 'sqlite', host: '', path: filePath });
    t.after(async () => {
        await datasource.close();
        await rm(directory, { recursive: true, force: true });
    });
    await datasource.init();

    assert.deepEqual(await datasource.getSchema(), {});
    await datasource.command('CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, amount INTEGER, status TEXT)');
    await datasource.command('CREATE VIEW order_totals AS SELECT id, amount FROM orders');
    await datasource.command('CREATE TABLE "odd\'table" ("display name" TEXT, "quote\"\"column" INTEGER)');
    const expected = {
        orders: ['id', 'amount', 'status'],
        order_totals: ['id', 'amount'],
        "odd'table": ['display name', 'quote"column'],
    };
    assert.deepEqual(await datasource.getSchema(), expected);
    assert.deepEqual(await datasource.getSchema('main'), expected);
    assert.deepEqual(await datasource.getSchema('  main  '), expected);
    assert.ok(datasource.capabilities.metadata?.getSchema);
    assert.equal(Object.hasOwn(await datasource.getSchema(), 'sqlite_sequence'), false);

    await datasource.command("ATTACH DATABASE ':memory:' AS secondary");
    await datasource.command('CREATE TABLE secondary.attached_table (name TEXT)');
    assert.deepEqual(await datasource.getSchema('secondary'), { attached_table: ['name'] });
    assert.deepEqual(await datasource.getSchema('main'), expected);
    await assert.rejects(() => datasource.getSchema('missing_database'));
});

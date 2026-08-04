import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

import Database from 'better-sqlite3';

import { analyzeCsv, datasetSchemaHash, prepareImportDataset, type ImportPlanV1 } from '@dory/import';

import { SqliteImportWriter } from '../../src/database/sqlite/import-writer';

test('SQLite writer creates a table and preserves strings, booleans, dates, datetimes, and newlines', async t => {
    const fixture = await fixtureDataset(
        t,
        'id,zip,name,active,created_at,updated_at\n1,00123,Alice,true,2026-01-02,2026-01-02 03:04:05\n2,94107,"Bob\nJones",false,2026-02-03,2026-02-03 14:15:16\n',
    );
    const databasePath = path.join(fixture.dir, 'target.sqlite');
    new Database(databasePath).close();
    const writer = new SqliteImportWriter(() => new Database(databasePath));
    const result = await writer.write({ dataset: fixture.dataset, plan: fixture.plan, batchSize: 1, signal: new AbortController().signal, onProgress: () => undefined });
    assert.deepEqual(result, { insertedRows: 2, batches: 2 });
    const database = new Database(databasePath);
    t.after(() => database.close());
    assert.deepEqual(database.prepare('SELECT * FROM "customers" ORDER BY "id"').all(), [
        { id: 1, zip: '00123', name: 'Alice', active: 1, created_at: '2026-01-02', updated_at: '2026-01-02T03:04:05.000Z' },
        { id: 2, zip: '94107', name: 'Bob\nJones', active: 0, created_at: '2026-02-03', updated_at: '2026-02-03T14:15:16.000Z' },
    ]);
});

test('SQLite replace rolls back the delete when an insert violates a constraint', async t => {
    const fixture = await fixtureDataset(t, 'id,name\n1,first\n1,duplicate\n');
    const databasePath = path.join(fixture.dir, 'rollback.sqlite');
    const seed = new Database(databasePath);
    seed.exec("CREATE TABLE customers (id INTEGER UNIQUE NOT NULL, name TEXT NOT NULL); INSERT INTO customers VALUES (99, 'original')");
    seed.close();
    const writer = new SqliteImportWriter(() => new Database(databasePath));
    const plan: ImportPlanV1 = { ...fixture.plan, target: { mode: 'existing', database: 'main', table: 'customers' }, mode: 'replace' };
    await assert.rejects(writer.write({ dataset: fixture.dataset, plan, batchSize: 1000, signal: new AbortController().signal, onProgress: () => undefined }), /UNIQUE/);
    const database = new Database(databasePath);
    t.after(() => database.close());
    assert.deepEqual(database.prepare('SELECT * FROM customers').all(), [{ id: 99, name: 'original' }]);
});

test('SQLite writer keeps CSV null distinct from a quoted empty string', async t => {
    const fixture = await fixtureDataset(t, 'id,value\n1,\n2,""\n3,text\n');
    const databasePath = path.join(fixture.dir, 'null-empty.sqlite');
    new Database(databasePath).close();
    const writer = new SqliteImportWriter(() => new Database(databasePath));
    await writer.write({ dataset: fixture.dataset, plan: fixture.plan, batchSize: 2, signal: new AbortController().signal, onProgress: () => undefined });
    const database = new Database(databasePath);
    t.after(() => database.close());
    assert.deepEqual(database.prepare('SELECT id, value FROM customers ORDER BY id').all(), [
        { id: 1, value: null },
        { id: 2, value: '' },
        { id: 3, value: 'text' },
    ]);
});

test('SQLite cancellation before commit leaves the target unchanged', async t => {
    const fixture = await fixtureDataset(t, 'id,name\n1,new\n');
    const databasePath = path.join(fixture.dir, 'cancel.sqlite');
    const seed = new Database(databasePath);
    seed.exec("CREATE TABLE customers (id INTEGER NOT NULL, name TEXT NOT NULL); INSERT INTO customers VALUES (99, 'original')");
    seed.close();
    const writer = new SqliteImportWriter(() => new Database(databasePath));
    const plan: ImportPlanV1 = { ...fixture.plan, target: { mode: 'existing', database: 'main', table: 'customers' }, mode: 'replace' };
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(writer.write({ dataset: fixture.dataset, plan, batchSize: 1000, signal: controller.signal, onProgress: () => undefined }), /canceled/);
    const database = new Database(databasePath);
    t.after(() => database.close());
    assert.deepEqual(database.prepare('SELECT * FROM customers').all(), [{ id: 99, name: 'original' }]);
});

test('SQLite cancellation at the persisted commit boundary rolls back', async t => {
    const fixture = await fixtureDataset(t, 'id,name\n1,new\n');
    const databasePath = path.join(fixture.dir, 'cancel-at-commit.sqlite');
    const seed = new Database(databasePath);
    seed.exec("CREATE TABLE customers (id INTEGER NOT NULL, name TEXT NOT NULL); INSERT INTO customers VALUES (99, 'original')");
    seed.close();
    const writer = new SqliteImportWriter(() => new Database(databasePath));
    const plan: ImportPlanV1 = { ...fixture.plan, target: { mode: 'existing', database: 'main', table: 'customers' }, mode: 'replace' };
    const controller = new AbortController();
    await assert.rejects(
        writer.write({
            dataset: fixture.dataset,
            plan,
            batchSize: 1000,
            signal: controller.signal,
            onProgress: async progress => {
                if (progress.phase === 'committing') controller.abort();
            },
        }),
        /canceled/,
    );
    const database = new Database(databasePath);
    t.after(() => database.close());
    assert.deepEqual(database.prepare('SELECT * FROM customers').all(), [{ id: 99, name: 'original' }]);
});

async function fixtureDataset(t: TestContext, csv: string) {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dory-sqlite-import-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const sourcePath = path.join(dir, 'source.csv');
    await writeFile(sourcePath, csv);
    const analysis = await analyzeCsv({
        sourcePath,
        sourceName: 'source.csv',
        sourceHash: 'b'.repeat(64),
        outputArrowPath: path.join(dir, 'source.arrow'),
        parsing: { delimiter: ',', hasHeader: true, encoding: 'utf8', quoteChar: '"' },
    });
    const plan: ImportPlanV1 = {
        version: 'dory.import-plan.v1',
        parsing: analysis.parsing,
        target: { mode: 'create', database: 'main', table: 'customers' },
        columns: analysis.profile.columns.map((column, order) => ({ source: column.name, target: column.name, targetType: column.detectedType, ignored: false, order })),
        mode: 'append',
        batchSize: 1000,
        transform: { version: 'dory.transform.v1', operations: [] },
        sourceSchemaHash: datasetSchemaHash(analysis.dataset),
    };
    const dataset = await prepareImportDataset({
        sourceArrowPath: analysis.sourceArrowPath,
        outputArrowPath: path.join(dir, 'prepared.arrow'),
        sourceDataset: analysis.dataset,
        plan,
    });
    return { dir, dataset, plan };
}

import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';

import Database from 'better-sqlite3';
import { DuckDBInstance } from '@duckdb/node-api';

import { analyzeCsv, datasetSchemaHash, prepareImportDataset, type ImportPlanV1, type ImportPlanV2 } from '@dory/import';

import { SqliteImportWriter } from '../../src/database/sqlite/import-writer';
import { buildD1InsertQueries, CloudflareD1ImportWriter, d1ImportValue } from '../../src/database/cloudflare-d1/import-writer';
import { DuckDbImportWriter } from '../../src/database/duckdb/import-writer';
import { ClickhouseImportWriter } from '../../src/database/clickhouse/import-writer';
import type { ClickhouseDatasource } from '../../src/database/clickhouse/datasource';
import { MySqlImportWriter } from '../../src/database/mysql/import-writer';
import { OracleImportWriter } from '../../src/database/oracle/import-writer';
import { SnowflakeImportWriter } from '../../src/database/snowflake/import-writer';
import { SqlServerImportWriter } from '../../src/database/sqlserver/import-writer';

test('SQLite writer creates a table and preserves strings, booleans, dates, datetimes, and newlines', async t => {
    const fixture = await fixtureDataset(
        t,
        'id,zip,name,active,created_at,updated_at\n1,00123,Alice,true,2026-01-02,2026-01-02 03:04:05\n2,94107,"Bob\nJones",false,2026-02-03,2026-02-03 14:15:16\n',
    );
    const databasePath = path.join(fixture.dir, 'target.sqlite');
    new Database(databasePath).close();
    const writer = new SqliteImportWriter(() => new Database(databasePath));
    const { parsing: _legacyParsing, version: _legacyVersion, ...executionPlan } = fixture.plan;
    const plan: ImportPlanV2 = { ...executionPlan, version: 'dory.import-plan.v2', source: { format: 'parquet' } };
    const result = await writer.write({ dataset: fixture.dataset, plan, batchSize: 1, signal: new AbortController().signal, onProgress: () => undefined });
    assert.deepEqual(result, { insertedRows: 2, batches: 2, atomicity: 'atomic' });
    const database = new Database(databasePath);
    t.after(() => database.close());
    assert.deepEqual(database.prepare('SELECT * FROM "customers" ORDER BY "id"').all(), [
        { id: 1, zip: '00123', name: 'Alice', active: 1, created_at: '2026-01-02', updated_at: '2026-01-02T03:04:05.000Z' },
        { id: 2, zip: '94107', name: 'Bob\nJones', active: 0, created_at: '2026-02-03', updated_at: '2026-02-03T14:15:16.000Z' },
    ]);
});

test('SQLite target inspection exposes atomic create, append, and replace capabilities', async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dory-sqlite-capabilities-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const databasePath = path.join(dir, 'target.sqlite');
    const database = new Database(databasePath);
    database.exec('CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT DEFAULT NULL)');
    database.close();
    const writer = new SqliteImportWriter(() => new Database(databasePath));
    const inspected = await writer.inspectTarget({ mode: 'existing', database: 'main', table: 'customers' });
    assert.equal(inspected.exists, true);
    assert.deepEqual(inspected.writeCapabilities, {
        create: { supported: true, atomicity: 'atomic' },
        append: { supported: true, atomicity: 'atomic' },
        replace: { supported: true, atomicity: 'atomic' },
    });
});

test('Cloudflare D1 insert batches stay within the 100 parameter limit', () => {
    const rows = Array.from({ length: 70 }, (_, index) => [index, `name-${index}`, index % 2]);
    const queries = buildD1InsertQueries({ mode: 'existing', database: 'main', table: 'order items' }, ['id', 'name', 'active'], rows);
    assert.equal(queries.length, 3);
    assert.equal(
        queries.reduce((total, query) => total + (query.params?.length ?? 0) / 3, 0),
        rows.length,
    );
    assert.ok(queries.every(query => (query.params?.length ?? 0) <= 100));
    assert.match(queries[0]!.sql, /"main"\."order items"/);
    assert.equal(d1ImportValue(BigInt('9223372036854775807'), 'int64'), '9223372036854775807');
});

test('new import dialects generate qualified, escaped create SQL with safe fixed types', async () => {
    const unavailable = () => {
        throw new Error('connection should not be used while previewing SQL');
    };
    const unavailableAsync = async () => unavailable();
    const mysql = await new MySqlImportWriter(unavailable).previewCreateTable(previewPlan({ mode: 'create', database: 'analytics', table: 'order items' }));
    const duckdb = await new DuckDbImportWriter(unavailable).previewCreateTable(previewPlan({ mode: 'create', database: 'analytics', schema: 'main', table: 'order items' }));
    const oracle = await new OracleImportWriter(unavailableAsync, 'APP').previewCreateTable(previewPlan({ mode: 'create', schema: 'APP', table: 'order items' }));
    const snowflake = await new SnowflakeImportWriter(unavailable, 'PUBLIC').previewCreateTable(
        previewPlan({ mode: 'create', database: 'ANALYTICS', schema: 'PUBLIC', table: 'order items' }),
    );
    const sqlserver = await new SqlServerImportWriter(unavailableAsync).previewCreateTable(previewPlan({ mode: 'create', schema: 'dbo', table: 'order items' }));
    const d1 = await new CloudflareD1ImportWriter({} as never).previewCreateTable(previewPlan({ mode: 'create', database: 'main', table: 'order items' }));
    const clickhouse = await new ClickhouseImportWriter({ config: { database: 'analytics' } } as ClickhouseDatasource).previewCreateTable(
        previewPlan({ mode: 'create', database: 'analytics', table: 'order items' }),
    );

    assert.match(mysql, /`analytics`\.`order items`.*LONGTEXT.*BOOLEAN.*BIGINT.*DOUBLE.*DATE.*DATETIME\(3\).*ENGINE=InnoDB/);
    assert.match(duckdb, /"analytics"\."main"\."order items".*VARCHAR.*BOOLEAN.*BIGINT.*DOUBLE.*DATE.*TIMESTAMPTZ/);
    assert.match(oracle, /"APP"\."order items".*CLOB.*NUMBER\(1\).*NUMBER\(19\).*BINARY_DOUBLE.*DATE.*TIMESTAMP WITH TIME ZONE/);
    assert.match(snowflake, /"ANALYTICS"\."PUBLIC"\."order items".*VARCHAR.*BOOLEAN.*NUMBER\(38,0\).*DOUBLE.*DATE.*TIMESTAMP_TZ/);
    assert.match(sqlserver, /\[dbo\]\.\[order items\].*NVARCHAR\(MAX\).*BIT.*BIGINT.*FLOAT\(53\).*DATE.*DATETIMEOFFSET\(3\)/);
    assert.match(d1, /"main"\."order items".*TEXT.*INTEGER.*INTEGER.*REAL.*TEXT.*TEXT/);
    assert.match(
        clickhouse,
        /`analytics`\.`order items`.*Nullable\(String\).*Nullable\(Bool\).*Nullable\(Int64\).*Nullable\(Float64\).*Nullable\(Date\).*Nullable\(DateTime64.*MergeTree ORDER BY tuple\(\)/,
    );
});

test('DuckDB writer creates and atomically imports a local table', async t => {
    const fixture = await fixtureDataset(t, 'id,name,active\n1,Alice,true\n2,Bob,false\n', plan => ({
        ...plan,
        columns: plan.columns.map(column => (column.source === 'id' ? { ...column, targetType: 'int64' as const } : column)),
    }));
    const databasePath = path.join(fixture.dir, 'target.duckdb');
    const instance = await DuckDBInstance.create(databasePath);
    const connection = await instance.connect();
    t.after(() => {
        connection.closeSync();
        instance.closeSync();
    });
    const databaseReader = await connection.runAndReadAll('SELECT current_database() AS name');
    const database = String(databaseReader.getRowObjectsJson()[0]?.name);
    const writer = new DuckDbImportWriter(() => connection);
    const plan: ImportPlanV1 = { ...fixture.plan, target: { mode: 'create', database, schema: 'main', table: 'customers' } };
    const result = await writer.write({ dataset: fixture.dataset, plan, batchSize: 1, signal: new AbortController().signal, onProgress: () => undefined });
    assert.deepEqual(result, { insertedRows: 2, batches: 2, atomicity: 'atomic' });
    const reader = await connection.runAndReadAll('SELECT id, name, active FROM customers ORDER BY id');
    assert.deepEqual(reader.getRowObjectsJson(), [
        { id: '1', name: 'Alice', active: true },
        { id: '2', name: 'Bob', active: false },
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

test('SQLite writer receives the filtered and cleaned prepared dataset', async t => {
    const fixture = await fixtureDataset(t, 'id,email\n1," A@EXAMPLE.COM "\nbad,"B@EXAMPLE.COM"\n', plan => ({
        ...plan,
        columns: plan.columns.map(column => (column.source === 'id' ? { ...column, targetType: 'int64' as const } : column)),
        transform: {
            version: 'dory.transform.v1',
            operations: [
                { kind: 'trim', column: 'email' },
                { kind: 'lowercase', column: 'email' },
                { kind: 'dropInvalid', column: 'id', targetType: 'int64', dropNulls: false },
            ],
        },
    }));
    const databasePath = path.join(fixture.dir, 'cleaned.sqlite');
    new Database(databasePath).close();
    const writer = new SqliteImportWriter(() => new Database(databasePath));
    const result = await writer.write({ dataset: fixture.dataset, plan: fixture.plan, batchSize: 1000, signal: new AbortController().signal, onProgress: () => undefined });
    assert.equal(result.insertedRows, 1);
    const database = new Database(databasePath);
    t.after(() => database.close());
    assert.deepEqual(database.prepare('SELECT * FROM customers').all(), [{ id: 1, email: 'a@example.com' }]);
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

async function fixtureDataset(t: TestContext, csv: string, configurePlan?: (plan: ImportPlanV1) => ImportPlanV1) {
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
    const basePlan: ImportPlanV1 = {
        version: 'dory.import-plan.v1',
        parsing: analysis.parsing,
        target: { mode: 'create', database: 'main', table: 'customers' },
        columns: analysis.profile.columns.map((column, order) => ({ source: column.name, target: column.name, targetType: column.detectedType, ignored: false, order })),
        mode: 'append',
        batchSize: 1000,
        transform: { version: 'dory.transform.v1', operations: [] },
        sourceSchemaHash: datasetSchemaHash(analysis.dataset),
    };
    const plan = configurePlan?.(basePlan) ?? basePlan;
    const prepared = await prepareImportDataset({
        sourceArrowPath: analysis.sourceArrowPath,
        outputArrowPath: path.join(dir, 'prepared.arrow'),
        sourceDataset: analysis.dataset,
        plan,
    });
    return { dir, dataset: prepared.dataset, plan };
}

function previewPlan(target: ImportPlanV1['target']): ImportPlanV1 {
    const types = ['string', 'boolean', 'int64', 'float64', 'date', 'datetime'] as const;
    return {
        version: 'dory.import-plan.v1',
        parsing: { delimiter: ',', hasHeader: true, encoding: 'utf8', quoteChar: '"' },
        target,
        columns: types.map((targetType, order) => ({ source: `source_${order}`, target: order === 0 ? 'select value' : `column_${order}`, targetType, ignored: false, order })),
        mode: 'append',
        batchSize: 1000,
        transform: { version: 'dory.transform.v1', operations: [] },
        sourceSchemaHash: 'a'.repeat(64),
    };
}

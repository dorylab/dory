import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import iconv from 'iconv-lite';

import { analyzeCsv, datasetSchemaHash, detectCsv, ImportCastError, prepareImportDataset, transcodeCsvToUtf8, type ImportPlanV1 } from '../../src';

test('CSV analysis is lossless, repeatable, and conservative', async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dory-import-csv-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const csvPath = path.join(dir, 'customers.csv');
    await writeFile(csvPath, 'id,zip,name,active,created_at\n1,00123,Alice,true,2026-01-02\n2,94107,"Bob\nJones",false,2026-02-03\n');

    const detection = await detectCsv(csvPath);
    assert.equal(detection.options.delimiter, ',');
    assert.equal(detection.options.hasHeader, true);
    assert.equal(detection.options.encoding, 'utf8');

    const analysis = await analyzeCsv({
        sourcePath: csvPath,
        sourceName: 'customers.csv',
        sourceHash: 'a'.repeat(64),
        outputArrowPath: path.join(dir, 'source.arrow'),
        parsing: detection.options,
    });
    assert.equal(analysis.profile.rows, 2);
    assert.deepEqual(
        analysis.profile.columns.map(column => [column.name, column.detectedType]),
        [
            ['id', 'int64'],
            ['zip', 'string'],
            ['name', 'string'],
            ['active', 'boolean'],
            ['created_at', 'date'],
        ],
    );
    assert.equal(analysis.profile.preview[0]?.zip, '00123');
    assert.equal(analysis.profile.preview[1]?.name, 'Bob\nJones');

    for (let attempt = 0; attempt < 3; attempt += 1) {
        let rows = 0;
        const reader = await analysis.dataset.openBatches();
        for await (const batch of reader) rows += batch.numRows;
        assert.equal(rows, 2);
    }
    const oneRowReader = await analysis.dataset.openBatches({ batchSize: 1 });
    const batchSizes: number[] = [];
    for await (const batch of oneRowReader) batchSizes.push(batch.numRows);
    assert.deepEqual(batchSizes, [1, 1]);

    const plan = buildPlan(analysis, path.basename(csvPath));
    const prepared = await prepareImportDataset({
        sourceArrowPath: analysis.sourceArrowPath,
        outputArrowPath: path.join(dir, 'prepared.arrow'),
        sourceDataset: analysis.dataset,
        plan,
    });
    assert.equal(
        prepared.schema.fields.some(field => field.name === '__dory_source_row_number'),
        false,
    );
    assert.equal(prepared.rowCount, 2);

    const invalidPlan: ImportPlanV1 = {
        ...plan,
        columns: plan.columns.map(column => (column.source === 'name' ? { ...column, targetType: 'int64' } : column)),
    };
    await assert.rejects(
        prepareImportDataset({
            sourceArrowPath: analysis.sourceArrowPath,
            outputArrowPath: path.join(dir, 'invalid.arrow'),
            sourceDataset: analysis.dataset,
            plan: invalidPlan,
        }),
        (error: unknown) => error instanceof ImportCastError && error.sourceRow === 1 && error.column === 'name',
    );
});

test('UTF-16LE source is detected and streamed to UTF-8', async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dory-import-encoding-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const source = path.join(dir, 'customers.csv');
    await writeFile(source, Buffer.concat([Buffer.from([0xff, 0xfe]), iconv.encode('name;city\n张三;上海\n', 'utf16-le')]));
    const detection = await detectCsv(source);
    assert.equal(detection.options.encoding, 'utf16le');
    assert.equal(detection.options.delimiter, ';');
    const utf8 = await transcodeCsvToUtf8(source, path.join(dir, 'source.utf8.csv'), 'utf16le');
    const content = await import('node:fs/promises').then(fs => fs.readFile(utf8, 'utf8'));
    assert.match(content, /张三;上海/);
});

test('Datetime columns are prepared without losing their millisecond values', async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dory-import-datetime-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const source = path.join(dir, 'trips.csv');
    await writeFile(source, 'id,pickup_datetime,dropoff_datetime\n1,2026-01-02 03:04:05,2026-01-02 03:14:15\n2,2026-02-03 14:15:16,2026-02-03 14:25:26\n');

    const detection = await detectCsv(source);
    const analysis = await analyzeCsv({
        sourcePath: source,
        sourceName: 'trips.csv',
        sourceHash: 'c'.repeat(64),
        outputArrowPath: path.join(dir, 'source.arrow'),
        parsing: detection.options,
    });
    assert.deepEqual(
        analysis.profile.columns.map(column => [column.name, column.detectedType]),
        [
            ['id', 'int64'],
            ['pickup_datetime', 'datetime'],
            ['dropoff_datetime', 'datetime'],
        ],
    );

    const prepared = await prepareImportDataset({
        sourceArrowPath: analysis.sourceArrowPath,
        outputArrowPath: path.join(dir, 'prepared.arrow'),
        sourceDataset: analysis.dataset,
        plan: buildPlan(analysis, path.basename(source)),
    });
    assert.equal(prepared.schema.fields.find(field => field.name === 'pickup_datetime')?.type.toString(), 'Timestamp<MICROSECOND>');

    const reader = await prepared.openBatches();
    for await (const batch of reader) {
        assert.equal(batch.getChild('pickup_datetime')?.get(0), Date.parse('2026-01-02T03:04:05Z'));
        break;
    }
});

test('100k rows remain streaming and are exposed in bounded batches', async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dory-import-100k-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const source = path.join(dir, 'large.csv');
    const output = createWriteStream(source, { mode: 0o600 });
    output.write('id,code,value\n');
    for (let row = 1; row <= 100_000; row += 1) {
        if (!output.write(`${row},${String(row).padStart(8, '0')},${row / 10}\n`)) await once(output, 'drain');
    }
    output.end();
    await once(output, 'finish');

    const detection = await detectCsv(source);
    const analysis = await analyzeCsv({
        sourcePath: source,
        sourceName: 'large.csv',
        sourceHash: 'b'.repeat(64),
        outputArrowPath: path.join(dir, 'source.arrow'),
        parsing: detection.options,
    });
    assert.equal(analysis.profile.rows, 100_000);
    assert.equal(analysis.profile.columns.find(column => column.name === 'code')?.detectedType, 'string');

    let rows = 0;
    let batches = 0;
    const reader = await analysis.dataset.openBatches({ batchSize: 1000 });
    for await (const batch of reader) {
        assert.ok(batch.numRows <= 1000);
        rows += batch.numRows;
        batches += 1;
    }
    assert.equal(rows, 100_000);
    assert.equal(batches, 100);
});

function buildPlan(analysis: Awaited<ReturnType<typeof analyzeCsv>>, sourceName: string): ImportPlanV1 {
    return {
        version: 'dory.import-plan.v1',
        parsing: analysis.parsing,
        target: { mode: 'create', database: 'main', table: sourceName.replace(/\W/g, '_') },
        columns: analysis.profile.columns.map((column, order) => ({
            source: column.name,
            target: column.name,
            targetType: column.detectedType,
            ignored: false,
            order,
        })),
        mode: 'append',
        batchSize: 1000,
        transform: { version: 'dory.transform.v1', operations: [] },
        sourceSchemaHash: datasetSchemaHash(analysis.dataset),
    };
}

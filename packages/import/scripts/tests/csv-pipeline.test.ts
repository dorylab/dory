import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import iconv from 'iconv-lite';

import { analyzeCsv, datasetSchemaHash, detectCsv, ImportCastError, prepareImportDataset, previewImportTransform, transcodeCsvToUtf8, type ImportPlan } from '../../src';

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
        const stream = await analysis.dataSource.open();
        for await (const batch of stream.batches()) rows += batch.numRows;
        assert.equal(rows, 2);
    }
    const oneRowStream = await analysis.dataSource.open({ batchRows: 1 });
    const batchSizes: number[] = [];
    for await (const batch of oneRowStream.batches()) batchSizes.push(batch.numRows);
    assert.deepEqual(batchSizes, [1, 1]);

    const plan = buildPlan(analysis, path.basename(csvPath));
    const prepared = await prepareImportDataset({
        sourceArrowPath: analysis.sourceArrowPath,
        outputArrowPath: path.join(dir, 'prepared.arrow'),
        sourceDataSource: analysis.dataSource,
        plan,
    });
    assert.equal(
        prepared.dataSource.schema.fields.some(field => field.name === '__dory_source_row_number'),
        false,
    );
    assert.equal(prepared.dataSource.rowCount, 2);
    assert.equal(prepared.filteredRows, 0);

    const invalidPlan: ImportPlan = {
        ...plan,
        columns: plan.columns.map(column => (column.source === 'name' ? { ...column, targetType: 'int64' } : column)),
    };
    await assert.rejects(
        prepareImportDataset({
            sourceArrowPath: analysis.sourceArrowPath,
            outputArrowPath: path.join(dir, 'invalid.arrow'),
            sourceDataSource: analysis.dataSource,
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
        sourceDataSource: analysis.dataSource,
        plan: buildPlan(analysis, path.basename(source)),
    });
    assert.equal(prepared.dataSource.schema.fields.find(field => field.name === 'pickup_datetime')?.type.toString(), 'Timestamp<MILLISECOND>');

    const stream = await prepared.dataSource.open();
    for await (const batch of stream.batches()) {
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
    assert.ok(analysis.profile.sampleRows <= 100_000);
    assert.equal(analysis.profile.columns.find(column => column.name === 'code')?.detectedType, 'string');

    let rows = 0;
    let batches = 0;
    const stream = await analysis.dataSource.open({ batchRows: 1000 });
    for await (const batch of stream.batches()) {
        assert.ok(batch.numRows <= 1000);
        rows += batch.numRows;
        batches += 1;
    }
    assert.equal(rows, 100_000);
    assert.equal(batches, 100);
});

test('Profile v2 reports quality issues and transforms clean or filter rows', async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dory-import-transform-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const source = path.join(dir, 'quality.csv');
    const rows = ['name,age,email,nickname,blank,score'];
    for (let row = 1; row <= 10; row += 1) {
        rows.push(`" ${row === 1 ? 'Alice' : `User ${row}`} ",${row === 10 ? 'oops' : row}," ${row === 1 ? 'ÜSER' : `USER${row}`}@EXAMPLE.COM ","","   ",${row}`);
    }
    await writeFile(source, `${rows.join('\n')}\n`);
    const analysis = await analyzeCsv({
        sourcePath: source,
        sourceName: 'quality.csv',
        sourceHash: 'd'.repeat(64),
        outputArrowPath: path.join(dir, 'source.arrow'),
        parsing: { delimiter: ',', hasHeader: true, encoding: 'utf8', quoteChar: '"' },
    });
    assert.equal(analysis.profile.version, 'dory.dataset-profile.v2');
    assert.equal(analysis.profile.columns.find(column => column.name === 'name')?.whitespaceCount, 10);
    assert.ok(analysis.profile.columns.find(column => column.name === 'name')?.issues.some(issue => issue.code === 'surrounding_whitespace'));
    assert.ok(analysis.profile.columns.find(column => column.name === 'age')?.issues.some(issue => issue.code === 'mixed_type'));
    const nickname = analysis.profile.columns.find(column => column.name === 'nickname');
    assert.ok(nickname?.issues.some(issue => issue.code === 'all_missing'));
    assert.deepEqual(nickname?.sample.topValues[0], { value: '', count: 10, rate: 1 });
    const score = analysis.profile.columns.find(column => column.name === 'score');
    assert.equal(score?.sample.distinctCount, 10);
    assert.ok(score?.sample.quantiles && score.sample.quantiles.p50 >= 5 && score.sample.quantiles.p50 <= 6);

    const plan = buildPlan(analysis, 'quality');
    plan.columns = plan.columns.map(column => (column.source === 'age' ? { ...column, targetType: 'int64' as const } : column));
    plan.transform.operations = [
        { kind: 'trim', column: 'name' },
        { kind: 'replace', column: 'name', find: 'Alice', replacement: 'Alicia' },
        { kind: 'trim', column: 'email' },
        { kind: 'lowercase', column: 'email' },
        { kind: 'replace', column: 'email', find: '.', replacement: '-' },
        { kind: 'emptyToNull', column: 'nickname' },
        { kind: 'trim', column: 'blank' },
        { kind: 'emptyToNull', column: 'blank' },
        { kind: 'dropInvalid', column: 'age', targetType: 'int64', dropNulls: false },
    ];

    const preview = await previewImportTransform({ sourceArrowPath: analysis.sourceArrowPath, plan });
    assert.equal(preview.inputRows, 10);
    assert.equal(preview.droppedRows, 1);
    assert.equal(preview.rows[0]?.after.name, 'Alicia');
    assert.equal(preview.rows[0]?.after.email, 'üser@example-com');
    assert.equal(preview.rows[0]?.after.nickname, null);
    assert.equal(preview.rows[0]?.after.blank, null);

    const prepared = await prepareImportDataset({
        sourceArrowPath: analysis.sourceArrowPath,
        outputArrowPath: path.join(dir, 'prepared.arrow'),
        sourceDataSource: analysis.dataSource,
        plan,
    });
    assert.equal(prepared.inputRows, 10);
    assert.equal(prepared.outputRows, 9);
    assert.equal(prepared.filteredRows, 1);
    const stream = await prepared.dataSource.open();
    for await (const batch of stream.batches()) {
        assert.equal(batch.getChild('name')?.get(0), 'Alicia');
        assert.equal(batch.getChild('email')?.get(0), 'üser@example-com');
        assert.equal(batch.getChild('nickname')?.get(0), null);
        assert.equal(batch.getChild('blank')?.get(0), null);
        break;
    }
});

test('Profile v2 preserves exact Int64 range values outside Number safe integers', async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dory-import-int64-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const source = path.join(dir, 'int64.csv');
    await writeFile(source, 'value\n-9223372036854775808\n9223372036854775807\n');
    const analysis = await analyzeCsv({
        sourcePath: source,
        sourceName: 'int64.csv',
        sourceHash: 'e'.repeat(64),
        outputArrowPath: path.join(dir, 'source.arrow'),
        parsing: { delimiter: ',', hasHeader: true, encoding: 'utf8', quoteChar: '"' },
    });
    const value = analysis.profile.columns[0];
    assert.equal(value?.detectedType, 'int64');
    assert.equal(value?.min, '-9223372036854775808');
    assert.equal(value?.max, '9223372036854775807');
});

function buildPlan(analysis: Awaited<ReturnType<typeof analyzeCsv>>, sourceName: string): ImportPlan {
    return {
        version: 'dory.import-plan.v2',
        source: { format: 'csv', ...analysis.parsing },
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
        sourceSchemaHash: datasetSchemaHash(analysis.dataSource),
    };
}

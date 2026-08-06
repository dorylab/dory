import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import pl from 'nodejs-polars';

import { analyzeImportSourceFile, ImportSourceError, prepareImportDataset, type ImportPlan } from '../../src';

test('Parquet preserves canonical scalar types and stringifies decimals exactly', async t => {
    const dir = await temporaryDirectory(t, 'parquet');
    const sourcePath = path.join(dir, 'source.parquet');
    const amount = pl.Series('amount', ['12.3400', '9999999999999999.9900']).cast(pl.Decimal(24, 4));
    pl.DataFrame({
        id: pl.Series('id', ['-9223372036854775808', '9223372036854775807']).cast(pl.Int64),
        active: [true, false],
        score: [1.5, 2.25],
        created_at: [new Date('2026-01-02T03:04:05.678Z'), new Date('2026-02-03T04:05:06.789Z')],
        amount,
        name: ['张三', 'line\nbreak'],
    }).writeParquet(sourcePath, { compression: 'zstd' });

    const analysis = await analyzeImportSourceFile({
        sourcePath,
        sourceName: 'source.parquet',
        sourceHash: 'a'.repeat(64),
        outputArrowPath: path.join(dir, 'source.arrow'),
        source: { format: 'parquet' },
    });

    assert.deepEqual(
        analysis.profile.columns.map(column => [column.name, column.detectedType]),
        [
            ['id', 'int64'],
            ['active', 'boolean'],
            ['score', 'float64'],
            ['created_at', 'datetime'],
            ['amount', 'string'],
            ['name', 'string'],
        ],
    );
    assert.deepEqual(analysis.sourceWarnings, [{ code: 'DECIMAL_STRINGIFIED', column: 'amount', sourceType: 'DataType(Decimal(24,4))' }]);
    assert.deepEqual(
        analysis.sourceSchema.find(column => column.name === 'amount'),
        {
            name: 'amount',
            sourceType: 'DataType(Decimal(24,4))',
            importType: 'string',
        },
    );
    assert.equal(analysis.profile.preview[1]?.amount, '9999999999999999.9900');
    assert.equal(analysis.profile.columns[0]?.min, '-9223372036854775808');
    assert.equal(analysis.profile.columns[0]?.max, '9223372036854775807');

    const plan = planFor(analysis, { format: 'parquet' });
    const prepared = await prepareImportDataset({
        sourceArrowPath: analysis.sourceArrowPath,
        outputArrowPath: path.join(dir, 'prepared.arrow'),
        sourceDataset: analysis.dataset,
        plan,
    });
    assert.equal(prepared.outputRows, 2);
});

test('NDJSON accepts flat records, promotes mixed numbers, and rejects nested values', async t => {
    const dir = await temporaryDirectory(t, 'ndjson');
    const sourcePath = path.join(dir, 'source.ndjson');
    await writeFile(sourcePath, '{"id":1,"score":1,"name":"Alice","active":true}\n\n{"id":2,"score":2.5,"name":"Bob"}\n');
    const analysis = await analyzeImportSourceFile({
        sourcePath,
        sourceName: 'source.ndjson',
        sourceHash: 'b'.repeat(64),
        outputArrowPath: path.join(dir, 'source.arrow'),
        source: { format: 'ndjson' },
    });
    assert.equal(analysis.profile.rows, 2);
    assert.equal(analysis.profile.columns.find(column => column.name === 'score')?.detectedType, 'float64');
    assert.equal(analysis.profile.columns.find(column => column.name === 'active')?.nullCount, 1);

    const nestedPath = path.join(dir, 'nested.jsonl');
    await writeFile(nestedPath, '{"id":1,"metadata":{"region":"eu"}}\n');
    await assert.rejects(
        analyzeImportSourceFile({
            sourcePath: nestedPath,
            sourceName: 'nested.jsonl',
            sourceHash: 'c'.repeat(64),
            outputArrowPath: path.join(dir, 'nested.arrow'),
            source: { format: 'ndjson' },
        }),
        (error: unknown) => error instanceof ImportSourceError && error.code === 'IMPORT_NDJSON_NESTED_VALUE',
    );
});

test('Arrow IPC file is normalized while IPC stream is rejected', async t => {
    const dir = await temporaryDirectory(t, 'arrow');
    const sourcePath = path.join(dir, 'source.feather');
    const streamPath = path.join(dir, 'source-stream.arrow');
    const frame = pl.DataFrame({ id: pl.Series('id', [1n, 2n], pl.Int64), label: ['one', 'two'] });
    frame.writeIPC(sourcePath, { compression: 'lz4' });
    frame.writeIPCStream(streamPath);

    const analysis = await analyzeImportSourceFile({
        sourcePath,
        sourceName: 'source.feather',
        sourceHash: 'd'.repeat(64),
        outputArrowPath: path.join(dir, 'normalized.arrow'),
        source: { format: 'arrow' },
    });
    assert.equal(analysis.profile.rows, 2);
    assert.equal(analysis.profile.columns[0]?.detectedType, 'int64');

    await assert.rejects(
        analyzeImportSourceFile({
            sourcePath: streamPath,
            sourceName: 'source-stream.arrow',
            sourceHash: 'e'.repeat(64),
            outputArrowPath: path.join(dir, 'stream-normalized.arrow'),
            source: { format: 'arrow' },
        }),
        (error: unknown) => error instanceof ImportSourceError && error.code === 'IMPORT_SOURCE_FORMAT_MISMATCH',
    );
});

test('Source readers stop before materialization when analysis is canceled', async t => {
    const dir = await temporaryDirectory(t, 'cancel');
    const sourcePath = path.join(dir, 'source.ndjson');
    await writeFile(sourcePath, '{"id":1}\n');
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
        analyzeImportSourceFile({
            sourcePath,
            sourceName: 'source.ndjson',
            sourceHash: 'f'.repeat(64),
            outputArrowPath: path.join(dir, 'source.arrow'),
            source: { format: 'ndjson' },
            signal: controller.signal,
        }),
        (error: unknown) => error instanceof Error && error.name === 'AbortError',
    );
});

test('Source readers reject the reserved internal row-number column', async t => {
    const dir = await temporaryDirectory(t, 'reserved-column');
    const sourcePath = path.join(dir, 'source.csv');
    await writeFile(sourcePath, '__dory_source_row_number,name\n1,Alice\n');
    await assert.rejects(
        analyzeImportSourceFile({
            sourcePath,
            sourceName: 'source.csv',
            sourceHash: '1'.repeat(64),
            outputArrowPath: path.join(dir, 'source.arrow'),
            source: { format: 'csv', delimiter: ',', hasHeader: true, encoding: 'utf8', quoteChar: '"' },
        }),
        (error: unknown) => error instanceof ImportSourceError && error.code === 'IMPORT_SOURCE_SCHEMA_UNSUPPORTED',
    );
});

function planFor(analysis: Awaited<ReturnType<typeof analyzeImportSourceFile>>, source: ImportPlan['source']): ImportPlan {
    return {
        version: 'dory.import-plan.v2',
        source,
        target: { mode: 'create', table: 'fixture' },
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
        sourceSchemaHash: 'f'.repeat(64),
    };
}

async function temporaryDirectory(t: test.TestContext, format: string) {
    const directory = await mkdtemp(path.join(os.tmpdir(), `dory-import-${format}-`));
    t.after(() => rm(directory, { recursive: true, force: true }));
    return directory;
}

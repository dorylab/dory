import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { DuckDBInstance } from '@duckdb/node-api';
import { rowDataStream } from '@dory/data-plane';

import {
    buildResultSetPreview,
    createDefaultResultSetDataWriter,
    inferResultSetColumns,
    NoopFullDataWriter,
    ParquetResultSetDataWriter,
    resultSetDataAvailability,
    type ResultSetManifest,
} from '../../src/index';

const rows = Array.from({ length: 5 }, (_, index) => ({ id: index + 1, name: `row-${index + 1}` }));
const columns = inferResultSetColumns(rows);
const preview = buildResultSetPreview({ columns, rows, maxRows: 2 });

assert.equal(preview.previewRowCount, 2);
assert.equal(preview.truncated, true);
assert.deepEqual(
    columns.map(column => column.name),
    ['id', 'name'],
);

const manifest: ResultSetManifest = {
    format: 'dory.resultset.v1',
    artifactId: 'rs_test',
    organizationId: 'org_test',
    kind: 'sql-result-set',
    status: 'success',
    source: { type: 'query-run' },
    schema: columns,
    rowCount: 5,
    previewRowCount: 2,
    limited: true,
    files: {
        preview: { path: 'preview.json', format: 'json', rowCount: 2 },
    },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
};

assert.equal(resultSetDataAvailability(manifest), 'preview-only');

const complexRows = [
    {
        id: 1n,
        name: 'Ada',
        active: true,
        amount: 12.5,
        created_at: new Date('2026-07-03T00:00:00.000Z'),
        payload: { nested: 1n },
        bytes: new Uint8Array([1, 2, 3]),
    },
    {
        id: 2n,
        name: 'Grace',
        active: false,
        amount: null,
        created_at: null,
        payload: ['x', 2n],
        bytes: null,
    },
];
const complexPreview = buildResultSetPreview({ columns: inferResultSetColumns(complexRows), rows: complexRows });
assert.deepEqual(complexPreview.rows[0]?.id, '1');
assert.equal(complexPreview.rows[0]?.created_at, '2026-07-03T00:00:00.000Z');

const originalPartRows = process.env.DORY_RESULTSET_PARQUET_PART_ROWS;
process.env.DORY_RESULTSET_PARQUET_PART_ROWS = '2';
const writer = new ParquetResultSetDataWriter();
const parquet = await writer.write({
    artifactId: 'rs_writer_test',
    dataStream: rowDataStream({
        columns: [
            { name: 'id', type: 'bigint' },
            { name: 'name', type: 'varchar' },
            { name: 'active', type: 'boolean' },
            { name: 'amount', type: 'double' },
            { name: 'created_at', type: 'timestamp with time zone' },
            { name: 'payload', type: 'json' },
            { name: 'bytes', type: 'blob' },
        ],
        rows: complexRows,
        rowCount: complexRows.length,
        metadata: { source: 'resultset-test' },
    }),
    target: null,
});
assert.equal(parquet?.format, 'parquet');
assert.equal(parquet?.rowCount, 2);
assert.equal(parquet?.parts.length, 1);
assert.equal(parquet?.parts[0]?.path, 'data/part-00000.parquet');
assert.equal(parquet?.parts[0]?.rowCount, 2);
assert.ok((parquet?.byteSize ?? 0) > 0);

const fullManifest: ResultSetManifest = {
    ...manifest,
    files: {
        ...manifest.files,
        data: {
            path: 'data',
            format: 'parquet',
            rowCount: 2,
            byteSize: parquet?.byteSize,
            parts: parquet?.parts.map(part => ({ path: part.path, format: part.format, rowCount: part.rowCount, byteSize: part.byteSize })),
        },
    },
};
assert.equal(resultSetDataAvailability(fullManifest), 'full');

const emptyParquet = await writer.write({
    artifactId: 'rs_empty_test',
    dataStream: rowDataStream({ columns: [{ name: 'id', type: 'bigint' }], rows: [], rowCount: 0, metadata: { source: 'resultset-test' } }),
    target: null,
});
assert.equal(emptyParquet?.rowCount, 0);
assert.equal(emptyParquet?.parts.length, 1);
assert.equal(emptyParquet?.parts[0]?.rowCount, 0);
assert.ok((emptyParquet?.byteSize ?? 0) > 0);

function* generatedRows() {
    yield { id: 1, name: 'generated-1', bytes: new Uint8Array([1]) };
    yield { id: 2, name: 'generated-2', bytes: new Uint8Array([2]) };
    yield { id: 3, name: 'generated-3', bytes: new Uint8Array([3]) };
}

const generatedParquet = await writer.write({
    artifactId: 'rs_generated_test',
    dataStream: rowDataStream({
        columns: [
            { name: 'id', type: 'bigint' },
            { name: 'name', type: 'varchar' },
            { name: 'bytes', type: 'blob' },
        ],
        rows: generatedRows(),
        metadata: { source: 'resultset-test' },
    }),
    target: null,
});
assert.equal(generatedParquet?.rowCount, 3);
assert.equal(generatedParquet?.parts.length, 2);

assert.ok(createDefaultResultSetDataWriter({ VERCEL: '1' }) instanceof NoopFullDataWriter);
assert.ok(createDefaultResultSetDataWriter({ VERCEL: '1', DORY_RESULTSET_FULL_DATA: 'parquet' }) instanceof ParquetResultSetDataWriter);
assert.ok(createDefaultResultSetDataWriter({ DORY_RESULTSET_FULL_DATA: 'disabled' }) instanceof NoopFullDataWriter);
assert.ok(createDefaultResultSetDataWriter({ DORY_RUNTIME: 'desktop' }) instanceof ParquetResultSetDataWriter);

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dory-resultset-test-'));
try {
    const dataDir = path.join(tempDir, 'data');
    await mkdir(dataDir, { recursive: true });
    for (const part of parquet!.parts) {
        await pipeline(part.data as NodeJS.ReadableStream, createWriteStream(path.join(tempDir, part.path)));
    }
    const parquetPath = path.join(dataDir, '*.parquet');
    const generatedDataDir = path.join(tempDir, 'generated-data');
    await mkdir(generatedDataDir, { recursive: true });
    for (const part of generatedParquet!.parts) {
        await pipeline(part.data as NodeJS.ReadableStream, createWriteStream(path.join(generatedDataDir, path.basename(part.path))));
    }
    const generatedParquetPath = path.join(generatedDataDir, '*.parquet');
    const instance = await DuckDBInstance.create(':memory:');
    const connection = await instance.connect();
    try {
        const reader = await connection.runAndReadAll(`SELECT id, name, active, amount FROM read_parquet('${parquetPath.replace(/'/g, "''")}') ORDER BY id`);
        const readRows = reader.getRowObjectsJson() as Array<Record<string, unknown>>;
        assert.deepEqual(readRows[0], { id: '1', name: 'Ada', active: true, amount: 12.5 });
        assert.deepEqual(readRows[1], { id: '2', name: 'Grace', active: false, amount: null });

        const generatedTypesReader = await connection.runAndReadAll(
            `SELECT typeof(id) AS id_type, typeof(name) AS name_type, typeof(bytes) AS bytes_type FROM read_parquet('${generatedParquetPath.replace(/'/g, "''")}') LIMIT 1`,
        );
        const generatedTypes = generatedTypesReader.getRowObjectsJson() as Array<Record<string, unknown>>;
        assert.deepEqual(generatedTypes[0], { id_type: 'BIGINT', name_type: 'VARCHAR', bytes_type: 'BLOB' });
    } finally {
        connection.closeSync();
        instance.closeSync();
    }
} finally {
    await rm(tempDir, { recursive: true, force: true });
    if (typeof originalPartRows === 'undefined') {
        delete process.env.DORY_RESULTSET_PARQUET_PART_ROWS;
    } else {
        process.env.DORY_RESULTSET_PARQUET_PART_ROWS = originalPartRows;
    }
    await parquet?.cleanup?.();
    await emptyParquet?.cleanup?.();
    await generatedParquet?.cleanup?.();
}

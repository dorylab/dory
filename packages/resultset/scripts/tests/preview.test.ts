import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';

import { buildResultSetPreview, inferResultSetColumns, ParquetResultSetDataWriter, resultSetDataAvailability, type ResultSetManifest } from '../../src/index';

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

const writer = new ParquetResultSetDataWriter();
const parquet = await writer.write({
    artifactId: 'rs_writer_test',
    schema: [
        { name: 'id', logicalType: 'number', databaseType: 'bigint' },
        { name: 'name', logicalType: 'string' },
        { name: 'active', logicalType: 'boolean' },
        { name: 'amount', logicalType: 'number' },
        { name: 'created_at', logicalType: 'datetime' },
        { name: 'payload', logicalType: 'json' },
        { name: 'bytes', logicalType: 'binary' },
    ],
    rows: complexRows,
    target: null,
});
assert.equal(parquet?.format, 'parquet');
assert.equal(parquet?.path, 'data.parquet');
assert.equal(parquet?.rowCount, 2);
assert.ok((parquet?.byteSize ?? 0) > 0);

const fullManifest: ResultSetManifest = {
    ...manifest,
    files: {
        ...manifest.files,
        data: { path: 'data.parquet', format: 'parquet', rowCount: 2, byteSize: parquet?.byteSize },
    },
};
assert.equal(resultSetDataAvailability(fullManifest), 'full');

const emptyParquet = await writer.write({
    artifactId: 'rs_empty_test',
    schema: [{ name: 'id', logicalType: 'number' }],
    rows: [],
    target: null,
});
assert.equal(emptyParquet?.rowCount, 0);
assert.ok((emptyParquet?.byteSize ?? 0) > 0);

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dory-resultset-test-'));
try {
    const parquetPath = path.join(tempDir, 'data.parquet');
    await writeFile(parquetPath, parquet!.data);
    const instance = await DuckDBInstance.create(':memory:');
    const connection = await instance.connect();
    try {
        const reader = await connection.runAndReadAll(`SELECT id, name, active, amount FROM read_parquet('${parquetPath.replace(/'/g, "''")}') ORDER BY id`);
        const readRows = reader.getRowObjectsJson() as Array<Record<string, unknown>>;
        assert.deepEqual(readRows[0], { id: '1', name: 'Ada', active: true, amount: 12.5 });
        assert.deepEqual(readRows[1], { id: '2', name: 'Grace', active: false, amount: null });
    } finally {
        connection.closeSync();
        instance.closeSync();
    }
} finally {
    await rm(tempDir, { recursive: true, force: true });
}

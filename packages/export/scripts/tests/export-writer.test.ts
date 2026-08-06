import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { rowDataStream } from '@dory/data-plane';
import { tableFromIPC } from 'apache-arrow';
import pl from 'nodejs-polars';

import { createExportWriter, parseExportPlan } from '../../src';

function fixtureStream() {
    return rowDataStream({
        columns: [
            { name: 'id', type: 'BIGINT' },
            { name: 'name', type: 'VARCHAR' },
            { name: 'note', type: 'VARCHAR' },
        ],
        rows: [
            { id: 9_007_199_254_740_993n, name: 'Ada, Lovelace', note: null },
            { id: 2n, name: '"quoted"', note: '' },
        ],
        metadata: { source: 'export-test' },
        batchRows: 1,
    });
}

test('CSV writer streams through Arrow IPC with stable escaping', async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dory-export-test-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const output = path.join(dir, 'data.csv');
    const progress: number[] = [];
    const result = await createExportWriter('csv').write({
        stream: fixtureStream(),
        outputPath: output,
        onProgress: value => {
            progress.push(value.rows);
        },
    });
    const csv = await readFile(output, 'utf8');
    assert.match(csv, /^id,name,note\n/);
    assert.match(csv, /9007199254740993,"Ada, Lovelace",/);
    assert.match(csv, /2,"""quoted""",""/);
    assert.deepEqual(progress.slice(0, 2), [1, 2]);
    assert.equal(result.rowCount, 2);
    assert.ok(result.byteSize > 0);
});

test('Arrow writer preserves schema and rows', async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dory-export-test-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const output = path.join(dir, 'data.arrow');
    await createExportWriter('arrow').write({ stream: fixtureStream(), outputPath: output });
    const table = tableFromIPC(await readFile(output));
    assert.equal(table.numRows, 2);
    assert.deepEqual(
        table.schema.fields.map(field => field.name),
        ['id', 'name', 'note'],
    );
});

test('Parquet writer preserves row count', async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dory-export-test-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const output = path.join(dir, 'data.parquet');
    const result = await createExportWriter('parquet').write({ stream: fixtureStream(), outputPath: output });
    const frame = pl.readParquet(output);
    assert.equal(frame.height, 2);
    assert.equal(result.rowCount, 2);
});

test('canceled Arrow exports close the stream and remove partial output', async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dory-export-test-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const output = path.join(dir, 'canceled.arrow');
    const controller = new AbortController();
    let closed = false;
    const stream = rowDataStream({
        columns: [{ name: 'id', type: 'BIGINT' }],
        rows: Array.from({ length: 4 }, (_, id) => ({ id })),
        metadata: { source: 'export-cancel-test' },
        batchRows: 1,
        close: () => {
            closed = true;
        },
    });
    await assert.rejects(
        createExportWriter('arrow').write({
            stream,
            outputPath: output,
            signal: controller.signal,
            onProgress: progress => {
                if (progress.rows === 1) controller.abort();
            },
        }),
        error => error instanceof Error && error.name === 'AbortError',
    );
    assert.equal(closed, true);
    await assert.rejects(access(output));
});

test('ExportPlan rejects empty and duplicate-free validation remains server-owned', () => {
    assert.throws(() =>
        parseExportPlan({
            version: 1,
            source: { kind: 'table', connectionId: 'c1', database: 'main', table: 'orders' },
            columns: [],
            operations: { filters: [], search: null, searchColumns: [], sort: null },
            output: { format: 'csv' },
        }),
    );
});

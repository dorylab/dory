import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { tableFromIPC } from 'apache-arrow';

import { ArrowIpcFileDataSource, collectSerializableDataPage, createDataSchema, rowDataStream, schemaToIpc, writeDataStreamToArrowIpcFile } from '../../src/index';

test('row data stream batches rows and serializes precise values', async () => {
    const stream = rowDataStream({
        columns: [
            { name: 'id', type: 'BIGINT', nullable: false },
            { name: 'amount', type: 'DECIMAL(10,2)' },
            { name: 'created', type: 'TIMESTAMP WITH TIME ZONE' },
            { name: 'payload', type: 'BLOB' },
        ],
        rows: [
            { id: 9_007_199_254_740_993n, amount: '123.45', created: '2026-08-06T10:00:00.000Z', payload: Uint8Array.from([1, 2, 3]) },
            { id: 2n, amount: '-0.50', created: '2026-08-06T11:00:00.000Z', payload: null },
        ],
        metadata: { source: 'test' },
        batchRows: 1,
    });

    const page = await collectSerializableDataPage(stream, 10);
    assert.equal(page.rowCount, 2);
    assert.equal(page.rows[0]?.id, '9007199254740993');
    assert.equal(page.rows[0]?.amount, '123.45');
    assert.equal(page.rows[0]?.created, '2026-08-06T10:00:00.000Z');
    assert.equal(page.rows[0]?.payload, 'AQID');
});

test('browser serialization preserves unsigned integers, large decimals, dates, times, and timestamps', async () => {
    const stream = rowDataStream({
        columns: [
            { name: 'unsigned_id', type: 'UINT64' },
            { name: 'amount', type: 'DECIMAL(38,2)' },
            { name: 'day', type: 'DATE' },
            { name: 'clock', type: 'TIME' },
            { name: 'local_created', type: 'TIMESTAMP' },
            { name: 'utc_created', type: 'TIMESTAMP WITH TIME ZONE' },
        ],
        rows: [
            {
                unsigned_id: '18446744073709551615',
                amount: '999999999999999999999999999999999999.99',
                day: '2026-08-06',
                clock: '12:34:56.789',
                local_created: '2026-08-06T12:34:56.789Z',
                utc_created: '2026-08-06T12:34:56.789Z',
            },
        ],
        metadata: { source: 'test' },
    });
    const page = await collectSerializableDataPage(stream, 1);
    assert.deepEqual(page.rows[0], {
        unsigned_id: '18446744073709551615',
        amount: '999999999999999999999999999999999999.99',
        day: '2026-08-06',
        clock: '12:34:56.789',
        local_created: '2026-08-06T12:34:56.789Z',
        utc_created: '2026-08-06T12:34:56.789Z',
    });
});

test('data stream is single-consumer and close is idempotent', async () => {
    let closes = 0;
    const stream = rowDataStream({
        columns: [{ name: 'id', type: 'INTEGER' }],
        rows: [{ id: 1 }],
        metadata: { source: 'test' },
        close: () => {
            closes += 1;
        },
    });
    const batches = stream.batches();
    assert.throws(() => stream.batches(), /DATA_STREAM_ALREADY_CONSUMED/);
    for await (const _batch of batches) void _batch;
    await stream.close();
    assert.equal(closes, 1);
});

test('Arrow IPC data source can be opened repeatedly with bounded batches', async t => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'dory-data-plane-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const filePath = path.join(dir, 'data.arrow');
    const sourceStream = rowDataStream({
        columns: [{ name: 'id', type: 'INTEGER' }],
        rows: Array.from({ length: 5 }, (_, id) => ({ id })),
        metadata: { source: 'fixture' },
    });
    const written = await writeDataStreamToArrowIpcFile(sourceStream, filePath);
    assert.deepEqual(written, { rowCount: 5, batchCount: 1, byteSize: written.byteSize });
    assert.ok(written.byteSize > 0);

    const source = await ArrowIpcFileDataSource.fromFile({ filePath, metadata: { source: 'fixture' }, rowCount: 5 });
    for (let pass = 0; pass < 2; pass += 1) {
        const stream = await source.open({ batchRows: 2 });
        const sizes: number[] = [];
        for await (const batch of stream.batches()) sizes.push(batch.numRows);
        assert.deepEqual(sizes, [2, 2, 1]);
    }
});

test('empty schema IPC preserves typed fields and duplicate display names', () => {
    const schema = createDataSchema([
        { name: 'id', type: 'BIGINT', nullable: false },
        { name: 'id', type: 'VARCHAR', nullable: true },
    ]);
    const table = tableFromIPC(schemaToIpc(schema));
    assert.equal(table.numRows, 0);
    assert.deepEqual(
        table.schema.fields.map(field => [field.name, field.metadata.get('dory.displayName'), field.metadata.get('dory.databaseType')]),
        [
            ['id', 'id', 'BIGINT'],
            ['id__2', 'id', 'VARCHAR'],
        ],
    );
});

test('pull backpressure does not read beyond the requested batch', async () => {
    let produced = 0;
    const stream = rowDataStream({
        columns: [{ name: 'id', type: 'BIGINT' }],
        rows: (function* () {
            for (let id = 0; id < 10; id += 1) {
                produced += 1;
                yield { id };
            }
        })(),
        metadata: { source: 'test' },
        batchRows: 2,
    });
    const iterator = stream.batches()[Symbol.asyncIterator]();
    assert.equal(produced, 0);
    assert.equal((await iterator.next()).value?.numRows, 2);
    assert.equal(produced, 2);
    await iterator.return?.();
    await stream.close();
});

test('one million generated rows stay bounded by the configured batch size', async () => {
    const stream = rowDataStream({
        columns: [{ name: 'id', type: 'BIGINT' }],
        rows: (function* () {
            for (let id = 0; id < 1_000_000; id += 1) yield { id };
        })(),
        metadata: { source: 'test' },
        batchRows: 10_000,
    });
    let rows = 0;
    let batches = 0;
    for await (const batch of stream.batches()) {
        assert.ok(batch.numRows <= 10_000);
        rows += batch.numRows;
        batches += 1;
    }
    assert.equal(rows, 1_000_000);
    assert.equal(batches, 100);
});

test('upstream failures close resources', async () => {
    let closed = false;
    const stream = rowDataStream({
        columns: [{ name: 'id', type: 'BIGINT' }],
        rows: (function* () {
            yield { id: 1 };
            throw new Error('fixture failure');
        })(),
        metadata: { source: 'test' },
        close: () => {
            closed = true;
        },
    });
    await assert.rejects(async () => {
        for await (const batch of stream.batches()) void batch;
    }, /fixture failure/);
    assert.equal(closed, true);
});

test('aborted streams close upstream resources', async () => {
    const controller = new AbortController();
    let closed = false;
    const stream = rowDataStream({
        columns: [{ name: 'id', type: 'INTEGER' }],
        rows: Array.from({ length: 10 }, (_, id) => ({ id })),
        metadata: { source: 'test' },
        batchRows: 2,
        signal: controller.signal,
        close: () => {
            closed = true;
        },
    });
    await assert.rejects(async () => {
        for await (const batch of stream.batches()) {
            assert.equal(batch.numRows, 2);
            controller.abort();
        }
    }, /canceled/);
    assert.equal(closed, true);
});

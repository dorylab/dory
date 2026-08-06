import { createWriteStream } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { RecordBatchFileWriter } from 'apache-arrow';

import { schemaToIpc } from './schema-ipc';
import type { DataStream } from './types';

export type ArrowIpcWriteResult = {
    rowCount: number;
    batchCount: number;
    byteSize: number;
};

export async function writeDataStreamToArrowIpcFile(stream: DataStream, filePath: string): Promise<ArrowIpcWriteResult> {
    let rowCount = 0;
    let batchCount = 0;
    const batches = (async function* () {
        for await (const batch of stream.batches()) {
            batchCount += 1;
            rowCount += batch.numRows;
            yield batch;
        }
    })();

    try {
        await pipeline(Readable.from(batches, { objectMode: true }), RecordBatchFileWriter.throughNode({ autoDestroy: true }), createWriteStream(filePath));
        if (batchCount === 0) await writeFile(filePath, schemaToIpc(stream.schema));
        return {
            rowCount,
            batchCount,
            byteSize: (await stat(filePath)).size,
        };
    } finally {
        await stream.close();
    }
}

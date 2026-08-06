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

    const writer = new RecordBatchFileWriter({ autoDestroy: true });
    const output = createWriteStream(filePath);
    const pipePromise = pipeline(Readable.from(writer as AsyncIterable<Uint8Array>, { objectMode: false }), output);

    try {
        const writePromise = writer.writeAll(batches);
        await Promise.all([writePromise, pipePromise]);
        if (batchCount === 0) await writeFile(filePath, schemaToIpc(stream.schema));
        return {
            rowCount,
            batchCount,
            byteSize: (await stat(filePath)).size,
        };
    } catch (error) {
        writer.abort(error);
        output.destroy(error instanceof Error ? error : new Error(String(error)));
        await pipePromise.catch(() => undefined);
        throw error;
    } finally {
        await stream.close();
    }
}

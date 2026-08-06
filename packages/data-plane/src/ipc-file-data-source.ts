import { createReadStream } from 'node:fs';

import { RecordBatchReader, type RecordBatch, type Schema } from 'apache-arrow';

import { dataStreamAbortError, normalizeBatchBytes, normalizeBatchRows, onceAsync } from './lifecycle';
import type { DataOpenOptions, DataSource, DataStream, DataStreamMetadata } from './types';

export type ArrowIpcFileDataSourceOptions = {
    filePath: string;
    metadata: DataStreamMetadata;
    rowCount?: number | null;
};

export class ArrowIpcFileDataSource implements DataSource {
    private constructor(
        readonly schema: Schema,
        readonly metadata: Readonly<DataStreamMetadata>,
        readonly rowCount: number | null | undefined,
        private readonly filePath: string,
    ) {}

    static async fromFile(options: ArrowIpcFileDataSourceOptions): Promise<ArrowIpcFileDataSource> {
        const reader = await RecordBatchReader.from(createReadStream(options.filePath));
        await reader.open();
        const schema = reader.schema;
        await reader.cancel();
        return new ArrowIpcFileDataSource(schema, Object.freeze({ ...options.metadata }), options.rowCount, options.filePath);
    }

    async open(options: DataOpenOptions = {}): Promise<DataStream> {
        if (options.signal?.aborted) throw dataStreamAbortError();

        const fileStream = createReadStream(this.filePath);
        const reader = await RecordBatchReader.from(fileStream);
        await reader.open();
        const batchRows = normalizeBatchRows(options.batchRows);
        const batchBytes = normalizeBatchBytes(options.batchBytes);
        const close = onceAsync(async () => {
            options.signal?.removeEventListener('abort', onAbort);
            await Promise.resolve(reader.cancel()).catch(() => undefined);
            fileStream.destroy();
        });
        const onAbort = () => void close();
        options.signal?.addEventListener('abort', onAbort, { once: true });
        let consumed = false;

        return {
            schema: this.schema,
            metadata: this.metadata,
            rowCount: this.rowCount,
            batches: () => {
                if (consumed) throw new Error('DATA_STREAM_ALREADY_CONSUMED');
                consumed = true;
                return sliceBatches(reader, batchRows, batchBytes, options.signal, close);
            },
            close,
        };
    }
}

async function* sliceBatches(batches: AsyncIterable<RecordBatch>, batchRows: number, batchBytes: number, signal: AbortSignal | undefined, close: () => Promise<void>) {
    try {
        for await (const batch of batches) {
            if (signal?.aborted) throw dataStreamAbortError();
            const rowsByBytes = batch.data.byteLength > batchBytes && batch.numRows > 0 ? Math.max(1, Math.floor((batch.numRows * batchBytes) / batch.data.byteLength)) : batchRows;
            const sliceRows = Math.min(batchRows, rowsByBytes);
            if (batch.numRows <= sliceRows) {
                yield batch;
                continue;
            }
            for (let offset = 0; offset < batch.numRows; offset += sliceRows) {
                if (signal?.aborted) throw dataStreamAbortError();
                yield batch.slice(offset, Math.min(batch.numRows, offset + sliceRows));
            }
        }
    } finally {
        await close();
    }
}

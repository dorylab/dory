import { createReadStream } from 'node:fs';
import { RecordBatchReader, type Schema } from 'apache-arrow';

import type { Dataset, DatasetBatchReader, DatasetMetadata, DatasetOpenOptions } from './types';

export type ArrowIpcFileDatasetOptions = {
    filePath: string;
    metadata: DatasetMetadata;
    rowCount?: number;
};

export class ArrowIpcFileDataset implements Dataset {
    private constructor(
        readonly schema: Schema,
        readonly metadata: DatasetMetadata,
        readonly rowCount: number | undefined,
        private readonly filePath: string,
    ) {}

    static async open(options: ArrowIpcFileDatasetOptions): Promise<ArrowIpcFileDataset> {
        const reader = await RecordBatchReader.from(createReadStream(options.filePath));
        await reader.open();
        const schema = reader.schema;
        await reader.cancel();
        return new ArrowIpcFileDataset(schema, options.metadata, options.rowCount, options.filePath);
    }

    async openBatches(options: DatasetOpenOptions = {}): Promise<DatasetBatchReader> {
        if (options.signal?.aborted) {
            throw abortError();
        }

        const stream = createReadStream(this.filePath);
        const reader = await RecordBatchReader.from(stream);
        await reader.open();
        let closed = false;
        const batchSize = options.batchSize && options.batchSize > 0 ? Math.floor(options.batchSize) : null;
        const onAbort = () => void close();

        const close = async () => {
            if (closed) return;
            closed = true;
            options.signal?.removeEventListener('abort', onAbort);
            await Promise.resolve(reader.cancel()).catch(() => undefined);
            stream.destroy();
        };

        options.signal?.addEventListener('abort', onAbort, { once: true });

        return {
            async *[Symbol.asyncIterator]() {
                try {
                    for await (const batch of reader) {
                        if (options.signal?.aborted) throw abortError();
                        if (!batchSize || batch.numRows <= batchSize) {
                            yield batch;
                            continue;
                        }
                        for (let offset = 0; offset < batch.numRows; offset += batchSize) {
                            if (options.signal?.aborted) throw abortError();
                            yield batch.slice(offset, Math.min(batch.numRows, offset + batchSize));
                        }
                    }
                } finally {
                    await close();
                }
            },
            close,
        };
    }
}

function abortError() {
    return new DOMException('The dataset read was canceled', 'AbortError');
}

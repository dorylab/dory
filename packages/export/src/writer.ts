import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { writeDataStreamToArrowIpcFile, type DataStream } from '@dory/data-plane';
import pl from 'nodejs-polars';

import type { ExportFormat, ExportProgress, ExportWriter, ExportWriteResult } from './types';

const CONTENT_TYPES: Record<ExportFormat, string> = {
    csv: 'text/csv; charset=utf-8',
    parquet: 'application/vnd.apache.parquet',
    arrow: 'application/vnd.apache.arrow.file',
};

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException('The export was canceled', 'AbortError');
}

function observedStream(stream: DataStream, signal?: AbortSignal, onProgress?: (progress: ExportProgress) => Promise<void> | void): DataStream {
    return {
        schema: stream.schema,
        rowCount: stream.rowCount,
        metadata: stream.metadata,
        close: () => stream.close(),
        batches: async function* () {
            let rows = 0;
            let batches = 0;
            for await (const batch of stream.batches()) {
                if (signal?.aborted) return;
                rows += batch.numRows;
                batches += 1;
                await onProgress?.({ phase: 'reading', rows, batches });
                if (signal?.aborted) return;
                yield batch;
            }
        },
    };
}

class ArrowExportWriter implements ExportWriter {
    readonly format = 'arrow' as const;

    async write(input: Parameters<ExportWriter['write']>[0]): Promise<ExportWriteResult> {
        try {
            throwIfAborted(input.signal);
            const result = await writeDataStreamToArrowIpcFile(observedStream(input.stream, input.signal, input.onProgress), input.outputPath);
            throwIfAborted(input.signal);
            return { format: this.format, rowCount: result.rowCount, batchCount: result.batchCount, byteSize: result.byteSize, contentType: CONTENT_TYPES[this.format] };
        } catch (error) {
            await rm(input.outputPath, { force: true }).catch(() => undefined);
            throwIfAborted(input.signal);
            throw error;
        }
    }
}

class PolarsExportWriter implements ExportWriter {
    constructor(readonly format: 'csv' | 'parquet') {}

    async write(input: Parameters<ExportWriter['write']>[0]): Promise<ExportWriteResult> {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dory-export-'));
        const arrowPath = path.join(tempDir, 'source.arrow');
        try {
            throwIfAborted(input.signal);
            const staged = await writeDataStreamToArrowIpcFile(observedStream(input.stream, input.signal, input.onProgress), arrowPath);
            throwIfAborted(input.signal);
            await input.onProgress?.({ phase: 'converting', rows: staged.rowCount, batches: staged.batchCount, bytes: staged.byteSize });
            const frame = pl.scanIPC(arrowPath, { rechunk: false });
            if (this.format === 'csv') {
                await frame
                    .sinkCSV(input.outputPath, {
                        includeBom: false,
                        includeHeader: true,
                        separator: ',',
                        quoteChar: '"',
                        lineTerminator: '\n',
                        nullValue: '',
                        quoteStyle: 'necessary',
                        maintainOrder: true,
                    })
                    .collect({ streaming: true });
            } else {
                await frame.sinkParquet(input.outputPath, { compression: 'zstd', maintainOrder: true }).collect({ streaming: true });
            }
            throwIfAborted(input.signal);
            return {
                format: this.format,
                rowCount: staged.rowCount,
                batchCount: staged.batchCount,
                byteSize: (await stat(input.outputPath)).size,
                contentType: CONTENT_TYPES[this.format],
            };
        } catch (error) {
            await rm(input.outputPath, { force: true }).catch(() => undefined);
            throwIfAborted(input.signal);
            throw error;
        } finally {
            await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
        }
    }
}

export function createExportWriter(format: ExportFormat): ExportWriter {
    if (format === 'arrow') return new ArrowExportWriter();
    return new PolarsExportWriter(format);
}

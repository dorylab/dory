import type { RecordBatch, Schema } from 'apache-arrow';

export type DatasetMetadata = {
    source: string;
    sourceHash?: string;
    artifactPath?: string;
    createdAt?: string;
    [key: string]: unknown;
};

export type DatasetOpenOptions = {
    batchSize?: number;
    signal?: AbortSignal;
};

export interface DatasetBatchReader extends AsyncIterable<RecordBatch> {
    close(): Promise<void>;
}

export interface Dataset {
    schema: Schema;
    metadata: DatasetMetadata;
    rowCount?: number;
    openBatches(options?: DatasetOpenOptions): Promise<DatasetBatchReader>;
}

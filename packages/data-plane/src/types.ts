import type { RecordBatch, Schema } from 'apache-arrow';

export const DEFAULT_DATA_STREAM_BATCH_ROWS = 10_000;
export const DEFAULT_DATA_STREAM_BATCH_BYTES = 32 * 1024 * 1024;

export type DataStreamMetadata = {
    source: string;
    sourceHash?: string;
    artifactPath?: string;
    createdAt?: string;
    [key: string]: unknown;
};

export type DataOpenOptions = {
    batchRows?: number;
    batchBytes?: number;
    signal?: AbortSignal;
};

export interface DataStream {
    readonly schema: Schema;
    readonly metadata: Readonly<DataStreamMetadata>;
    readonly rowCount?: number | null;
    batches(): AsyncIterable<RecordBatch>;
    close(): Promise<void>;
}

export interface DataSource {
    readonly schema: Schema;
    readonly metadata: Readonly<DataStreamMetadata>;
    readonly rowCount?: number | null;
    open(options?: DataOpenOptions): Promise<DataStream>;
}

export interface DataReader<Request> {
    open(request: Request, options?: DataOpenOptions): Promise<DataStream>;
}

export type DataColumn = {
    name: string;
    type?: string | null;
    nullable?: boolean;
    metadata?: Readonly<Record<string, string>>;
};

export type DataRows = Iterable<unknown> | AsyncIterable<unknown>;

export type SerializableDataColumn = {
    name: string;
    displayName: string;
    type: string;
    databaseType?: string;
    logicalType?: string;
    nullable: boolean;
};

export type SerializableDataPage = {
    columns: SerializableDataColumn[];
    rows: Array<Record<string, unknown>>;
    rowCount: number;
    truncated: boolean;
};

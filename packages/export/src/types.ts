import type { DataStream } from '@dory/data-plane';
import type { TablePreviewFilter, TablePreviewSort } from '@dory/drivers/types';

export type ExportFormat = 'csv' | 'parquet' | 'arrow';

export type TableExportPlanV1 = {
    version: 1;
    source: {
        kind: 'table';
        connectionId: string;
        database: string;
        table: string;
    };
    columns: string[];
    operations: {
        filters: TablePreviewFilter[];
        search: string | null;
        searchColumns: string[];
        sort: TablePreviewSort | null;
    };
    output: {
        format: ExportFormat;
    };
};

export type ExportPlan = TableExportPlanV1;

export type ExportProgress = {
    phase: 'reading' | 'converting';
    rows: number;
    batches: number;
    bytes?: number;
};

export type ExportWriteResult = {
    format: ExportFormat;
    rowCount: number;
    batchCount: number;
    byteSize: number;
    contentType: string;
};

export interface ExportWriter {
    readonly format: ExportFormat;
    write(input: { stream: DataStream; outputPath: string; signal?: AbortSignal; onProgress?: (progress: ExportProgress) => Promise<void> | void }): Promise<ExportWriteResult>;
}

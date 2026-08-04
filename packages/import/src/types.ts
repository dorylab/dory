import type { Dataset } from '@dory/dataset';

export const IMPORT_PLAN_VERSION = 'dory.import-plan.v1' as const;
export const DATASET_PROFILE_VERSION = 'dory.dataset-profile.v1' as const;
export const TRANSFORM_VERSION = 'dory.transform.v1' as const;
export const IMPORT_MANIFEST_VERSION = 'dory.import-manifest.v1' as const;
export const SOURCE_ROW_NUMBER_COLUMN = '__dory_source_row_number';

export type ImportRunStatus = 'draft' | 'uploading' | 'analyzing' | 'ready' | 'queued' | 'running' | 'completed' | 'failed' | 'canceled' | 'commit_unknown';
export type ImportWriteMode = 'append' | 'replace';
export type ImportTargetMode = 'create' | 'existing';
export type ImportColumnType = 'string' | 'boolean' | 'int64' | 'float64' | 'date' | 'datetime';
export type CsvEncoding = 'utf8' | 'utf16le' | 'utf16be' | 'gb18030' | 'big5' | 'shift_jis' | 'windows1252';

export type CsvParsingOptions = {
    delimiter: ',' | '\t' | ';' | '|';
    hasHeader: boolean;
    encoding: CsvEncoding;
    quoteChar: string;
};

export type CsvDetectionResult = {
    options: CsvParsingOptions;
    confidence: number;
    requiresEncodingSelection: boolean;
    supportedEncodings: CsvEncoding[];
};

export type DatasetProfileColumnV1 = {
    name: string;
    detectedType: ImportColumnType;
    nullCount: number;
    nullRate: number;
    sampleValues: string[];
};

export type DatasetProfileV1 = {
    version: typeof DATASET_PROFILE_VERSION;
    rows: number;
    columns: DatasetProfileColumnV1[];
    preview: Array<Record<string, unknown>>;
};

export type ImportTarget = {
    mode: ImportTargetMode;
    database?: string;
    schema?: string;
    table: string;
};

export type ImportColumnMappingV1 = {
    source: string;
    target: string;
    targetType: ImportColumnType;
    ignored: boolean;
    order: number;
};

export type TransformPlanV1 = {
    version: typeof TRANSFORM_VERSION;
    operations: Array<{ kind: 'rename'; source: string; target: string } | { kind: 'cast'; column: string; targetType: ImportColumnType } | { kind: 'ignore'; column: string }>;
};

export type ImportPlanV1 = {
    version: typeof IMPORT_PLAN_VERSION;
    parsing: CsvParsingOptions;
    target: ImportTarget;
    columns: ImportColumnMappingV1[];
    mode: ImportWriteMode;
    batchSize: number;
    transform: TransformPlanV1;
    sourceSchemaHash: string;
};

export type TargetColumn = {
    name: string;
    databaseType: string;
    importType: ImportColumnType;
    nullable: boolean;
    hasDefault: boolean;
};

export type TargetSchema = {
    exists: boolean;
    columns: TargetColumn[];
};

export type WriteProgress = {
    phase: 'preparing' | 'writing' | 'committing';
    batches: number;
    rowsWritten: number;
    pendingCommit: boolean;
};

export type WriteResult = {
    insertedRows: number;
    batches: number;
};

export interface DataWriter {
    readonly dialect: 'postgres' | 'sqlite';
    readonly allowedTypes: ReadonlyArray<ImportColumnType>;
    inspectTarget(target: ImportTarget): Promise<TargetSchema>;
    previewCreateTable(plan: ImportPlanV1): Promise<string>;
    write(input: { dataset: Dataset; plan: ImportPlanV1; batchSize: number; signal: AbortSignal; onProgress(event: WriteProgress): void | Promise<void> }): Promise<WriteResult>;
}

export class CommitUnknownError extends Error {
    constructor(message = 'The connection was lost while committing the import') {
        super(message);
        this.name = 'CommitUnknownError';
    }
}

export type CsvAnalysisResult = {
    dataset: Dataset;
    profile: DatasetProfileV1;
    parsing: CsvParsingOptions;
    sourceArrowPath: string;
};

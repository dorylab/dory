import type { Dataset } from '@dory/dataset';

export const IMPORT_PLAN_VERSION = 'dory.import-plan.v2' as const;
export const DATASET_PROFILE_VERSION = 'dory.dataset-profile.v2' as const;
export const TRANSFORM_VERSION = 'dory.transform.v1' as const;
export const TRANSFORM_PREVIEW_VERSION = 'dory.transform-preview.v1' as const;
export const IMPORT_MANIFEST_VERSION = 'dory.import-manifest.v2' as const;
export const SOURCE_ROW_NUMBER_COLUMN = '__dory_source_row_number';

export type ImportRunStatus = 'draft' | 'uploading' | 'analyzing' | 'ready' | 'queued' | 'running' | 'completed' | 'failed' | 'canceled' | 'commit_unknown';
export type ImportWriteMode = 'append' | 'replace';
export type ImportTargetMode = 'create' | 'existing';
export type ImportColumnType = 'string' | 'boolean' | 'int64' | 'float64' | 'date' | 'datetime';
export type ImportWriterDialect = 'clickhouse' | 'duckdb' | 'mysql' | 'oracle' | 'postgres' | 'snowflake' | 'sqlite' | 'sqlserver';
export type ImportAtomicity = 'atomic' | 'best-effort';
export type ImportWriteOperation = 'create' | 'append' | 'replace';
export type ImportCapabilityReason = 'batch_commits' | 'ddl_not_transactional' | 'replace_not_atomic' | 'target_non_transactional';
export type ImportWriteCapability =
    | { supported: true; atomicity: ImportAtomicity; reason?: Exclude<ImportCapabilityReason, 'replace_not_atomic'> }
    | { supported: false; reason: ImportCapabilityReason };
export type ImportWriteCapabilities = Record<ImportWriteOperation, ImportWriteCapability>;
export type CsvEncoding = 'utf8' | 'utf16le' | 'utf16be' | 'gb18030' | 'big5' | 'shift_jis' | 'windows1252';

export type CsvParsingOptions = {
    delimiter: ',' | '\t' | ';' | '|';
    hasHeader: boolean;
    encoding: CsvEncoding;
    quoteChar: string;
};

export type ImportSourceFormat = 'csv' | 'parquet' | 'ndjson' | 'arrow';
export type CsvImportSourceOptions = CsvParsingOptions & { format: 'csv' };
export type ImportSourceOptions = CsvImportSourceOptions | { format: 'parquet' } | { format: 'ndjson' } | { format: 'arrow' };
export type ImportSourceWarningCode = 'DECIMAL_STRINGIFIED';
export type ImportSourceWarning = {
    code: ImportSourceWarningCode;
    column: string;
    sourceType: string;
};
export type ImportSourceColumnSchema = {
    name: string;
    sourceType: string;
    importType: ImportColumnType;
};

export type CsvDetectionResult = {
    options: CsvParsingOptions;
    confidence: number;
    requiresEncodingSelection: boolean;
    supportedEncodings: CsvEncoding[];
};

export type DatasetProfileTypeCandidateV2 = {
    type: Exclude<ImportColumnType, 'string'>;
    validCount: number;
    invalidCount: number;
    validRate: number;
};

export type DatasetProfileTopValueV2 = {
    value: string;
    count: number;
    rate: number;
};

export type DatasetQualityIssueCodeV2 = 'all_missing' | 'empty_string' | 'surrounding_whitespace' | 'leading_zero' | 'mixed_type';

export type DatasetQualityIssueV2 = {
    code: DatasetQualityIssueCodeV2;
    severity: 'info' | 'warning';
    affectedCount: number;
    affectedRate: number;
    examples: Array<{ sourceRow: number; value: string }>;
    suggestedOperation?: Extract<TransformOperationV1, { kind: 'trim' | 'emptyToNull' }>;
};

export type DatasetProfileColumnV2 = {
    name: string;
    detectedType: ImportColumnType;
    nullCount: number;
    nullRate: number;
    nonNullCount: number;
    emptyCount: number;
    emptyRate: number;
    whitespaceCount: number;
    whitespaceRate: number;
    leadingZeroCount: number;
    minLength: number | null;
    maxLength: number | null;
    averageLength: number | null;
    min: string | number | null;
    max: string | number | null;
    mean: number | null;
    candidates: DatasetProfileTypeCandidateV2[];
    sampleValues: string[];
    sample: {
        basis: 'sample';
        rows: number;
        distinctCount: number;
        distinctRate: number;
        topValues: DatasetProfileTopValueV2[];
        quantiles: { p25: number; p50: number; p75: number } | null;
    };
    issues: DatasetQualityIssueV2[];
};

export type DatasetProfileV2 = {
    version: typeof DATASET_PROFILE_VERSION;
    rows: number;
    sampleRows: number;
    columns: DatasetProfileColumnV2[];
    preview: Array<Record<string, unknown>>;
    quality: {
        totalIssues: number;
        warningCount: number;
        infoCount: number;
        columnsWithIssues: number;
    };
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

export type TransformOperationV1 =
    | { kind: 'trim'; column: string }
    | { kind: 'lowercase'; column: string }
    | { kind: 'replace'; column: string; find: string; replacement: string }
    | { kind: 'emptyToNull'; column: string }
    | { kind: 'dropInvalid'; column: string; targetType: Exclude<ImportColumnType, 'string'>; dropNulls: boolean }
    | { kind: 'rename'; source: string; target: string }
    | { kind: 'cast'; column: string; targetType: ImportColumnType }
    | { kind: 'ignore'; column: string };

export type TransformPlanV1 = {
    version: typeof TRANSFORM_VERSION;
    operations: TransformOperationV1[];
};

export type ImportExecutionPlan = {
    target: ImportTarget;
    columns: ImportColumnMappingV1[];
    mode: ImportWriteMode;
    batchSize: number;
    transform: TransformPlanV1;
    sourceSchemaHash: string;
};

export type ImportPlan = ImportExecutionPlan & {
    version: typeof IMPORT_PLAN_VERSION;
    source: ImportSourceOptions;
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
    writeCapabilities: ImportWriteCapabilities;
};

export type WriteProgress = {
    phase: 'preparing' | 'writing' | 'committing';
    batches: number;
    rowsWritten: number;
    rowsCommitted: number;
    pendingCommit: boolean;
};

export type WriteResult = {
    insertedRows: number;
    batches: number;
    atomicity: ImportAtomicity;
};

export interface DataWriter {
    readonly dialect: ImportWriterDialect;
    readonly allowedTypes: ReadonlyArray<ImportColumnType>;
    inspectTarget(target: ImportTarget): Promise<TargetSchema>;
    previewCreateTable(plan: ImportExecutionPlan): Promise<string>;
    write(input: {
        dataset: Dataset;
        plan: ImportExecutionPlan;
        batchSize: number;
        signal: AbortSignal;
        onProgress(event: WriteProgress): void | Promise<void>;
    }): Promise<WriteResult>;
}

export class CommitUnknownError extends Error {
    constructor(message = 'The connection was lost while committing the import') {
        super(message);
        this.name = 'CommitUnknownError';
    }
}

export class PartialWriteError extends Error {
    constructor(
        message: string,
        readonly committedRows: number,
        readonly batches: number,
        readonly targetMayBeChanged = true,
    ) {
        super(message);
        this.name = 'PartialWriteError';
    }
}

export type CsvAnalysisResult = {
    dataset: Dataset;
    profile: DatasetProfileV2;
    parsing: CsvParsingOptions;
    sourceArrowPath: string;
};

export type ImportSourceAnalysisResult = {
    dataset: Dataset;
    profile: DatasetProfileV2;
    source: ImportSourceOptions;
    sourceWarnings: ImportSourceWarning[];
    sourceSchema: ImportSourceColumnSchema[];
    sourceArrowPath: string;
};

export type TransformPreviewRowV1 = {
    sourceRow: number;
    before: Record<string, string | null>;
    after: Record<string, string | null>;
    outcome: 'kept' | 'dropped';
    errors: Array<{ column: string; code: 'invalid_type' | 'required_null'; targetType: ImportColumnType }>;
};

export type TransformPreviewV1 = {
    version: typeof TRANSFORM_PREVIEW_VERSION;
    transformHash: string;
    inputRows: number;
    keptRows: number;
    droppedRows: number;
    rows: TransformPreviewRowV1[];
};

export type PrepareImportDatasetResult = {
    dataset: Dataset;
    inputRows: number;
    outputRows: number;
    filteredRows: number;
};

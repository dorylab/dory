export interface SuggestionItem {
    label: string;
    insertText: string;
    detail?: string;
}

export type FieldDef = {
    name: string;
    type: string;
    nullable?: boolean;
    precision?: number;
    scale?: number;
};

export type ResultRow = {
    rowData: Record<string, any>;
};

export type SQLExecError = {
    message: string;
    code?: string | number;
    detail?: any;
    hint?: string;
};

export type ResultMeta = {
    setIndex: number;

    sql: string;

    refId: string;

    sessionId: string;

    startedAt?: number | null | undefined; // epoch ms
    finishedAt?: number | null | undefined;
    durationMs?: number | null | undefined;

    limitApplied?: boolean;
    limitValue?: number;

    fromCache?: boolean;
    source?: string;
    scannedRows?: number;
    scannedBytes?: number;

    errorMessage?: string;
    error?: SQLExecError;
};

export type QueryResult = {
    fields: FieldDef[];
    results: ResultRow[];
    rowCount: number;

    affectedRows?: number;


    error?: SQLExecError;

    meta?: ResultMeta;
};

export type StatementStatus = 'running' | 'success' | 'error';

export type StatementRecord = {
    id: string;
    setIndex: number;
    sql: string;
    status: StatementStatus;
    startedAt?: number;
    finishedAt?: number;
    durationMs?: number;

    rowsReturned?: number;
    rowsAffected?: number;

    limitValue?: number;

    error?: SQLExecError;
};

export type SessionStatus = 'running' | 'success' | 'error' | 'canceled';

export type SessionDetail = {
    id: string;
    status: SessionStatus;
    startedAt?: number;
    finishedAt?: number;
    durationMs?: number;

    source?: string;
    fromCache?: boolean;
    scannedRows?: number;
    scannedBytes?: number;

    statements: StatementRecord[];
};

export type MetaState = {
    truncated?: boolean;
    durationMs?: number;
    startedAt?: Date;
    finishedAt?: Date;
    fromCache?: boolean;
    scannedRows?: number;
    scannedBytes?: number;
    source?: string;
    syncing?: boolean;

    rowsReturned?: number;
    rowsAffected?: number;
    limitApplied?: boolean;
    limitValue?: number;
    errorMessage?: string;
};
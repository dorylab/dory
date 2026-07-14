import type { AIResultContextPayload, ResultColumnMeta, ResultSetStatsV1, ResultSetViewState } from './result-set-ai';

export type ResultSetRemoteSort = {
    column: string;
    direction: 'asc' | 'desc';
};

export type ResultSetRemoteFilter = {
    col: string;
    kind: 'string' | 'number' | 'range';
    op: string;
    value?: string;
    valueTo?: string;
    rangeValueType?: 'number' | 'date';
    label?: string;
    caseSensitive?: boolean;
};

export type ResultSetRemoteSearch = {
    text: string;
    columns?: string[];
};

export type ResultSetMeta = {
    sessionId: string;
    setIndex: number;
    sqlText: string;
    sqlOp: string | null;
    title: string | null;
    columns: ResultColumnMeta[] | null;
    stats: ResultSetStatsV1 | null;
    viewState: ResultSetViewState | null;
    aiProfileVersion: number;
    rowCount: number | null;
    limited: boolean;
    limit: number | null;
    resultSetId: string | null;
    dataAvailability: string | null;
    previewRowCount: number | null;
    affectedRows: number | null;
    status: 'success' | 'error' | 'running';
    errorMessage: string | null;
    errorCode: string | null;
    errorSqlState: string | null;
    errorMeta: unknown | null;
    warnings: unknown | null;
    startedAt?: number | null;
    finishedAt?: number | null;
    durationMs: number | null;
};

export type { AIResultContextPayload, ResultColumnMeta, ResultSetStatsV1, ResultSetViewState };

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { executeActionClient, type ExecuteActionClientOptions } from '@/lib/actions/client';

import type { ResultSetMeta, ResultSetRemoteFilter, ResultSetRemoteSearch, ResultSetRemoteSort, ResultSetStatsV1, ResultSetViewState } from './type';
import { normalizeSqlConsoleResultSnapshot, type SqlConsoleResultSnapshot, type SqlConsoleResultUpdatePayload } from './sql-console-result-snapshot';

export const SQL_CONSOLE_RESULT_DATA_UPDATED_EVENT = 'sql-console-result-data-updated';

export function notifySqlConsoleResultDataUpdated(payload?: SqlConsoleResultUpdatePayload | null) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(SQL_CONSOLE_RESULT_DATA_UPDATED_EVENT, { detail: payload ?? null }));
}

type ReadRowsInput = {
    resultSetId: string;
    offset?: number;
    limit?: number;
    sorts?: ResultSetRemoteSort[];
    filters?: ResultSetRemoteFilter[];
    search?: ResultSetRemoteSearch | null;
    signal?: AbortSignal;
};
type ReadRowsOutput = {
    resultSetId: string;
    rows: Record<string, unknown>[];
    offset: number;
    limit: number;
    rowCount: number | null;
    unfilteredRowCount?: number | null;
    columns: unknown[];
    dataAvailability: string;
};
type ExportInput = {
    resultSetId: string;
    format: 'csv' | 'parquet';
    sorts?: ResultSetRemoteSort[];
    filters?: ResultSetRemoteFilter[];
    search?: ResultSetRemoteSearch | null;
};
type ExportOutput = {
    exportId: string;
    format: 'csv' | 'parquet';
    fileName: string;
    byteSize?: number;
    downloadUrl: string;
};
type ChartInput = {
    resultSetId: string;
    xKey: string;
    yKey: string;
    groupKey?: string | null;
    chartType?: string | null;
    filters?: ResultSetRemoteFilter[];
    search?: ResultSetRemoteSearch | null;
};
type ChartOutput = {
    data: Array<Record<string, unknown>>;
    series: Array<{ key: string; label: string }>;
    bucketHint?: string | null;
};
type ProfileOutput = {
    columns: unknown[];
    stats: ResultSetStatsV1;
    sampleRows: Array<Record<string, unknown>>;
};

type QuerySessionActionOutput = {
    sessionId: string;
    status: string;
    errorMessage: string | null;
    startedAt: string | Date | null;
    finishedAt: string | Date | null;
    durationMs: number | null;
    resultSetCount: number;
    source: string | null;
} | null;

type QueryResultSetsListOutput = {
    resultSets: Array<
        Omit<ResultSetMeta, 'columns' | 'stats' | 'viewState' | 'aiProfileVersion' | 'resultSetId' | 'dataAvailability'> & {
            columns: unknown[] | null;
            stats: ResultSetStatsV1 | null;
            viewState: ResultSetViewState | null;
            aiProfileVersion: number | null;
            resultSetId: string;
            dataAvailability: string;
        }
    >;
};

function asDate(value: string | Date | null | undefined) {
    if (!value) return null;
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function actionOptions(signal?: AbortSignal): ExecuteActionClientOptions | undefined {
    return signal ? { signal } : undefined;
}

export function useSqlConsoleResultStore() {
    const [dataVersion, setDataVersion] = useState(0);
    const [snapshotsBySession, setSnapshotsBySession] = useState<Record<string, SqlConsoleResultSnapshot>>({});

    useEffect(() => {
        const bump = (event: Event) => {
            const snapshot = normalizeSqlConsoleResultSnapshot(event instanceof CustomEvent ? (event.detail as SqlConsoleResultUpdatePayload | null) : null);
            if (snapshot) {
                setSnapshotsBySession(previous => ({
                    ...previous,
                    [snapshot.session.sessionId]: snapshot,
                }));
            }
            setDataVersion(version => version + 1);
        };
        window.addEventListener(SQL_CONSOLE_RESULT_DATA_UPDATED_EVENT, bump);
        return () => window.removeEventListener(SQL_CONSOLE_RESULT_DATA_UPDATED_EVENT, bump);
    }, []);

    const getSession = useCallback(
        async (sessionId: string) => {
            const fallback = snapshotsBySession[sessionId]?.session ?? null;
            if (fallback) return fallback;

            const session = await executeActionClient<QuerySessionActionOutput>('query.session.get', { sessionId });
            if (!session) return null;
            return {
                ...session,
                startedAt: asDate(session.startedAt),
                finishedAt: asDate(session.finishedAt),
            };
        },
        [snapshotsBySession],
    );

    const listResultSetsMeta = useCallback(
        async (sessionId: string): Promise<ResultSetMeta[]> => {
            const fallback = snapshotsBySession[sessionId]?.resultSets ?? [];
            if (fallback.length > 0) return fallback;

            const output = await executeActionClient<QueryResultSetsListOutput>('query.resultSets.list', { sessionId });
            return output.resultSets.map(meta => ({
                ...meta,
                columns: (meta.columns ?? []) as ResultSetMeta['columns'],
                stats: meta.stats ?? null,
                viewState: meta.viewState ?? null,
                aiProfileVersion: meta.aiProfileVersion ?? 0,
                resultSetId: meta.resultSetId,
                dataAvailability: meta.dataAvailability,
            }));
        },
        [snapshotsBySession],
    );

    const listResultSetIndices = useCallback(
        async (sessionId: string) => {
            const resultSets = await listResultSetsMeta(sessionId);
            return resultSets.map(meta => meta.setIndex);
        },
        [listResultSetsMeta],
    );

    const updateResultSetViewState = useCallback(async (sessionId: string, setIndex: number, viewState: ResultSetViewState | null) => {
        await executeActionClient('query.resultSet.viewState.update', { sessionId, setIndex, viewState });
    }, []);

    const readResultSetRows = useCallback((params: ReadRowsInput) => {
        const { signal, ...input } = params;
        return executeActionClient<ReadRowsOutput>('resultSet.rows.read', input, actionOptions(signal));
    }, []);

    const exportResultSet = useCallback((params: ExportInput) => {
        return executeActionClient<ExportOutput>('resultSet.export.create', params);
    }, []);

    const readResultSetChart = useCallback((params: ChartInput) => {
        return executeActionClient<ChartOutput>('resultSet.chart.read', params);
    }, []);

    const readResultSetProfile = useCallback((params: { resultSetId: string; sampleRows?: number; signal?: AbortSignal }) => {
        const { signal, ...input } = params;
        return executeActionClient<ProfileOutput>('resultSet.profile.read', input, actionOptions(signal));
    }, []);

    const clearResults = useCallback(async () => {
        notifySqlConsoleResultDataUpdated();
    }, []);

    return useMemo(
        () => ({
            dbReady: true,
            dataVersion,
            getSession,
            listResultSetIndices,
            listResultSetsMeta,
            updateResultSetViewState,
            readResultSetRows,
            exportResultSet,
            readResultSetChart,
            readResultSetProfile,
            clearResults,
        }),
        [
            clearResults,
            dataVersion,
            exportResultSet,
            getSession,
            listResultSetIndices,
            listResultSetsMeta,
            readResultSetChart,
            readResultSetProfile,
            readResultSetRows,
            updateResultSetViewState,
        ],
    );
}

export type { ResultSetRemoteFilter, ResultSetRemoteSearch, ResultSetRemoteSort };

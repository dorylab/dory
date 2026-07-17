import type { ResultSetMeta } from './type';

export type SqlConsoleResultUpdatePayload = {
    session?: unknown;
    queryResultSets?: unknown;
    results?: unknown;
};

export type SqlConsoleSessionSnapshot = {
    sessionId: string;
    status: 'running' | 'success' | 'error' | 'canceled';
    errorMessage: string | null;
    startedAt: number | null;
    finishedAt: number | null;
    durationMs: number | null;
    resultSetCount: number;
    source: string | null;
};

export type SqlConsoleResultSnapshot = {
    session: SqlConsoleSessionSnapshot;
    resultSets: ResultSetMeta[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value ? value : null;
}

function asNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asTimestamp(value: unknown): number | null {
    const numeric = asNumber(value);
    if (numeric !== null) return numeric;
    if (typeof value !== 'string') return null;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
}

function asSessionStatus(value: unknown): SqlConsoleSessionSnapshot['status'] {
    return value === 'running' || value === 'error' || value === 'canceled' ? value : 'success';
}

function asResultStatus(value: unknown): ResultSetMeta['status'] {
    return value === 'running' || value === 'error' ? value : 'success';
}

export function normalizeSqlConsoleResultSnapshot(payload: SqlConsoleResultUpdatePayload | null | undefined): SqlConsoleResultSnapshot | null {
    const session = asRecord(payload?.session);
    const sessionId = asString(session?.sessionId);
    if (!session || !sessionId || !Array.isArray(payload?.queryResultSets)) return null;

    const payloadResults = Array.isArray(payload.results) ? payload.results : [];
    const resultSets = payload.queryResultSets.flatMap<ResultSetMeta>((value, resultIndex) => {
        const resultSet = asRecord(value);
        const resultSetId = asString(resultSet?.resultSetId);
        const resultSetSessionId = asString(resultSet?.sessionId) ?? sessionId;
        const setIndex = asNumber(resultSet?.setIndex);
        if (!resultSet || !resultSetId || resultSetSessionId !== sessionId || setIndex === null || setIndex < 0 || !Number.isInteger(setIndex)) {
            return [];
        }

        return [
            {
                sessionId,
                setIndex,
                sqlText: asString(resultSet.sqlText) ?? '',
                sqlOp: asString(resultSet.sqlOp),
                title: asString(resultSet.title),
                columns: Array.isArray(resultSet.columns) ? (resultSet.columns as ResultSetMeta['columns']) : [],
                stats: null,
                viewState: null,
                aiProfileVersion: 0,
                rowCount: asNumber(resultSet.rowCount),
                limited: resultSet.limited === true,
                limit: asNumber(resultSet.limit),
                resultSetId,
                dataAvailability: asString(resultSet.dataAvailability),
                previewRowCount: asNumber(resultSet.previewRowCount),
                previewRows: Array.isArray(payloadResults[resultIndex])
                    ? payloadResults[resultIndex].flatMap(row => {
                          const normalized = asRecord(row);
                          return normalized ? [normalized] : [];
                      })
                    : [],
                affectedRows: asNumber(resultSet.affectedRows),
                status: asResultStatus(resultSet.status),
                errorMessage: asString(resultSet.errorMessage),
                errorCode: asString(resultSet.errorCode),
                errorSqlState: asString(resultSet.errorSqlState),
                errorMeta: resultSet.errorMeta ?? null,
                warnings: resultSet.warnings ?? null,
                startedAt: asTimestamp(resultSet.startedAt),
                finishedAt: asTimestamp(resultSet.finishedAt),
                durationMs: asNumber(resultSet.durationMs),
                byteSize: asNumber(resultSet.byteSize),
                artifactStore: asString(resultSet.artifactStore),
                storageFormat: resultSet.storageFormat === 'parquet' || resultSet.storageFormat === 'json' ? resultSet.storageFormat : null,
                sourceConnectionType: asString(resultSet.sourceConnectionType),
                sourceDatabaseName: asString(resultSet.sourceDatabaseName),
                createdAt: asTimestamp(resultSet.createdAt),
                expiresAt: asTimestamp(resultSet.expiresAt),
            },
        ];
    });

    if (resultSets.length === 0) return null;

    return {
        session: {
            sessionId,
            status: asSessionStatus(session.status),
            errorMessage: asString(session.errorMessage),
            startedAt: asTimestamp(session.startedAt),
            finishedAt: asTimestamp(session.finishedAt),
            durationMs: asNumber(session.durationMs),
            resultSetCount: asNumber(session.resultSetCount) ?? resultSets.length,
            source: asString(session.source),
        },
        resultSets,
    };
}

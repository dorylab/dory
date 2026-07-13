import type { DBHook } from '@/lib/client/type';
import type { SavedQueryItem } from './components/saved-queries/saved-queries-sidebar';

type ApplyServerResultPayload = Parameters<DBHook['applyServerResult']>[0];

export function isQueryHistoryResultRestorable(item: Pick<SavedQueryItem, 'historyResultSet'>) {
    const resultSet = item.historyResultSet;
    return Boolean(resultSet?.resultSetId && resultSet.sessionId && typeof resultSet.setIndex === 'number' && resultSet.dataAvailability === 'full');
}

export function buildQueryHistoryResultRestorePayload(params: {
    item: SavedQueryItem;
    tabId: string;
    connectionId?: string | null;
    userId?: string | null;
}): ApplyServerResultPayload | null {
    const resultSet = params.item.historyResultSet;
    if (!isQueryHistoryResultRestorable(params.item) || !resultSet) {
        return null;
    }

    const sqlText = params.item.sqlText ?? '';
    const createdAt = params.item.createdAt ?? null;
    const finishedAt = params.item.updatedAt ?? params.item.createdAt ?? null;
    const resultStatus: 'success' | 'error' = resultSet.status === 'error' ? 'error' : 'success';
    const queryResultSet = {
        sessionId: resultSet.sessionId,
        setIndex: resultSet.setIndex,
        sqlText,
        sqlOp: null,
        title: params.item.title,
        columns: resultSet.columns,
        stats: null,
        viewState: null,
        aiProfileVersion: null,
        rowCount: resultSet.rowCount,
        limited: resultSet.limited,
        limit: resultSet.limit,
        resultSetId: resultSet.resultSetId,
        dataAvailability: resultSet.dataAvailability,
        previewRowCount: resultSet.previewRowCount,
        affectedRows: null,
        status: resultStatus,
        errorMessage: null,
        errorCode: null,
        errorSqlState: null,
        errorMeta: null,
        warnings: null,
        startedAt: createdAt,
        finishedAt,
        durationMs: resultSet.durationMs,
    };

    return {
        session: {
            sessionId: resultSet.sessionId,
            userId: params.userId ?? params.item.userId ?? null,
            tabId: params.tabId,
            connectionId: params.item.connectionId ?? params.connectionId ?? null,
            database: null,
            sqlText,
            status: resultSet.status === 'error' || resultSet.status === 'canceled' ? resultSet.status : 'success',
            errorMessage: null,
            startedAt: createdAt,
            finishedAt,
            durationMs: resultSet.durationMs,
            resultSetCount: 1,
            stopOnError: false,
            source: 'query-history',
        },
        queryResultSets: [queryResultSet],
        results: [[]],
    };
}

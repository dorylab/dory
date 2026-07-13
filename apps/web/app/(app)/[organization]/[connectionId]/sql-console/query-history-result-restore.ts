import type { SavedQueryItem } from './components/saved-queries/saved-queries-sidebar';

export function isQueryHistoryResultRestorable(item: Pick<SavedQueryItem, 'historyResultSet'>) {
    const resultSet = item.historyResultSet;
    return Boolean(resultSet?.resultSetId && resultSet.sessionId && typeof resultSet.setIndex === 'number' && resultSet.dataAvailability === 'full');
}

export function getQueryHistoryRestorableSessionId(item: Pick<SavedQueryItem, 'historyResultSet'>) {
    return isQueryHistoryResultRestorable(item) ? (item.historyResultSet?.sessionId ?? null) : null;
}

function historyRestoreSourceKey(tabId: string) {
    return `sql-console:query-history-source:${tabId}`;
}

export function markQueryHistoryRestoredSession(tabId: string, sessionId: string) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(historyRestoreSourceKey(tabId), sessionId);
}

export function clearQueryHistoryRestoredSession(tabId: string) {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(historyRestoreSourceKey(tabId));
}

export function isQueryHistoryRestoredSession(tabId: string, sessionId?: string | null) {
    if (typeof window === 'undefined' || !sessionId) return false;
    return localStorage.getItem(historyRestoreSourceKey(tabId)) === sessionId;
}

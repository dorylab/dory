'use client';

import { useCallback, useMemo, useRef } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { executeActionClient } from '@/lib/actions/client';
import { notifySqlConsoleResultDataUpdated } from '@/lib/client/sql-console-result-store';
import { runSqlQueryStream, type QueryExecutePayload } from '@/lib/client/sql-console-query-stream';
import { fetchTablePreview } from '../../../components/table-browser/lib/fetch-table-preview';
import { SQLTab } from '@dory/shared/types/tabs';
import { QUERY_HISTORY_UPDATED_EVENT, runningTabsAtom, sessionIdByTabAtom } from '../sql-console.store';
import { SQLEditorHandle } from '../components/sql-editor';
import { useTranslations } from 'next-intl';
import { columnsCacheAtom, currentConnectionAtom, schemaMetadataRefreshAtom } from '@/shared/stores/app.store';
import { getSessionStorageKey, normalizeSqlWorkspaceScope, type SqlWorkspaceScope } from '../workspace-scope';
import { clearQueryHistoryRestoredSession } from '../query-history-result-restore';

type RequestAITabTitle = (tab: SQLTab, options?: { force?: boolean; sqlTextOverride?: string }) => Promise<void> | void;
type QueryResultSetSummary = {
    sqlOp?: unknown;
    status?: unknown;
};

function genSessionId() {
    const randomUUID = globalThis.crypto?.randomUUID;
    return typeof randomUUID === 'function' ? randomUUID.call(globalThis.crypto) : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function hasSuccessfulSchemaChange(payload: unknown) {
    const queryResultSets = payload && typeof payload === 'object' && 'queryResultSets' in payload ? (payload as { queryResultSets?: unknown }).queryResultSets : null;
    const resultSets = Array.isArray(queryResultSets) ? (queryResultSets as QueryResultSetSummary[]) : [];
    return resultSets.some(resultSet => resultSet?.status === 'success' && resultSet?.sqlOp === 'DDL');
}

function isQueryExecutePayload(value: unknown): value is QueryExecutePayload {
    if (!value || typeof value !== 'object') return false;
    const payload = value as Partial<QueryExecutePayload>;
    return Boolean(payload.session && typeof payload.session === 'object' && Array.isArray(payload.queryResultSets) && Array.isArray(payload.results));
}

function notifyQueryHistoryUpdated(connectionId?: string | null) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(QUERY_HISTORY_UPDATED_EVENT, { detail: { connectionId: connectionId ?? null } }));
}

export function useSqlQueryRunner({
    activeDatabase,
    tabs,
    userId,
    requestAITabTitle,
    workspaceScope,
}: {
    activeDatabase: string | null | undefined;
    tabs: SQLTab[];
    userId: string | undefined;
    requestAITabTitle: RequestAITabTitle;
    workspaceScope?: SqlWorkspaceScope;
}) {
    const userReady = !!userId;
    const t = useTranslations('SqlConsole');
    const currentConnection = useAtomValue(currentConnectionAtom);
    const setSchemaMetadataRefresh = useSetAtom(schemaMetadataRefreshAtom);
    const setColumnsCache = useSetAtom(columnsCacheAtom);
    const normalizedWorkspaceScope = useMemo(() => normalizeSqlWorkspaceScope(workspaceScope), [workspaceScope]);

    const editorRef = useRef<SQLEditorHandle | null>(null);
    const abortControllersRef = useRef<Record<string, AbortController | undefined>>({});
    const [sessionIdMap, setSessionIdMap] = useAtom(sessionIdByTabAtom);
    const [runningTabs, setRunningTabs] = useAtom(runningTabsAtom);

    const runQuery = useCallback(
        async (tab: SQLTab, options?: { sqlOverride?: string; databaseOverride?: string | null; limit?: number | null }) => {
            if (!tab || !userReady) return;

            const tabId = tab.tabId;
            const sql = editorRef.current?.getValue(tabId) ?? (tab.tabType === 'sql' ? (tab.content ?? '') : '');
            const sqlText = (options?.sqlOverride ?? (tab.tabType === 'sql' ? (sql ?? '') : '')).trim();
            let database: string | null = null;

            if (options?.databaseOverride) {
                database = options.databaseOverride;
            } else if (tab.tabType === 'table' && tab.databaseName) {
                database = tab.databaseName;
            } else if (activeDatabase) {
                database = activeDatabase;
            }

            if (tab.tabType === 'sql' && !sqlText) return;
            if (tab.tabType === 'table' && (!database || !tab.tableName || !tab.connectionId)) return;
            const tableName = tab.tabType === 'table' ? tab.tableName : undefined;

            const stopOnError = false;
            const source = tab.tabType === 'table' ? 'data-preview' : 'sql-console';
            const queryConnectionId = tab.connectionId ?? currentConnection?.connection?.id ?? null;

            setRunningTabs(p => ({ ...p, [tabId]: 'running' }));
            const controller = new AbortController();
            abortControllersRef.current[tabId] = controller;

            const sessionId = genSessionId();
            setSessionIdMap(p => ({ ...p, [tabId]: sessionId }));
            try {
                localStorage.setItem(getSessionStorageKey(tabId, { ...normalizedWorkspaceScope, connectionId: queryConnectionId }), sessionId);
                clearQueryHistoryRestoredSession(tabId);
            } catch {
                // ignore
            }

            try {
                let payload: QueryExecutePayload | null = null;
                if (tab.tabType === 'table') {
                    const res = await fetchTablePreview({
                        connectionId: tab.connectionId,
                        databaseName: database as string,
                        tableName: tableName as string,
                        limit: tab.dataView?.limit,
                        sessionId,
                        tabId,
                        source,
                        signal: controller.signal,
                    });
                    payload = isQueryExecutePayload(res.data) ? res.data : null;
                    notifySqlConsoleResultDataUpdated(payload);
                } else {
                    await runSqlQueryStream({
                        input: {
                            sql: sqlText,
                            database,
                            limit: options?.limit,
                            stopOnError,
                            sessionId,
                            userId,
                            tabId,
                            source,
                            connectionId: queryConnectionId ?? undefined,
                        },
                        currentConnectionId: queryConnectionId,
                        signal: controller.signal,
                        onEvent: async event => {
                            if (event.type === 'error') {
                                throw Object.assign(new Error(event.payload.message), {
                                    code: event.payload.code,
                                });
                            }

                            if ('payload' in event && event.payload && 'session' in event.payload) {
                                payload = event.payload;
                                if (event.type === 'result-completed' || event.type === 'session-finished') {
                                    notifySqlConsoleResultDataUpdated(event.payload);
                                }
                            }
                        },
                    });
                }

                if (!payload || !payload.session) {
                    throw new Error(t('Errors.InvalidSessionData'));
                }
                const finalPayload = payload;

                if (tab.tabType === 'sql' && hasSuccessfulSchemaChange(finalPayload)) {
                    setSchemaMetadataRefresh(prev => ({
                        connectionId: queryConnectionId,
                        database,
                        version: prev.version + 1,
                    }));
                    setColumnsCache({});
                }

                const finalStatus =
                    finalPayload.session.status === 'error' || finalPayload.session.status === 'canceled' || finalPayload.session.status === 'success'
                        ? finalPayload.session.status
                        : 'success';

                setRunningTabs(p => ({
                    ...p,
                    [tabId]: finalStatus,
                }));
                notifyQueryHistoryUpdated(queryConnectionId);

                const latestTab = tabs.find(t => t.tabId === tabId);
                if (latestTab && latestTab.tabType === 'sql') {
                    void requestAITabTitle(latestTab, { sqlTextOverride: sqlText });
                }
            } catch (e: unknown) {
                console.error('[SQLConsoleClient.runQuery] error:', e);
                if (e instanceof Error && e.name === 'AbortError') {
                    setRunningTabs(p => ({ ...p, [tabId]: 'canceled' }));
                    notifyQueryHistoryUpdated(queryConnectionId);
                } else {
                    setRunningTabs(p => ({ ...p, [tabId]: 'error' }));
                    notifyQueryHistoryUpdated(queryConnectionId);
                }
            } finally {
                const stored = abortControllersRef.current[tabId];
                if (stored && stored === controller) {
                    delete abortControllersRef.current[tabId];
                }
            }
        },
        [
            userReady,
            activeDatabase,
            setRunningTabs,
            setSessionIdMap,
            setSchemaMetadataRefresh,
            setColumnsCache,
            userId,
            tabs,
            requestAITabTitle,
            t,
            currentConnection?.connection?.id,
            normalizedWorkspaceScope,
        ],
    );

    const cancelQuery = useCallback(
        (tab: SQLTab) => {
            if (!tab) return;
            const tabId = tab.tabId;

            const controller = abortControllersRef.current[tabId];
            if (controller) {
                controller.abort();
            }

            let sessionId = sessionIdMap[tabId];
            if (!sessionId) {
                try {
                    sessionId =
                        (localStorage.getItem(
                            getSessionStorageKey(tabId, { ...normalizedWorkspaceScope, connectionId: tab.connectionId ?? currentConnection?.connection?.id ?? null }),
                        ) as string) ?? undefined;
                } catch {
                    // ignore
                }
            }

            if (!sessionId) {
                return;
            }

            executeActionClient('query.cancel', { sessionId }).catch(error => {
                console.error('[SQLConsoleClient.cancelQuery] cancel API failed', error);
            });
        },
        [currentConnection?.connection?.id, normalizedWorkspaceScope, sessionIdMap],
    );

    return {
        editorRef,
        runQuery,
        cancelQuery,
        runningTabs,
        dbReady: true,
        userReady,
    };
}

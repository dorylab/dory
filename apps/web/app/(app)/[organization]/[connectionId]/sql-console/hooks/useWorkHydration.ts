'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSetAtom } from 'jotai';

import { authFetch } from '@/lib/client/auth-fetch';
import type { ResultSetStatsV1, ResultSetViewState } from '@/lib/client/type';
import { useDB } from '@/lib/client/use-pglite';
import type { UITabPayload } from '@dory/shared/types/tabs';
import { sessionIdByTabAtom } from '../sql-console.store';
import { getSessionStorageKey, normalizeSqlWorkspaceScope, type SqlWorkspaceScope } from '../workspace-scope';

type WorkSnapshotResponse = {
    code?: number;
    data?: {
        snapshot?: {
            tabs?: UITabPayload[];
            sessions?: Array<{
                session: {
                    sessionId: string;
                    tabId?: string | null;
                    userId?: string | null;
                    connectionId?: string | null;
                    database?: string | null;
                    sqlText: string;
                    status: 'running' | 'success' | 'error' | 'canceled';
                    errorMessage?: string | null;
                    startedAt?: string | Date | null;
                    finishedAt?: string | Date | null;
                    durationMs?: number | null;
                    resultSetCount?: number;
                    stopOnError?: boolean;
                    source?: string | null;
                };
                queryResultSets: Array<{
                    sessionId: string;
                    setIndex: number;
                    sqlText: string;
                    sqlOp?: string | null;
                    title?: string | null;
                    columns?: unknown | null;
                    stats?: ResultSetStatsV1 | null;
                    viewState?: ResultSetViewState | null;
                    aiProfileVersion?: number | null;
                    rowCount?: number | null;
                    limited?: boolean | null;
                    limit?: number | null;
                    affectedRows?: number | null;
                    status: 'success' | 'error';
                    errorMessage?: string | null;
                    errorCode?: string | null;
                    errorSqlState?: string | null;
                    errorMeta?: unknown | null;
                    warnings?: unknown | null;
                    startedAt?: string | Date | null;
                    finishedAt?: string | Date | null;
                    durationMs?: number | null;
                }>;
                results: unknown[][];
            }>;
        };
    };
    message?: string;
};

export function useWorkHydration({
    tabs,
    isLoading,
    setActiveTabId,
    workspaceScope,
}: {
    tabs: UITabPayload[];
    isLoading: boolean;
    setActiveTabId: (tabId: string) => void;
    workspaceScope?: SqlWorkspaceScope;
}) {
    const searchParams = useSearchParams();
    const normalizedWorkspaceScope = useMemo(() => normalizeSqlWorkspaceScope(workspaceScope), [workspaceScope]);
    const workId = normalizedWorkspaceScope.workspaceMode === 'agent' ? normalizedWorkspaceScope.workId : null;
    const requestedTabId = searchParams.get('tabId');
    const requestedSessionId = searchParams.get('sessionId');
    const setSessionIdMap = useSetAtom(sessionIdByTabAtom);
    const { dbReady, applyServerResult } = useDB();
    const hydratedWorkRef = useRef<string | null>(null);

    useEffect(() => {
        if (!workId || !dbReady || isLoading || hydratedWorkRef.current === workId) return;

        const activeWorkId = workId;
        let cancelled = false;
        hydratedWorkRef.current = activeWorkId;

        async function hydrate() {
            const response = await authFetch(`/api/works/${encodeURIComponent(activeWorkId)}/snapshot`);
            const payload = (await response.json().catch(() => null)) as WorkSnapshotResponse | null;
            if (!response.ok || payload?.code !== 0) {
                throw new Error(payload?.message ?? 'Failed to load Work snapshot.');
            }

            const snapshot = payload.data?.snapshot;
            if (!snapshot || cancelled) return;

            for (const item of snapshot.sessions ?? []) {
                await applyServerResult({
                    session: item.session,
                    queryResultSets: item.queryResultSets,
                    results: item.results,
                });
            }

            if (cancelled) return;

            const targetTabId =
                requestedTabId && tabs.some(tab => tab.tabId === requestedTabId)
                    ? requestedTabId
                    : (snapshot.sessions?.find(item => item.session.tabId)?.session.tabId ?? snapshot.tabs?.[0]?.tabId ?? null);
            const targetSessionId =
                requestedSessionId ??
                (targetTabId ? snapshot.sessions?.find(item => item.session.tabId === targetTabId)?.session.sessionId : null) ??
                snapshot.sessions?.[0]?.session.sessionId ??
                null;

            if (targetTabId && targetSessionId) {
                setSessionIdMap(prev => ({ ...prev, [targetTabId]: targetSessionId }));
                try {
                    localStorage.setItem(getSessionStorageKey(targetTabId, normalizedWorkspaceScope), targetSessionId);
                } catch {
                    // ignore
                }
            }

            if (targetTabId) {
                setActiveTabId(targetTabId);
            }
        }

        hydrate().catch(error => {
            hydratedWorkRef.current = null;
            console.error('[useWorkHydration] failed', error);
        });

        return () => {
            cancelled = true;
        };
    }, [applyServerResult, dbReady, isLoading, normalizedWorkspaceScope, requestedSessionId, requestedTabId, setActiveTabId, setSessionIdMap, tabs, workId]);
}

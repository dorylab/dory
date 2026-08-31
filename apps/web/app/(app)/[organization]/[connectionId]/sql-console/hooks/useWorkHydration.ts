'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAtomValue, useSetAtom } from 'jotai';

import { authFetch } from '@/lib/client/auth-fetch';
import { notifySqlConsoleResultDataUpdated } from '@/lib/client/sql-console-result-store';
import type { SqlConsoleResultUpdatePayload } from '@/lib/client/sql-console-result-snapshot';
import { activeTabIdAtom } from '@/shared/stores/app.store';
import type { UITabPayload } from '@dory/shared/types/tabs';
import { sessionIdByTabAtom } from '../sql-console.store';
import { getSessionStorageKey, normalizeSqlWorkspaceScope, type SqlWorkspaceScope } from '../workspace-scope';
import { resolveWorkHydrationTarget } from '../work-hydration-target';
import type { SqlWorkspaceInitialResultTarget } from '../initial-result-target';

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
                    stats?: unknown | null;
                    viewState?: unknown | null;
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
                    resultSetId?: string | null;
                    dataAvailability?: string | null;
                    previewRowCount?: number | null;
                    byteSize?: number | null;
                    artifactStore?: string | null;
                    storageFormat?: 'parquet' | 'json' | null;
                    sourceConnectionType?: string | null;
                    sourceDatabaseName?: string | null;
                    createdAt?: number | string | Date | null;
                    expiresAt?: number | string | Date | null;
                }>;
                results: unknown[][];
            }>;
        };
    };
    message?: string;
};

type WorkSnapshot = NonNullable<NonNullable<WorkSnapshotResponse['data']>['snapshot']>;

export function useWorkHydration({
    tabs,
    isLoading,
    setActiveTabId,
    workspaceScope,
    initialResultTarget,
}: {
    tabs: UITabPayload[];
    isLoading: boolean;
    setActiveTabId: (tabId: string) => void;
    workspaceScope?: SqlWorkspaceScope;
    initialResultTarget?: SqlWorkspaceInitialResultTarget | null;
}) {
    const searchParams = useSearchParams();
    const normalizedWorkspaceScope = useMemo(() => normalizeSqlWorkspaceScope(workspaceScope), [workspaceScope]);
    const workId = normalizedWorkspaceScope.workspaceMode === 'agent' ? normalizedWorkspaceScope.workId : null;
    const requestedTabId = initialResultTarget?.tabId ?? searchParams.get('tabId');
    const requestedSessionId = initialResultTarget?.sessionId ?? searchParams.get('sessionId');
    const activeTabId = useAtomValue(activeTabIdAtom);
    const setSessionIdMap = useSetAtom(sessionIdByTabAtom);
    const hydratedWorkRef = useRef<string | null>(null);
    const activatedWorkRef = useRef<string | null>(null);
    const snapshotRef = useRef<WorkSnapshot | null>(null);
    const [snapshotRevision, setSnapshotRevision] = useState(0);

    const applyHydrationTarget = useCallback(
        (snapshot: WorkSnapshot) => {
            const hydrationTabs = tabs.length > 0 ? tabs : (snapshot.tabs ?? []);
            const hydrationTarget = resolveWorkHydrationTarget({
                tabs: hydrationTabs,
                sessions: snapshot.sessions ?? [],
                requestedTabId,
                requestedSessionId,
            });

            if (Object.keys(hydrationTarget.sessionIdByTab).length > 0) {
                setSessionIdMap(prev => {
                    let changed = false;
                    for (const [tabId, sessionId] of Object.entries(hydrationTarget.sessionIdByTab)) {
                        if (prev[tabId] !== sessionId) {
                            changed = true;
                            break;
                        }
                    }

                    return changed ? { ...prev, ...hydrationTarget.sessionIdByTab } : prev;
                });
                for (const [tabId, sessionId] of Object.entries(hydrationTarget.sessionIdByTab)) {
                    try {
                        localStorage.setItem(getSessionStorageKey(tabId, normalizedWorkspaceScope), sessionId);
                    } catch {
                        // ignore
                    }
                }
            }

            const shouldActivateTarget = Boolean(workId && activatedWorkRef.current !== workId && hydrationTarget.targetTabId);
            if (workId && shouldActivateTarget) {
                activatedWorkRef.current = workId;
                if (hydrationTarget.targetTabId !== activeTabId) {
                    setActiveTabId(hydrationTarget.targetTabId);
                }
            }
        },
        [activeTabId, normalizedWorkspaceScope, requestedSessionId, requestedTabId, setActiveTabId, setSessionIdMap, tabs, workId],
    );

    useEffect(() => {
        if (!workId || isLoading || hydratedWorkRef.current === workId) return;

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

            if (cancelled) return;

            snapshotRef.current = snapshot;
            setSnapshotRevision(revision => revision + 1);
            for (const sessionSnapshot of snapshot.sessions ?? []) {
                const payload: SqlConsoleResultUpdatePayload = {
                    session: sessionSnapshot.session,
                    queryResultSets: sessionSnapshot.queryResultSets,
                    results: sessionSnapshot.results,
                };
                notifySqlConsoleResultDataUpdated(payload);
            }
        }

        hydrate().catch(error => {
            hydratedWorkRef.current = null;
            snapshotRef.current = null;
            console.error('[useWorkHydration] failed', error);
        });

        return () => {
            cancelled = true;
        };
    }, [isLoading, workId]);

    useEffect(() => {
        if (!workId || hydratedWorkRef.current !== workId) return;
        const snapshot = snapshotRef.current;
        if (!snapshot) return;
        applyHydrationTarget(snapshot);
    }, [applyHydrationTarget, snapshotRevision, workId]);
}

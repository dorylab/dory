'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslations } from 'next-intl';

import { activeTabIdAtom, currentConnectionAtom, currentWorkspaceScopeAtom, tabsAtom } from '@/shared/stores/app.store';
import { currentTabResultAtom, sessionIdByTabAtom } from '../../../sql-console.store';
import { executeActionClient } from '@/lib/actions/client';
import { fetchSqlTabs, SQL_TABS_PREFETCH_STALE_TIME_MS, sqlTabsQueryKey } from '@/lib/sql-console/tab-queries';
import { normalizeWorkspaceScope, TabPayload, UITabPayload, WorkspaceScope, workspaceScopeKey } from '@dory/shared/types/tabs';
import { debounce } from 'lodash-es';
import { useRouteConnectionId } from '../../../hooks/useRouteConnectionId';

const ACTIVE_KEY = (connectionId?: string | null, workspaceScope?: WorkspaceScope | null) => `sqlconsole:activeTabId:${connectionId ?? 'default'}:${workspaceScopeKey(workspaceScope)}`;
const SID = (tabId: string) => `sqlconsole:sessionId:${tabId}`;

export function useSQLTabs(options?: { workspaceScope?: WorkspaceScope | null; connectionId?: string | null; preferredActiveTabId?: string | null }) {
    const queryClient = useQueryClient();
    const currentConnection = useAtomValue(currentConnectionAtom);
    const connectionId = currentConnection?.connection?.id ?? null;
    const routeConnectionIdFromRoute = useRouteConnectionId();
    const routeConnectionId = options?.connectionId ?? routeConnectionIdFromRoute;
    const preferredActiveTabId = options?.preferredActiveTabId ?? null;
    const inputWorkspaceScopeKey = workspaceScopeKey(options?.workspaceScope);
    const normalizedWorkspaceScope = useMemo(() => normalizeWorkspaceScope(options?.workspaceScope), [inputWorkspaceScopeKey]);
    const normalizedWorkspaceScopeKey = workspaceScopeKey(normalizedWorkspaceScope);
    const setCurrentWorkspaceScope = useSetAtom(currentWorkspaceScopeAtom);

    const [tabs, setTabs] = useAtom(tabsAtom);
    const [activeTabId, internalSetActiveTabId] = useAtom(activeTabIdAtom);

    const sessionIdMap = useAtomValue(sessionIdByTabAtom);
    const setSessionIdMap = useSetAtom(sessionIdByTabAtom);
    const setResults = useSetAtom(currentTabResultAtom);

    const [isLoading, setIsLoading] = useState(true);
    const t = useTranslations('SqlConsole');
    const currentTabsQueryKey = useMemo(
        () => (connectionId ? sqlTabsQueryKey(connectionId, normalizedWorkspaceScope) : null),
        [connectionId, normalizedWorkspaceScope, normalizedWorkspaceScopeKey],
    );

    useEffect(() => {
        setCurrentWorkspaceScope(normalizedWorkspaceScope);
    }, [normalizedWorkspaceScopeKey, setCurrentWorkspaceScope]);

    const persistOrder = useCallback(
        async (orderedTabs: UITabPayload[]) => {
            console.log('Persisting tab order to server...', connectionId);
            if (!connectionId) return;
            try {
                await Promise.all(
                    orderedTabs.map((tab, idx) => {
                        const base: TabPayload =
                            tab.tabType === 'sql'
                                ? {
                                    tabId: tab.tabId,
                                    tabType: tab.tabType,
                                    tabName: tab.tabName,
                                    orderIndex: idx,
                                    createdAt: tab.createdAt,
                                    userId: tab.userId ?? '',
                                    connectionId: tab.connectionId ?? connectionId,
                                    workspaceScope: normalizedWorkspaceScope,
                                    content: tab.content ?? '',
                                    status: tab.status,
                                    resultMeta: tab.resultMeta,
                                }
                                : {
                                    tabId: tab.tabId,
                                    tabType: tab.tabType,
                                    tabName: tab.tabName,
                                    orderIndex: idx,
                                    createdAt: tab.createdAt,
                                    userId: tab.userId ?? '',
                                    connectionId: tab.connectionId ?? connectionId,
                                    workspaceScope: normalizedWorkspaceScope,
                                    databaseName: tab.databaseName,
                                    tableName: tab.tableName,
                                    activeSubTab: tab.activeSubTab,
                                    dataView: tab.dataView,
                                };
                        console.log('Persist tab order to server:', tab.tabId, 'as', base);
                        return saveTabToServer(tab.tabId, base).catch(err => {
                            console.error('[useSQLTabs] persist order failed for', tab.tabId, err);
                        });
                    }),
                );
            } catch (err) {
                console.error('[useSQLTabs] persist order failed', err);
            }
        },
        [connectionId, normalizedWorkspaceScope],
    );

    // ---------------------------------------------------
    
    // ---------------------------------------------------
    async function saveTabToServer(tabId: string, tab: TabPayload) {
        if (!connectionId) return;

        await executeActionClient('tab.save', { connectionId, tabId, state: tab, workspaceScope: normalizedWorkspaceScope }, { currentConnectionId: connectionId });
    }

    async function createTabOnServer(tab: UITabPayload) {
        if (!connectionId) return;

        await executeActionClient(
            'tab.create',
            {
                connectionId,
                tabId: tab.tabId,
                tabType: tab.tabType,
                tabName: tab.tabName,
                content: tab.tabType === 'sql' ? (tab.content ?? '') : undefined,
                databaseName: tab.tabType === 'table' ? (tab.databaseName ?? null) : null,
                tableName: tab.tabType === 'table' ? (tab.tableName ?? null) : null,
                activeSubTab: tab.tabType === 'table' ? (tab.activeSubTab ?? 'data') : null,
                orderIndex: tab.orderIndex,
                createdAt: typeof tab.createdAt === 'undefined' ? undefined : String(tab.createdAt),
                resultMeta: tab.tabType === 'sql' ? (tab.resultMeta ?? null) : null,
                workspaceScope: normalizedWorkspaceScope,
            },
            { currentConnectionId: connectionId },
        );
    }

    // ---------------------------------------------------
    
    // ---------------------------------------------------
    const debouncedSaveRef = useRef<ReturnType<typeof debounce> | null>(null);

    useEffect(() => {
        
        if (debouncedSaveRef.current) {
            debouncedSaveRef.current.flush();
            debouncedSaveRef.current.cancel();
        }

        const fn = debounce((tabId: string, tab: TabPayload) => {
            saveTabToServer(tabId, tab).catch(err => {
                console.error('debounced save tab error', err);
            });
        }, 500); 

        debouncedSaveRef.current = fn;

        return () => {
            fn.flush();
            fn.cancel();
        };
    }, [connectionId]);

    // ---------------------------------------------------
    
    // ---------------------------------------------------
    const setActiveTabId = (id: string) => {
        
        if (debouncedSaveRef.current) {
            debouncedSaveRef.current.flush();
        }

        internalSetActiveTabId(id);

        if (connectionId) {
            try {
            localStorage.setItem(ACTIVE_KEY(connectionId, normalizedWorkspaceScope), id);
            } catch {
                // ignore
            }
        }

        let persisted = '';
        try {
            persisted = localStorage.getItem(SID(id)) || '';
        } catch {
            // ignore
        }

        const effectiveSessionId = sessionIdMap[id] ?? persisted;

        setSessionIdMap(prev => (prev[id] === undefined ? { ...prev, [id]: effectiveSessionId } : prev));

        if (!effectiveSessionId) setResults([]);
    };

    // ---------------------------------------------------
    
    // ---------------------------------------------------
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (debouncedSaveRef.current) {
                debouncedSaveRef.current.flush();
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, []);

    // ---------------------------------------------------
    
    // ---------------------------------------------------
    useEffect(() => {
        if (!routeConnectionId) {
            setIsLoading(false);
            return;
        }
        if (!connectionId || connectionId !== routeConnectionId) {
            return;
        }
        if (!connectionId) {
            setIsLoading(false);
            setTabs([]);
            setSessionIdMap({});
            internalSetActiveTabId('');
            try {
                localStorage.removeItem(ACTIVE_KEY(null, normalizedWorkspaceScope));
            } catch {
                // ignore
            }
            return;
        }

        const applyServerTabs = (res: UITabPayload[]) => {
            const serverTabs = [...res].sort((a, b) => {
                const orderDelta = (a.orderIndex ?? 0) - (b.orderIndex ?? 0);
                if (orderDelta !== 0) return orderDelta;
                const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                if (aCreated !== bCreated) return aCreated - bCreated;
                return a.tabId.localeCompare(b.tabId);
            });

            console.log('Loaded tabs from server:', serverTabs);

            setTabs(serverTabs);

            let nextActive = serverTabs[0]?.tabId ?? '';
            const hasPreferredActiveTab = Boolean(preferredActiveTabId && serverTabs.some(t => t.tabId === preferredActiveTabId));
            if (hasPreferredActiveTab) {
                nextActive = preferredActiveTabId ?? nextActive;
            }
            try {
                const saved = localStorage.getItem(ACTIVE_KEY(connectionId, normalizedWorkspaceScope));
                if (!hasPreferredActiveTab && saved && serverTabs.some(t => t.tabId === saved)) {
                    nextActive = saved;
                }
            } catch {
                // ignore
            }

            if (nextActive) setActiveTabId(nextActive);
        };

        const tabsQueryKey = sqlTabsQueryKey(connectionId, normalizedWorkspaceScope);
        const cachedTabs = queryClient.getQueryData<UITabPayload[]>(tabsQueryKey);
        if (cachedTabs) {
            applyServerTabs(cachedTabs);
            setIsLoading(false);
        } else {
            setIsLoading(true);
        }

        let cancelled = false;

        (async () => {
            try {
                const res = await queryClient.fetchQuery({
                    queryKey: tabsQueryKey,
                    queryFn: () => fetchSqlTabs(connectionId, normalizedWorkspaceScope),
                    staleTime: SQL_TABS_PREFETCH_STALE_TIME_MS,
                });

                if (cancelled) return;
                if (Array.isArray(res)) {
                    applyServerTabs(res);
                } else {
                    setTabs([]);
                    setSessionIdMap({});
                    internalSetActiveTabId('');
                    try {
                        localStorage.removeItem(ACTIVE_KEY(connectionId, normalizedWorkspaceScope));
                    } catch {
                        // ignore
                    }
                }
            } catch (e) {
                if (cancelled) return;
                console.error('load tabs error', e);
                setTabs([]);
                setSessionIdMap({});
                internalSetActiveTabId('');
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [connectionId, routeConnectionId, setTabs, setSessionIdMap, internalSetActiveTabId, normalizedWorkspaceScope, normalizedWorkspaceScopeKey, preferredActiveTabId, queryClient]);

    useEffect(() => {
        if (!currentTabsQueryKey || isLoading) return;
        queryClient.setQueryData(currentTabsQueryKey, tabs);
    }, [currentTabsQueryKey, isLoading, queryClient, tabs]);

    // ---------------------------------------------------
    
    // ---------------------------------------------------
    const updateTab = useCallback((
        tabId: string,
        patch: Partial<UITabPayload>,
        options?: { immediate?: boolean },
    ) => {
        let updated: UITabPayload | undefined;

        setTabs(prevTabs => {
            const nextTabs = prevTabs.map(t => {
                if (t.tabId !== tabId) return t;
                updated = { ...t, ...patch } as UITabPayload;
                return updated;
            });
            return nextTabs;
        });

        if (!updated) return;

        if (options?.immediate) {
            
            saveTabToServer(tabId, updated).catch(err => {
                console.error('immediate save tab error', err);
            });
        } else {
            if (debouncedSaveRef.current) {
                debouncedSaveRef.current(tabId, updated);
            }
        }
    }, [setTabs]);

    // ---------------------------------------------------
    
    // ---------------------------------------------------
    const addTab = async (payload?: { tabName?: string; content?: string; activate?: boolean }) => {
        const tabId = uuidv4();

        const newTab: UITabPayload = {
            tabId,
            tabType: 'sql',
            tabName: payload?.tabName ?? t('Tabs.NewQuery'),
            content: payload?.content ?? '',
            status: 'idle',
            userId: '',
            connectionId: connectionId ?? '',
            workspaceScope: normalizedWorkspaceScope,
            orderIndex: tabs.length,
            createdAt: new Date().toISOString(),
        };

        setTabs(prev => [...prev, newTab]);
        setSessionIdMap(prev => ({ ...prev, [tabId]: '' }));

        if (payload?.activate !== false) {
            setActiveTabId(tabId);
        }

        void createTabOnServer(newTab).catch(err => {
            console.error('create new tab error', err);
        });
        return tabId;
    };

    const addTableTab = async (payload: { tableName: string; databaseName?: string; tabName?: string }) => {
        const { tableName, databaseName, tabName } = payload;
        if (!tableName) return;

        const existing = tabs.find(
            t =>
                t.tabType === 'table' &&
                t.tableName === tableName &&
                (databaseName ? t.databaseName === databaseName : true),
        );
        if (existing) {
            setActiveTabId(existing.tabId);
            return existing;
        }

        const tabId = uuidv4();
        const newTab: UITabPayload = {
            tabId,
            tabType: 'table',
            tabName: tabName ?? tableName,
            tableName,
            databaseName,
            activeSubTab: 'data',
            dataView: { limit: 1000, page: 1 },
            userId: '',
            connectionId: connectionId ?? '',
            workspaceScope: normalizedWorkspaceScope,
            orderIndex: tabs.length,
            createdAt: new Date().toISOString(),
        };

        setTabs(prev => [...prev, newTab]);
        setSessionIdMap(prev => ({ ...prev, [tabId]: '' }));
        setActiveTabId(tabId);

        void createTabOnServer(newTab).catch(err => {
            console.error('create new table tab error', err);
        });
        return newTab;
    };

    // ---------------------------------------------------
    
    // ---------------------------------------------------
    const closeTab = async (tabId: string) => {
        
        if (debouncedSaveRef.current) {
            debouncedSaveRef.current.flush();
        }

        const nextTabs = tabs.filter(t => t.tabId !== tabId);
        setTabs(nextTabs);

        setSessionIdMap(prev => {
            const next = { ...prev };
            delete next[tabId];
            return next;
        });

        try {
            localStorage.removeItem(SID(tabId));
        } catch {
            // ignore
        }

        if (activeTabId === tabId) {
            if (nextTabs.length > 0) {
                const nextActive = nextTabs[0].tabId;
                setActiveTabId(nextActive);
            } else {
                internalSetActiveTabId('');
                try {
                    if (connectionId) {
                        localStorage.removeItem(ACTIVE_KEY(connectionId, normalizedWorkspaceScope));
                    }
                } catch {
                    // ignore
                }
                setResults([]);
            }
        }

        if (connectionId) {
            await executeActionClient('tab.delete', { connectionId, tabId, workspaceScope: normalizedWorkspaceScope }, { currentConnectionId: connectionId });
        }
    };

    // ---------------------------------------------------
    
    // ---------------------------------------------------
    const closeOtherTabs = async (tabId: string) => {
        if (debouncedSaveRef.current) {
            debouncedSaveRef.current.flush();
        }

        const keep = tabs.find(t => t.tabId === tabId);
        if (!keep) return;

        const toClose = tabs.filter(t => t.tabId !== tabId);
        setTabs([keep]);

        setSessionIdMap(prev => {
            const next: Record<string, string> = {};
            next[tabId] = prev[tabId] ?? '';
            return next;
        });

        toClose.forEach(t => {
            try {
                localStorage.removeItem(SID(t.tabId));
            } catch {
                // ignore
            }
        });

        setActiveTabId(tabId);

        if (connectionId) {
            await Promise.all(toClose.map(tab => executeActionClient('tab.delete', { connectionId, tabId: tab.tabId, workspaceScope: normalizedWorkspaceScope }, { currentConnectionId: connectionId })));
        }
    };

    // ---------------------------------------------------
    
    // ---------------------------------------------------
    const reorderTabs = useCallback(
        (sourceId: string, targetId: string, options?: { persist?: boolean }) => {
            if (!sourceId || !targetId || sourceId === targetId) return;
            console.log('Reorder tabs:', sourceId, '->', targetId);

            const sourceIndex = tabs.findIndex(t => t.tabId === sourceId);
            const targetIndex = tabs.findIndex(t => t.tabId === targetId);
            if (sourceIndex < 0 || targetIndex < 0) return;

            const next = [...tabs];
            const [moved] = next.splice(sourceIndex, 1);
            next.splice(targetIndex, 0, moved);

            const withOrder = next.map((t, idx) => ({ ...t, orderIndex: idx })) as UITabPayload[];
            setTabs(withOrder);

            if (options?.persist !== false) {
                void persistOrder(withOrder);
            }
        },
        [persistOrder, setTabs, tabs],
    );

    return {
        tabs,
        activeTabId,
        isLoading,
        setActiveTabId,
        updateTab,
        addTab,
        addTableTab,
        closeTab,
        closeOtherTabs,
        reorderTabs,
    };
}

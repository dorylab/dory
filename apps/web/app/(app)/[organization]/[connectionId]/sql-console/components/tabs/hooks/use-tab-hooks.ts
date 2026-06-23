'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useTranslations } from 'next-intl';

import { activeTabIdAtom, currentConnectionAtom, tabsAtom } from '@/shared/stores/app.store';
import { currentTabResultAtom, sessionIdByTabAtom } from '../../../sql-console.store';
import { executeActionClient } from '@/lib/actions/client';
import { TabPayload, UITabPayload } from '@dory/shared/types/tabs';
import { debounce } from 'lodash-es';
import { useRouteConnectionId } from '../../../hooks/useRouteConnectionId';
import { getActiveTabStorageKey, getSessionStorageKey, normalizeSqlWorkspaceScope, type SqlWorkspaceScope } from '../../../workspace-scope';

function toPersistedTabPayload(tab: UITabPayload, index: number, connectionId: string, workId: string | null): TabPayload {
    if (tab.tabType === 'table') {
        return {
            tabId: tab.tabId,
            tabType: tab.tabType,
            tabName: tab.tabName,
            orderIndex: tab.orderIndex ?? index,
            createdAt: typeof tab.createdAt === 'undefined' ? undefined : String(tab.createdAt),
            userId: tab.userId ?? '',
            connectionId: tab.connectionId ?? connectionId,
            workId,
            databaseName: tab.databaseName,
            tableName: tab.tableName,
            activeSubTab: tab.activeSubTab,
            dataView: tab.dataView,
        };
    }

    return {
        tabId: tab.tabId,
        tabType: tab.tabType,
        tabName: tab.tabName,
        orderIndex: tab.orderIndex ?? index,
        createdAt: typeof tab.createdAt === 'undefined' ? undefined : String(tab.createdAt),
        userId: tab.userId ?? '',
        connectionId: tab.connectionId ?? connectionId,
        workId,
        content: tab.content ?? '',
        status: tab.status,
        resultMeta: tab.resultMeta,
    };
}

export function useSQLTabs(workspaceScope?: SqlWorkspaceScope) {
    const currentConnection = useAtomValue(currentConnectionAtom);
    const normalizedWorkspaceScope = useMemo(() => normalizeSqlWorkspaceScope(workspaceScope), [workspaceScope]);
    const routeConnectionId = useRouteConnectionId();
    const scopedRouteConnectionId = normalizedWorkspaceScope.connectionId ?? routeConnectionId;
    const connectionId =
        currentConnection?.connection?.id === scopedRouteConnectionId ? currentConnection.connection.id : (scopedRouteConnectionId ?? currentConnection?.connection?.id ?? null);
    const workId = normalizedWorkspaceScope.workspaceMode === 'agent' ? (normalizedWorkspaceScope.workId ?? null) : null;
    const storageScope = useMemo(
        () =>
            normalizeSqlWorkspaceScope({
                ...normalizedWorkspaceScope,
                connectionId,
                workId,
            }),
        [connectionId, normalizedWorkspaceScope, workId],
    );
    const activeStorageKey = useMemo(() => getActiveTabStorageKey(storageScope), [storageScope]);

    const [tabs, setTabs] = useAtom(tabsAtom);
    const [activeTabId, internalSetActiveTabId] = useAtom(activeTabIdAtom);

    const sessionIdMap = useAtomValue(sessionIdByTabAtom);
    const setSessionIdMap = useSetAtom(sessionIdByTabAtom);
    const setResults = useSetAtom(currentTabResultAtom);

    const [isLoading, setIsLoading] = useState(true);
    const t = useTranslations('SqlConsole');
    const persistOrder = useCallback(
        async (orderedTabs: UITabPayload[]) => {
            console.log('Persisting tab order to server...', connectionId);
            if (!connectionId) return;
            try {
                await Promise.all(
                    orderedTabs.map((tab, idx) => {
                        const base = toPersistedTabPayload({ ...tab, orderIndex: idx }, idx, connectionId, workId);
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
        [connectionId, workId],
    );

    // ---------------------------------------------------

    // ---------------------------------------------------
    async function saveTabToServer(tabId: string, tab: TabPayload) {
        if (!connectionId) return;

        await executeActionClient('tab.save', { connectionId, workId, tabId, state: { ...tab, workId } }, { currentConnectionId: connectionId });
    }

    async function createTabOnServer(tab: UITabPayload) {
        if (!connectionId) return;

        await executeActionClient(
            'tab.create',
            {
                connectionId,
                workId,
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
    }, [connectionId, workId]);

    // ---------------------------------------------------

    // ---------------------------------------------------
    const setActiveTabId = (id: string) => {
        if (debouncedSaveRef.current) {
            debouncedSaveRef.current.flush();
        }

        internalSetActiveTabId(id);

        if (connectionId) {
            try {
                localStorage.setItem(activeStorageKey, id);
            } catch {
                // ignore
            }
        }

        let persisted = '';
        try {
            persisted = localStorage.getItem(getSessionStorageKey(id, storageScope)) || '';
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
        if (!scopedRouteConnectionId) {
            setIsLoading(false);
            return;
        }
        if (!connectionId || connectionId !== scopedRouteConnectionId) {
            return;
        }
        if (!connectionId) {
            setIsLoading(false);
            setTabs([]);
            setSessionIdMap({});
            internalSetActiveTabId('');
            try {
                localStorage.removeItem(activeStorageKey);
            } catch {
                // ignore
            }
            return;
        }

        setIsLoading(true);

        (async () => {
            try {
                const res = await executeActionClient<UITabPayload[]>('tab.list', { connectionId, workId }, { currentConnectionId: connectionId });

                if (Array.isArray(res)) {
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
                    try {
                        const saved = localStorage.getItem(activeStorageKey);
                        if (saved && serverTabs.some(t => t.tabId === saved)) {
                            nextActive = saved;
                        }
                    } catch {
                        // ignore
                    }

                    if (nextActive) setActiveTabId(nextActive);
                } else {
                    setTabs([]);
                    setSessionIdMap({});
                    internalSetActiveTabId('');
                    try {
                        localStorage.removeItem(activeStorageKey);
                    } catch {
                        // ignore
                    }
                }
            } catch (e) {
                console.error('load tabs error', e);
                setTabs([]);
                setSessionIdMap({});
                internalSetActiveTabId('');
            } finally {
                setIsLoading(false);
            }
        })();
    }, [activeStorageKey, connectionId, scopedRouteConnectionId, setTabs, setSessionIdMap, internalSetActiveTabId, workId]);

    // ---------------------------------------------------

    // ---------------------------------------------------
    const updateTab = useCallback(
        (tabId: string, patch: Partial<UITabPayload>, options?: { immediate?: boolean }) => {
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
        },
        [setTabs],
    );

    const saveWorkspaceNow = async (options?: { activeTabId?: string | null; activeSqlContent?: string | null }) => {
        if (debouncedSaveRef.current) {
            debouncedSaveRef.current.flush();
        }

        if (!connectionId) {
            return { saved: false, tabCount: 0 };
        }

        const activeTabIdForSave = options?.activeTabId ?? null;
        const activeSqlContent = typeof options?.activeSqlContent === 'string' ? options.activeSqlContent : null;
        const tabsToSave = tabs.map((tab, index) => {
            const nextTab =
                activeSqlContent !== null && activeTabIdForSave === tab.tabId && tab.tabType === 'sql'
                    ? ({
                          ...tab,
                          content: activeSqlContent,
                          orderIndex: tab.orderIndex ?? index,
                      } as UITabPayload)
                    : ({
                          ...tab,
                          orderIndex: tab.orderIndex ?? index,
                      } as UITabPayload);

            return nextTab;
        });

        if (activeSqlContent !== null && activeTabIdForSave) {
            setTabs(prevTabs =>
                prevTabs.map((tab, index) =>
                    tab.tabId === activeTabIdForSave && tab.tabType === 'sql'
                        ? ({
                              ...tab,
                              content: activeSqlContent,
                              orderIndex: tab.orderIndex ?? index,
                          } as UITabPayload)
                        : tab,
                ),
            );
        }

        await Promise.all(tabsToSave.map((tab, index) => saveTabToServer(tab.tabId, toPersistedTabPayload(tab, index, connectionId, workId))));

        return { saved: true, tabCount: tabsToSave.length };
    };

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
            workId,
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

        const existing = tabs.find(t => t.tabType === 'table' && t.tableName === tableName && (databaseName ? t.databaseName === databaseName : true));
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
            workId,
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
            localStorage.removeItem(getSessionStorageKey(tabId, storageScope));
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
                        localStorage.removeItem(activeStorageKey);
                    }
                } catch {
                    // ignore
                }
                setResults([]);
            }
        }

        if (connectionId) {
            await executeActionClient('tab.delete', { connectionId, workId, tabId }, { currentConnectionId: connectionId });
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
                localStorage.removeItem(getSessionStorageKey(t.tabId, storageScope));
            } catch {
                // ignore
            }
        });

        setActiveTabId(tabId);

        if (connectionId) {
            await Promise.all(toClose.map(tab => executeActionClient('tab.delete', { connectionId, workId, tabId: tab.tabId }, { currentConnectionId: connectionId })));
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
        saveWorkspaceNow,
    };
}

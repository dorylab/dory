'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { activeTabIdAtom, currentConnectionAtom, tabsAtom } from '@/shared/stores/app.store';
import { currentTabResultAtom, sessionIdByTabAtom } from '../../../sql-console.store';
import type { ResponseObject } from '@/types';
import { authFetch } from '@/lib/client/auth-fetch';
import { TabPayload, UITabPayload } from '@/types/tabs';
import { debounce } from 'lodash-es';

const ACTIVE_KEY = (connectionId?: string | null) => `sqlconsole:activeTabId:${connectionId ?? 'default'}`;
const SID = (tabId: string) => `sqlconsole:sessionId:${tabId}`;

export function useSQLTabs() {
    const currentConnection = useAtomValue(currentConnectionAtom);
    const connectionId = currentConnection?.connection.id ?? null;
    const params = useParams<{ connectionId?: string | string[]; connection?: string | string[] }>();
    const routeConnectionParam = params?.connectionId ?? params?.connection;
    const routeConnectionId = Array.isArray(routeConnectionParam) ? routeConnectionParam[0] : routeConnectionParam;

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
                                    content: tab.content ?? '',
                                    status: tab.status,
                                }
                                : {
                                    tabId: tab.tabId,
                                    tabType: tab.tabType,
                                    tabName: tab.tabName,
                                    orderIndex: idx,
                                    createdAt: tab.createdAt,
                                    userId: tab.userId ?? '',
                                    connectionId: tab.connectionId ?? connectionId,
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
        [connectionId],
    );

    // ---------------------------------------------------
    
    // ---------------------------------------------------
    async function saveTabToServer(tabId: string, tab: TabPayload) {
        if (!connectionId) return;

        await authFetch(`/api/sql-console/tabs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Connection-ID': connectionId,
            },
            body: JSON.stringify({
                tabId,
                state: tab,
            }),
        });
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
                localStorage.setItem(ACTIVE_KEY(connectionId), id);
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
                localStorage.removeItem(ACTIVE_KEY(null));
            } catch {
                // ignore
            }
            return;
        }

        setIsLoading(true);

        (async () => {
            try {
                const response = await authFetch(`/api/sql-console/tabs`, {
                    method: 'GET',
                    headers: {
                        'X-Connection-ID': connectionId,
                    },
                });
                const res = (await response.json()) as ResponseObject<UITabPayload[]>;

                if (res.code === 1 && Array.isArray(res.data)) {
                    const serverTabs = [...res.data].sort((a, b) => {
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
                        const saved = localStorage.getItem(ACTIVE_KEY(connectionId));
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
                        localStorage.removeItem(ACTIVE_KEY(connectionId));
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
    }, [connectionId, routeConnectionId, setTabs, setSessionIdMap, internalSetActiveTabId]);

    // ---------------------------------------------------
    
    // ---------------------------------------------------
    const updateTab = (
        tabId: string,
        patch: Partial<UITabPayload>,
        options?: { immediate?: boolean },
    ) => {
        const nextTabs = tabs.map(t =>
            t.tabId === tabId ? ({ ...t, ...patch } as UITabPayload) : t,
        );
        setTabs(nextTabs);

        const updated = nextTabs.find(t => t.tabId === tabId);
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
            orderIndex: tabs.length,
            createdAt: new Date().toISOString(),
        };

        setTabs(prev => [...prev, newTab]);
        setSessionIdMap(prev => ({ ...prev, [tabId]: '' }));

        if (payload?.activate !== false) {
            setActiveTabId(tabId);
        }

        await saveTabToServer(tabId, newTab);
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
            orderIndex: tabs.length,
            createdAt: new Date().toISOString(),
        };

        setTabs(prev => [...prev, newTab]);
        setSessionIdMap(prev => ({ ...prev, [tabId]: '' }));
        setActiveTabId(tabId);

        await saveTabToServer(tabId, newTab);
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
                        localStorage.removeItem(ACTIVE_KEY(connectionId));
                    }
                } catch {
                    // ignore
                }
                setResults([]);
            }
        }

        if (connectionId) {
            await authFetch(`/api/sql-console/tabs?tabId=${tabId}`, {
                method: 'DELETE',
                headers: {
                    'X-Connection-ID': connectionId,
                },
            });
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
            await Promise.all(
                toClose.map(tab =>
                    authFetch(`/api/sql-console/tabs?tabId=${tab.tabId}`, {
                        method: 'DELETE',
                        headers: {
                            'X-Connection-ID': connectionId,
                        },
                    }),
                ),
            );
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

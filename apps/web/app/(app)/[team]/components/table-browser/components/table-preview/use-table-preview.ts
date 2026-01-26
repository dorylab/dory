'use client';

import { useCallback, useEffect, useRef } from 'react';
import { SQLTab } from '@/types/tabs';
import { useAtomValue } from 'jotai';
import { useDB } from '@/lib/client/use-pglite';
import { sessionIdByTabAtom } from '../../../../[connectionId]/sql-console/sql-console.store';

type TablePreviewManagerProps = {
    tabs: SQLTab[];
    activeTab?: SQLTab;
    activeDatabase?: string;
    dbReady: boolean;
    userReady: boolean;
    setActiveDatabase: (db: string) => void;
    setActiveTabId: (id: string) => void;
    addTableTab: (payload: {
        tableName: string;
        databaseName?: string;
        tabName?: string;
    }) => Promise<SQLTab | void> | SQLTab | void;
    closeTab: (tabId: string) => Promise<void> | void;
    closeOtherTabs: (tabId: string) => Promise<void> | void;
    runTableQuery: (
        tab: SQLTab,
        options?: { sqlOverride?: string; databaseOverride?: string | null },
    ) => Promise<void> | void;
    buildTableQuery: (tab: SQLTab) => string;
};

type PreviewState = 'idle' | 'loading' | 'ready';

export function useTablePreviewManager({
    tabs,
    activeTab,
    activeDatabase,
    dbReady,
    userReady,
    setActiveDatabase,
    setActiveTabId,
    addTableTab,
    closeTab,
    closeOtherTabs,
    runTableQuery,
    buildTableQuery,
}: TablePreviewManagerProps) {
    
    const tablePreviewStateRef = useRef<Record<string, PreviewState>>({});
    const sessionIdMap = useAtomValue(sessionIdByTabAtom);
    const { listResultSetIndices } = useDB();

    
    const findExistingPreview = useCallback(
        async (tab: SQLTab | undefined | null) => {
            if (!tab) return null;
            let sid: string | undefined = sessionIdMap[tab.tabId];
            if (!sid) {
                try {
                    sid = localStorage.getItem(`sqlconsole:sessionId:${tab.tabId}`) ?? undefined;
                } catch {
                    // ignore
                }
            }
            if (!sid || !dbReady) return null;

            try {
                const indices = await listResultSetIndices(sid);
                return (indices?.length ?? 0) > 0 ? sid : null;
            } catch {
                return null;
            }
        },
        [dbReady, listResultSetIndices, sessionIdMap],
    );

    const ensureTablePreview = useCallback(
        async (tab: SQLTab | undefined | null) => {
            if (!tab || tab.tabType !== 'table') return;
            if (!dbReady || !userReady) return;

            const sql = buildTableQuery(tab);
            if (!sql.trim()) return;

            const state = tablePreviewStateRef.current[tab.tabId] ?? 'idle';

            
            if (state === 'loading') return;

            
            const existing = await findExistingPreview(tab);
            if (existing) {
                tablePreviewStateRef.current[tab.tabId] = 'ready';
                return;
            }

            
            tablePreviewStateRef.current[tab.tabId] = 'loading';
            try {
                await Promise.resolve(
                    runTableQuery(tab, {
                        databaseOverride: tab.databaseName ?? activeDatabase ?? null,
                        sqlOverride: sql,
                    }),
                );
                tablePreviewStateRef.current[tab.tabId] = 'ready';
            } catch (e) {
                
                tablePreviewStateRef.current[tab.tabId] = 'idle';
                throw e;
            }
        },
        [activeDatabase, buildTableQuery, dbReady, runTableQuery, userReady, findExistingPreview],
    );

    const handleCloseTab = useCallback(
        async (tabId: string) => {
            delete tablePreviewStateRef.current[tabId];
            await closeTab(tabId);
        },
        [closeTab],
    );

    const handleCloseOthers = useCallback(
        async (tabId: string) => {
            tabs.filter(t => t.tabId !== tabId).forEach(t => {
                delete tablePreviewStateRef.current[t.tabId];
            });
            await closeOtherTabs(tabId);
        },
        [closeOtherTabs, tabs],
    );

    const handleOpenTableTab = useCallback(
        async (payload: { tableName: string; database?: string; tabLabel?: string }) => {
            const { tableName, database, tabLabel } = payload;
            if (!tableName) return;

            const dbName = database || activeDatabase || undefined;
            if (dbName && dbName !== activeDatabase) {
                setActiveDatabase(dbName);
            }

            const existing = tabs.find(
                t =>
                    t.tabType === 'table' &&
                    t.tableName === tableName &&
                    (dbName ? t.databaseName === dbName : true),
            );

            const target =
                existing ??
                (await addTableTab({
                    tableName,
                    databaseName: dbName,
                    tabName: tabLabel ?? tableName,
                }));

            if (!target) return;

            setActiveTabId(target.tabId);
            void ensureTablePreview(target);
        },
        [activeDatabase, addTableTab, ensureTablePreview, setActiveDatabase, setActiveTabId, tabs],
    );

    useEffect(() => {
        if (activeTab?.tabType === 'table') {
            void ensureTablePreview(activeTab);
        }
    }, [activeTab, ensureTablePreview]);

    return {
        handleOpenTableTab,
        handleCloseTab,
        handleCloseOthers,
    };
}

'use client';

import { useCallback } from 'react';
import { SQLTab } from '@/types/tabs';

type DataPreviewManagerProps = {
    tabs: SQLTab[];
    activeDatabase?: string;
    setActiveDatabase: (db: string) => void;
    setActiveTabId: (id: string) => void;
    addTableTab: (payload: {
        tableName: string;
        databaseName?: string;
        tabName?: string;
    }) => Promise<SQLTab | void> | SQLTab | void;
    closeTab: (tabId: string) => Promise<void> | void;
    closeOtherTabs: (tabId: string) => Promise<void> | void;
};

export function useDataPreviewManager({
    tabs,
    activeDatabase,
    setActiveDatabase,
    setActiveTabId,
    addTableTab,
    closeTab,
    closeOtherTabs,
}: DataPreviewManagerProps) {
    const handleCloseTab = useCallback(
        async (tabId: string) => {
            await closeTab(tabId);
        },
        [closeTab],
    );

    const handleCloseOthers = useCallback(
        async (tabId: string) => {
            await closeOtherTabs(tabId);
        },
        [closeOtherTabs],
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
                tab =>
                    tab.tabType === 'table' &&
                    tab.tableName === tableName &&
                    (dbName ? tab.databaseName === dbName : true),
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
        },
        [activeDatabase, addTableTab, setActiveDatabase, setActiveTabId, tabs],
    );

    return {
        handleOpenTableTab,
        handleCloseTab,
        handleCloseOthers,
    };
}

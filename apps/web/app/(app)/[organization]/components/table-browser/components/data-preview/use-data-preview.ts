'use client';

import { useCallback } from 'react';
import { useAtom } from 'jotai';
import { useTranslations } from 'next-intl';
import { SQLTab } from '@dory/shared/types/tabs';
import { tableEditSessionsAtom } from './table-editor-store';
import { usePendingTableChangesBeforeUnload } from './use-pending-table-changes-before-unload';

type DataPreviewManagerProps = {
    tabs: SQLTab[];
    activeDatabase?: string;
    setActiveDatabase: (db: string) => void;
    setActiveTabId: (id: string) => void;
    addTableTab: (payload: { tableName: string; databaseName?: string; tabName?: string }) => Promise<SQLTab | void> | SQLTab | void;
    closeTab: (tabId: string) => Promise<void> | void;
    closeOtherTabs: (tabId: string) => Promise<void> | void;
};

export function useDataPreviewManager({ tabs, activeDatabase, setActiveDatabase, setActiveTabId, addTableTab, closeTab, closeOtherTabs }: DataPreviewManagerProps) {
    const t = useTranslations('TableBrowser.Editor');
    const [editSessions, setEditSessions] = useAtom(tableEditSessionsAtom);
    const hasPendingChanges = useCallback((tabId: string) => Object.keys(editSessions[`${tabId}:data-preview`]?.rows ?? {}).length > 0, [editSessions]);

    usePendingTableChangesBeforeUnload();

    const handleCloseTab = useCallback(
        async (tabId: string) => {
            if (hasPendingChanges(tabId) && !window.confirm(t('DiscardTabChanges'))) {
                return;
            }
            await closeTab(tabId);
            setEditSessions(current => {
                const next = { ...current };
                delete next[`${tabId}:data-preview`];
                return next;
            });
        },
        [closeTab, hasPendingChanges, setEditSessions, t],
    );

    const handleCloseOthers = useCallback(
        async (tabId: string) => {
            const dirtyOtherTabs = tabs.filter(tab => tab.tabId !== tabId && hasPendingChanges(tab.tabId));
            if (dirtyOtherTabs.length > 0 && !window.confirm(t('DiscardOtherTabChanges', { count: dirtyOtherTabs.length }))) {
                return;
            }
            await closeOtherTabs(tabId);
            setEditSessions(current => {
                const next = { ...current };
                dirtyOtherTabs.forEach(tab => {
                    delete next[`${tab.tabId}:data-preview`];
                });
                return next;
            });
        },
        [closeOtherTabs, hasPendingChanges, setEditSessions, t, tabs],
    );

    const handleOpenTableTab = useCallback(
        async (payload: { tableName: string; database?: string; tabLabel?: string }) => {
            const { tableName, database, tabLabel } = payload;
            if (!tableName) return;

            const dbName = database || activeDatabase || undefined;
            if (dbName && dbName !== activeDatabase) {
                setActiveDatabase(dbName);
            }

            const existing = tabs.find(tab => tab.tabType === 'table' && tab.tableName === tableName && (dbName ? tab.databaseName === dbName : true));

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

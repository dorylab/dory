'use client';

import { useEffect, useMemo } from 'react';
import { useAtom } from 'jotai';
import { authClient } from '@/lib/auth-client';
import { activeDatabaseAtom } from '@/shared/stores/app.store';
import { useSQLTabs } from '../components/tabs/hooks/use-tab-hooks';
import { useDataPreviewManager } from '../../../components/table-browser/components/data-preview/use-data-preview';
import { useSqlLayout } from './useSqlLayout';
import { useSqlAiTabTitle } from './useSqlAiTabTitle';
import { useSqlQueryRunner } from './useSqlQueryRunner';
import { useSqlChatHandoff } from './useSqlChatHandoff';
import { useWorkHydration } from './useWorkHydration';
import { normalizeSqlWorkspaceScope, type SqlWorkspaceScope } from '../workspace-scope';

export function useSqlConsoleClient(defaultLayout: number[] | undefined, workspaceScope?: SqlWorkspaceScope) {
    const { normalizedLayout, onLayout } = useSqlLayout(defaultLayout);
    const normalizedWorkspaceScope = useMemo(() => normalizeSqlWorkspaceScope(workspaceScope), [workspaceScope]);
    const { data: session } = authClient.useSession();
    const userId = session?.user?.id;

    const { tabs, activeTabId, setActiveTabId, isLoading, areTabsHydrated, updateTab, addTab, addTableTab, closeTab, closeOtherTabs, reorderTabs, saveWorkspaceNow } =
        useSQLTabs(normalizedWorkspaceScope);
    const activeTab = useMemo(() => tabs.find(t => t.tabId === activeTabId), [tabs, activeTabId]);
    const [activeDatabase, setActiveDatabase] = useAtom(activeDatabaseAtom);

    useEffect(() => {
        if (activeTab?.tabType !== 'table' || !activeTab.databaseName || activeTab.databaseName === activeDatabase) {
            return;
        }

        setActiveDatabase(activeTab.databaseName);
    }, [activeDatabase, activeTab, setActiveDatabase]);

    const { requestAITabTitle, manualRenameTab } = useSqlAiTabTitle(activeDatabase, updateTab);

    const { editorRef, runQuery, cancelQuery, runningTabs } = useSqlQueryRunner({
        activeDatabase,
        tabs,
        userId,
        requestAITabTitle,
        workspaceScope: normalizedWorkspaceScope,
    });

    const { handleOpenTableTab, handleCloseTab, handleCloseOthers } = useDataPreviewManager({
        tabs,
        activeDatabase,
        setActiveDatabase,
        setActiveTabId,
        addTableTab,
        closeTab,
        closeOtherTabs,
    });

    useSqlChatHandoff({
        tabs,
        activeTabId,
        updateTab,
        addTab,
        setActiveTabId,
        setActiveDatabase,
        isLoading,
    });

    useWorkHydration({
        tabs,
        isLoading,
        setActiveTabId,
        workspaceScope: normalizedWorkspaceScope,
    });

    return {
        normalizedLayout,
        onLayout,
        editorRef,
        tabs,
        activeTab,
        activeTabId,
        setActiveTabId,
        isLoading,
        areTabsHydrated,
        updateTab,
        addTab,
        closeTab,
        closeOtherTabs,
        reorderTabs,
        runQuery,
        cancelQuery,
        runningTabs,
        manualRenameTab,
        handleOpenTableTab,
        handleCloseTab,
        handleCloseOthers,
        saveWorkspaceNow,
    };
}

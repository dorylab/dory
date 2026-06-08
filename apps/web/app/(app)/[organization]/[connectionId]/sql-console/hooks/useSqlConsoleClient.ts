'use client';

import { useEffect, useMemo } from 'react';
import { useAtom } from 'jotai';
import { authClient } from '@/lib/auth-client';
import { activeDatabaseAtom } from '@/shared/stores/app.store';
import type { WorkspaceScope } from '@dory/shared/types/tabs';
import { useSQLTabs } from '../components/tabs/hooks/use-tab-hooks';
import { useDataPreviewManager } from '../../../components/table-browser/components/data-preview/use-data-preview';
import { useSqlLayout } from './useSqlLayout';
import { useSqlAiTabTitle } from './useSqlAiTabTitle';
import { useSqlQueryRunner } from './useSqlQueryRunner';
import { useSqlChatHandoff } from './useSqlChatHandoff';
import { useWorkRunResultHydration } from './useWorkRunResultHydration';

export function useSqlConsoleClient(defaultLayout: number[] | undefined, options?: { workspaceScope?: WorkspaceScope | null; connectionId?: string | null; preferredActiveTabId?: string | null }) {
    const { normalizedLayout, onLayout } = useSqlLayout(defaultLayout);
    const { data: session } = authClient.useSession();
    const userId = session?.user?.id;

    const { tabs, activeTabId, setActiveTabId, isLoading, updateTab, addTab, addTableTab, closeTab, closeOtherTabs, reorderTabs } = useSQLTabs({
        workspaceScope: options?.workspaceScope,
        connectionId: options?.connectionId,
        preferredActiveTabId: options?.preferredActiveTabId,
    });
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
        activeTab,
        tabs,
        userId,
        requestAITabTitle,
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
    useWorkRunResultHydration({
        activeTab,
        isLoading,
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
    };
}

'use client';

import { useMemo } from 'react';
import { useAtom } from 'jotai';
import { authClient } from '@/lib/auth-client';
import { activeDatabaseAtom } from '@/shared/stores/app.store';
import { useSQLTabs } from '../components/tabs/hooks/use-tab-hooks';
import { useDataPreviewManager } from '../../../components/table-browser/components/data-preview/use-data-preview';
import { useSqlLayout } from './useSqlLayout';
import { useSqlAiTabTitle } from './useSqlAiTabTitle';
import { useSqlQueryRunner } from './useSqlQueryRunner';
import { useSqlChatHandoff } from './useSqlChatHandoff';

export function useSqlConsoleClient(defaultLayout: number[] | undefined) {
    const { normalizedLayout, onLayout } = useSqlLayout(defaultLayout);
    const { data: session } = authClient.useSession();
    const userId = session?.user?.id;

    const { tabs, activeTabId, setActiveTabId, isLoading, updateTab, addTab, addTableTab, closeTab, closeOtherTabs, reorderTabs } = useSQLTabs();
    const activeTab = useMemo(() => tabs.find(t => t.tabId === activeTabId), [tabs, activeTabId]);
    const [activeDatabase, setActiveDatabase] = useAtom(activeDatabaseAtom);

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
        setActiveDatabase,
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

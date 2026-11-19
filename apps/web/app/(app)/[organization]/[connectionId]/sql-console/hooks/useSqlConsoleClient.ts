'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSqlNamingRefresh } from './useSqlNamingRefresh';
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
import type { SqlWorkspaceInitialResultTarget } from '../initial-result-target';
import { useInitialResultTarget } from './useInitialResultTarget';

type QuerySource = { database: string | null; schema?: string | null };
export type ReportQuerySources = { fallback?: QuerySource; byTab: ReadonlyMap<string, QuerySource> };

export function useSqlConsoleClient(
    defaultLayout: number[] | undefined,
    workspaceScope?: SqlWorkspaceScope,
    initialResultTarget?: SqlWorkspaceInitialResultTarget | null,
    reportSources?: ReportQuerySources,
) {
    const { normalizedLayout, onLayout } = useSqlLayout(defaultLayout);
    const normalizedWorkspaceScope = useMemo(() => normalizeSqlWorkspaceScope(workspaceScope), [workspaceScope]);
    const { data: session } = authClient.useSession();
    const userId = session?.user?.id;

    const {
        tabs,
        activeTabId,
        setActiveTabId,
        isLoading,
        areTabsHydrated,
        updateTab,
        addTab,
        addTableTab,
        closeTab,
        closeOtherTabs,
        reorderTabs,
        saveWorkspaceNow,
        applyTabNames,
    } = useSQLTabs(normalizedWorkspaceScope);
    const activeTab = useMemo(() => tabs.find(t => t.tabId === activeTabId), [tabs, activeTabId]);
    const [globalDatabase, setGlobalDatabase] = useAtom(activeDatabaseAtom);
    const [selectedDatabases, setSelectedDatabases] = useState<Record<string, string>>({});
    const tabSource = reportSources?.byTab.get(activeTabId) ?? reportSources?.fallback;
    const activeDatabase = reportSources
        ? ((activeTab?.tabType === 'table' ? activeTab.databaseName : undefined) ?? selectedDatabases[activeTabId] ?? tabSource?.database ?? '')
        : globalDatabase;
    const activeSchema = tabSource?.database === activeDatabase ? tabSource.schema : undefined;
    const setActiveDatabase = useCallback(
        (database: string, tabId = activeTabId) => {
            if (reportSources) setSelectedDatabases(prev => ({ ...prev, [tabId]: database }));
            else setGlobalDatabase(database);
        },
        [activeTabId, reportSources, setGlobalDatabase],
    );

    useEffect(() => {
        if (reportSources || activeTab?.tabType !== 'table' || !activeTab.databaseName || activeTab.databaseName === activeDatabase) {
            return;
        }

        setActiveDatabase(activeTab.databaseName);
    }, [activeDatabase, activeTab, reportSources, setActiveDatabase]);

    const { manualRenameTab } = useSqlAiTabTitle(activeDatabase, updateTab);

    const { editorRef, runQuery, cancelQuery, runningTabs } = useSqlQueryRunner({
        activeDatabase,
        activeSchema,
        userId,
        prepareTab: (tabId, content) => saveWorkspaceNow({ activeTabId: tabId, activeSqlContent: content }),
        workspaceScope: normalizedWorkspaceScope,
    });

    useSqlNamingRefresh(tabs, runningTabs, normalizedWorkspaceScope, applyTabNames);

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
        initialResultTarget,
    });

    useInitialResultTarget({
        target: initialResultTarget,
        tabs,
        areTabsHydrated,
        isLoading,
        addTab,
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
        activeDatabase,
        activeSchema,
        setActiveDatabase,
    };
}

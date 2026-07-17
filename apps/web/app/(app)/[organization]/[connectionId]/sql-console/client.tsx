'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Group, Panel, Separator as PanelSeparator, type Layout } from 'react-resizable-panels';
import { Sparkles } from 'lucide-react';

import { cn } from '@dory/web-utils';
import type { SQLTab } from '@dory/shared/types/tabs';
import { executeActionClient } from '@/lib/actions/client';
import { Button } from '@/registry/new-york-v4/ui/button';
import { useTranslations } from 'next-intl';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/registry/new-york-v4/ui/alert-dialog';
import { copilotPanelOpenAtom, copilotPanelWidthAtom, editorSelectionByTabAtom, inlineSqlAskByTabAtom, sessionIdByTabAtom } from './sql-console.store';

import { SQLConsoleSidebar } from '../../components/sql-console-sidebar/sql-console-sidebar';
import type { RenameTablePayload, TableActionPayload } from '../../components/sql-console-sidebar/types';
import { SavedQueriesSidebar, type SavedQueryItem } from './components/saved-queries/saved-queries-sidebar';
import SQLTabEmpty from './components/tabs/tab-empty';
import { SQLTabs } from './components/tabs';
import { SqlConsoleOverlayHost } from './components/sql-console-overlay';
import { SqlMode } from './components/copilot-modes/sql-mode';
import { TableMode } from './components/copilot-modes/table-mode';
import { useSqlConsoleClient } from './hooks/useSqlConsoleClient';
import { applyRenamedTableName, buildQueryTableSql } from './table-action-sql';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { notifySqlConsoleResultDataUpdated } from '@/lib/client/sql-console-result-store';
import { getSessionStorageKey, humanSqlWorkspaceScope, sqlWorkspaceScopeAtom } from './workspace-scope';
import { clearQueryHistoryRestoredSession, getQueryHistoryRestorableSessionId, markQueryHistoryRestoredSession } from './query-history-result-restore';

const INITIAL_LAYOUT = {
    horizontal: {
        total: 100,
        default: [20, 80] as [number, number],
        leftPanel: {
            min: 15,
            max: 40,
        },
        middlePanel: {
            min: 40,
        },
    },
    copilot: {
        defaultWidth: 30,
        minWidth: 10,
        maxWidth: 50,
    },
    tabs: {
        defaultHeaderHeight: 36,
    },
} as const;

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function normalizeHorizontalLayout(layout: readonly number[] | undefined): [number, number] {
    if (!Array.isArray(layout) || layout.length === 0) return INITIAL_LAYOUT.horizontal.default;

    const left = layout[0] ?? INITIAL_LAYOUT.horizontal.default[0];
    const middle = layout[1] ?? INITIAL_LAYOUT.horizontal.total - left;
    const total = left + middle;

    if (total <= 0) return INITIAL_LAYOUT.horizontal.default;

    const normalizedLeft = (left / total) * INITIAL_LAYOUT.horizontal.total;
    return [normalizedLeft, INITIAL_LAYOUT.horizontal.total - normalizedLeft];
}

export default function SQLConsoleClient({ defaultLayout = INITIAL_LAYOUT.horizontal.default }: { defaultLayout: number[] | undefined }) {
    const {
        normalizedLayout,
        onLayout: onLayoutFromHook,
        editorRef,
        tabs,
        activeTab,
        activeTabId,
        setActiveTabId,
        isLoading,
        areTabsHydrated,
        updateTab,
        addTab,
        reorderTabs,
        runQuery,
        cancelQuery,
        runningTabs,
        manualRenameTab,
        handleOpenTableTab,
        handleCloseTab,
        handleCloseOthers,
    } = useSqlConsoleClient(defaultLayout, humanSqlWorkspaceScope);
    const t = useTranslations('SqlConsole');
    const setWorkspaceScope = useSetAtom(sqlWorkspaceScopeAtom);

    const horizontalLayout = useMemo(() => normalizeHorizontalLayout(normalizedLayout), [normalizedLayout]);
    const [showChatbot, setShowChatbot] = useAtom(copilotPanelOpenAtom);
    const [chatWidth, setChatWidth] = useAtom(copilotPanelWidthAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const workspaceScope = useAtomValue(sqlWorkspaceScopeAtom);
    const selectionByTab = useAtomValue(editorSelectionByTabAtom);
    const setInlineAskByTab = useSetAtom(inlineSqlAskByTabAtom);
    const setSessionIdMap = useSetAtom(sessionIdByTabAtom);
    const shouldShowChatbot = activeTab?.tabType === 'sql' ? showChatbot : false;
    const normalizedChatWidth = useMemo(
        () => clamp(chatWidth ?? INITIAL_LAYOUT.copilot.defaultWidth, INITIAL_LAYOUT.copilot.minWidth, INITIAL_LAYOUT.copilot.maxWidth),
        [chatWidth],
    );
    const [tabHeaderHeight, setTabHeaderHeight] = useState<number>(INITIAL_LAYOUT.tabs.defaultHeaderHeight); // measured from SQLTabs
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [pendingSavedQuery, setPendingSavedQuery] = useState<SavedQueryItem | null>(null);

    useEffect(() => {
        setWorkspaceScope(humanSqlWorkspaceScope);
    }, [setWorkspaceScope]);

    const lastActiveSqlTabIdRef = useRef<string | null>(null);
    if (activeTab?.tabType === 'sql') {
        lastActiveSqlTabIdRef.current = activeTab.tabId;
    }
    const retainedSqlTab = (tabs.find(tab => tab.tabType === 'sql' && tab.tabId === lastActiveSqlTabIdRef.current) ?? tabs.find(tab => tab.tabType === 'sql')) || undefined;

    const runQueryWithRef = useCallback(
        (tab: Parameters<typeof runQuery>[0], options?: Parameters<typeof runQuery>[1]) => {
            if (tab?.tabType === 'sql' && tab.tabId) {
                const selection = selectionByTab[tab.tabId];
                if (selection) {
                    const sqlText = editorRef.current?.getValue(tab.tabId) ?? tab.content ?? '';
                    const start = Math.max(0, Math.min(selection.start, sqlText.length));
                    const end = Math.max(start, Math.min(selection.end, sqlText.length));
                    const selectionText = sqlText.slice(start, end).trim();
                    if (selectionText) {
                        return runQuery(tab, { ...options, sqlOverride: selectionText });
                    }
                }
            }

            return runQuery(tab, options);
        },
        [editorRef, runQuery, selectionByTab],
    );

    const handleOpenQueryConsole = useCallback(async () => {
        await addTab({ activate: true });
    }, [addTab]);

    const handleQueryTable = useCallback(
        async (payload: TableActionPayload) => {
            const sqlText = buildQueryTableSql({
                connectionType: currentConnection?.connection?.type,
                database: payload.database,
                schema: payload.schema,
                tableName: payload.tableName,
            });
            const tabName = t('Tabs.QueryTableTabName', { table: payload.tabLabel ?? payload.tableName });
            const tabId = await addTab({ tabName, content: sqlText, activate: true });
            const tab: SQLTab = {
                tabId,
                tabType: 'sql',
                tabName,
                content: sqlText,
                status: 'idle',
                userId: '',
                connectionId: currentConnection?.connection?.id ?? '',
                createdAt: new Date().toISOString(),
            };

            await runQueryWithRef(tab, {
                sqlOverride: sqlText,
                databaseOverride: payload.database ?? null,
            });
        },
        [addTab, currentConnection?.connection?.id, currentConnection?.connection?.type, runQueryWithRef, t],
    );

    const handleRenameTable = useCallback(
        async (payload: RenameTablePayload) => {
            const connectionId = currentConnection?.connection?.id;
            if (!connectionId || !payload.database) {
                throw new Error(t('Tabs.MissingConnectionContext'));
            }

            await executeActionClient(
                'schema.renameTable',
                {
                    connectionId,
                    database: payload.database,
                    table: payload.tableName,
                    nextName: payload.nextName,
                },
                { currentConnectionId: connectionId },
            );

            const nextTableName = applyRenamedTableName(payload.tableName, payload.nextName.trim());
            await Promise.all(
                tabs
                    .filter(tab => tab.tabType === 'table' && tab.tableName === payload.tableName && (!payload.database || tab.databaseName === payload.database))
                    .map(tab =>
                        Promise.resolve(
                            updateTab(
                                tab.tabId,
                                {
                                    tableName: nextTableName,
                                    tabName: applyRenamedTableName((tab.tabName as string | undefined) ?? payload.tableName, payload.nextName.trim()),
                                },
                                { immediate: true },
                            ),
                        ),
                    ),
            );
        },
        [currentConnection?.connection?.id, t, tabs, updateTab],
    );

    useEffect(() => {
        if (chatWidth !== normalizedChatWidth) {
            setChatWidth(normalizedChatWidth);
        }
    }, [chatWidth, normalizedChatWidth, setChatWidth]);

    useEffect(() => {
        const liveTabIds = new Set(tabs.map(tab => tab.tabId));
        setInlineAskByTab(prev => {
            const nextEntries = Object.entries(prev).filter(([tabId]) => liveTabIds.has(tabId));
            if (nextEntries.length === Object.keys(prev).length) {
                return prev;
            }
            return Object.fromEntries(nextEntries);
        });
    }, [setInlineAskByTab, tabs]);

    const handleLayoutChange = (layout: Layout) => {
        const next = [layout['left-panel'] ?? horizontalLayout[0], layout['middle-panel'] ?? horizontalLayout[1]];
        onLayoutFromHook?.(next);
    };

    const setClampedChatWidth = useCallback(
        (size: number) => {
            setChatWidth(clamp(size, INITIAL_LAYOUT.copilot.minWidth, INITIAL_LAYOUT.copilot.maxWidth));
        },
        [setChatWidth],
    );

    const closeChatbotPanel = () => setShowChatbot(false);
    const toggleChatbotPanel = () => setShowChatbot(prev => !prev);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const isOpenShortcut = event.key.toLowerCase() === 'i' && (event.metaKey || event.ctrlKey);
            if (!isOpenShortcut) return;
            if (activeTab?.tabType !== 'sql') return;
            event.preventDefault();
            setShowChatbot(prev => !prev);
        };
        window.addEventListener('keydown', handler);
        return () => {
            window.removeEventListener('keydown', handler);
        };
    }, [activeTab?.tabType, setShowChatbot]);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const isNewTabShortcut = event.code === 'KeyL' && event.altKey && (event.metaKey || event.ctrlKey);
            if (!isNewTabShortcut) return;
            if (activeTab?.tabType !== 'sql') return;
            event.preventDefault();
            void addTab({ activate: true });
        };
        window.addEventListener('keydown', handler);
        return () => {
            window.removeEventListener('keydown', handler);
        };
    }, [activeTab?.tabType, addTab]);

    const applySavedQuery = useCallback(
        async (item: SavedQueryItem): Promise<string | null> => {
            const sqlText = item.sqlText ?? '';
            if (!sqlText.trim()) return null;

            if (!activeTabId) {
                return addTab({ tabName: item.title, content: sqlText, activate: true });
            }

            if (!activeTab || activeTab.tabType !== 'sql') {
                return addTab({ tabName: item.title, content: sqlText, activate: true });
            }

            editorRef.current?.applyContentWithUndo(sqlText, activeTabId);
            updateTab(activeTabId, { content: sqlText }, { immediate: true });
            return activeTabId;
        },
        [activeTab, activeTabId, addTab, editorRef, updateTab],
    );

    const restoreQueryHistoryResult = useCallback(
        async (item: SavedQueryItem, tabId: string | null) => {
            if (!tabId) return;
            const sessionId = getQueryHistoryRestorableSessionId(item);
            if (!sessionId) {
                setSessionIdMap(prev => {
                    if (!prev[tabId]) return prev;
                    const next = { ...prev };
                    delete next[tabId];
                    return next;
                });
                try {
                    localStorage.removeItem(getSessionStorageKey(tabId, workspaceScope));
                    clearQueryHistoryRestoredSession(tabId);
                } catch {
                    // ignore
                }
                notifySqlConsoleResultDataUpdated();
                return;
            }

            setSessionIdMap(prev => ({ ...prev, [tabId]: sessionId }));
            try {
                localStorage.setItem(getSessionStorageKey(tabId, workspaceScope), sessionId);
                markQueryHistoryRestoredSession(tabId, sessionId);
            } catch {
                // ignore
            }
            notifySqlConsoleResultDataUpdated();
        },
        [setSessionIdMap, workspaceScope],
    );

    const handleSavedQuerySelect = useCallback(
        async (item: SavedQueryItem) => {
            const sqlText = item.sqlText ?? '';
            if (!sqlText.trim()) return;
            const normalized = sqlText.trim();
            const existing = tabs.find(tab => tab.tabType === 'sql' && (tab.content ?? '').trim() === normalized);
            if (existing) {
                setActiveTabId(existing.tabId);
                await restoreQueryHistoryResult(item, existing.tabId);
                return;
            }

            if (!activeTabId) {
                const tabId = await addTab({ tabName: item.title, content: sqlText, activate: true });
                await restoreQueryHistoryResult(item, tabId);
                return;
            }

            if (!activeTab || activeTab.tabType !== 'sql') {
                const tabId = await addTab({ tabName: item.title, content: sqlText, activate: true });
                await restoreQueryHistoryResult(item, tabId);
                return;
            }

            const current = editorRef.current?.getValue(activeTab.tabId) ?? activeTab.content ?? '';
            const hasContent = current.trim().length > 0 && current.trim() !== sqlText.trim();
            if (hasContent) {
                setPendingSavedQuery(item);
                setConfirmOpen(true);
                return;
            }

            const tabId = await applySavedQuery(item);
            await restoreQueryHistoryResult(item, tabId);
        },
        [activeTab, activeTabId, addTab, applySavedQuery, editorRef, restoreQueryHistoryResult, setActiveTabId, tabs],
    );

    return (
        <main className="relative h-full w-full min-w-0 max-w-full overflow-hidden">
            <Group
                orientation="horizontal"
                id="sql-console-horizontal"
                defaultLayout={{ 'left-panel': horizontalLayout[0], 'middle-panel': horizontalLayout[1] }}
                onLayoutChanged={handleLayoutChange}
            >
                {/* Left */}
                <Panel
                    id="left-panel"
                    minSize={`${INITIAL_LAYOUT.horizontal.leftPanel.min}%`}
                    maxSize={`${INITIAL_LAYOUT.horizontal.leftPanel.max}%`}
                    className="min-w-0 overflow-hidden"
                >
                    <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden bg-background">
                        <Tabs defaultValue="tables" className="w-full min-w-0 max-w-full flex-1 overflow-hidden">
                            <TabsList className="w-full min-w-0 max-w-full rounded-none px-2">
                                <TabsTrigger value="tables" className="min-w-0 flex-1">
                                    {t('Sidebar.Tables')}
                                </TabsTrigger>
                                <TabsTrigger value="saved" className="min-w-0 flex-1">
                                    {t('Sidebar.Queries')}
                                </TabsTrigger>
                            </TabsList>
                            {/* <Separator /> */}
                            <TabsContent value="tables" className="min-h-0 w-full min-w-0 max-w-full flex-1 overflow-hidden">
                                <SQLConsoleSidebar
                                    onOpenTableTab={handleOpenTableTab}
                                    onOpenQueryConsole={handleOpenQueryConsole}
                                    onQueryTable={handleQueryTable}
                                    onRenameTable={handleRenameTable}
                                    selectedTable={activeTab?.tabType === 'table' ? activeTab.tableName : undefined}
                                    selectedDatabase={activeTab?.tabType === 'table' ? activeTab.databaseName : undefined}
                                />
                            </TabsContent>
                            <TabsContent value="saved" className="min-h-0 w-full min-w-0 max-w-full flex-1 overflow-hidden">
                                <SavedQueriesSidebar onSelect={handleSavedQuerySelect} />
                            </TabsContent>
                        </Tabs>
                    </div>
                </Panel>

                <PanelSeparator className="w-1.5 bg-border transition-colors" />

                {/* Middle */}
                <Panel id="middle-panel" minSize={`${INITIAL_LAYOUT.horizontal.middlePanel.min}%`}>
                    <div className="flex h-full flex-col">
                        {!areTabsHydrated || tabs.length === 0 ? (
                            <SQLTabEmpty addTab={addTab} disabled={isLoading} />
                        ) : (
                            <>
                                <SQLTabs
                                    tabs={tabs}
                                    activeTabId={activeTabId}
                                    setActiveTabId={setActiveTabId}
                                    addTab={addTab}
                                    closeTab={handleCloseTab}
                                    closeOtherTabs={handleCloseOthers}
                                    updateTab={updateTab}
                                    reorderTabs={reorderTabs}
                                    onRequestAITitle={manualRenameTab}
                                    onHeightChange={setTabHeaderHeight}
                                />
                                <div className="relative flex-1 min-h-0">
                                    {retainedSqlTab ? (
                                        <div
                                            aria-hidden={activeTab?.tabType !== 'sql'}
                                            inert={activeTab?.tabType !== 'sql'}
                                            className={cn(
                                                'absolute inset-0 flex h-full min-h-0 flex-col',
                                                activeTab?.tabType === 'sql' ? 'z-10 opacity-100' : 'z-0 opacity-0 pointer-events-none',
                                            )}
                                        >
                                            <SqlMode
                                                tabs={tabs}
                                                activeTab={retainedSqlTab}
                                                activeTabId={retainedSqlTab.tabId}
                                                setActiveTabId={setActiveTabId}
                                                addTab={addTab}
                                                updateTab={updateTab}
                                                editorRef={editorRef}
                                                runQuery={runQueryWithRef}
                                                cancelQuery={cancelQuery}
                                                runningTabs={runningTabs}
                                                showChatbot={shouldShowChatbot}
                                                chatWidth={normalizedChatWidth}
                                                setChatWidth={setClampedChatWidth}
                                                onCloseChatbot={closeChatbotPanel}
                                                workspaceActive={activeTab?.tabType === 'sql'}
                                            />
                                        </div>
                                    ) : null}
                                    {activeTab?.tabType === 'table' ? (
                                        <div className="absolute inset-0 z-20 flex h-full min-h-0 flex-col">
                                            <TableMode
                                                tabs={tabs}
                                                activeTab={activeTab}
                                                activeTabId={activeTab.tabId}
                                                setActiveTabId={setActiveTabId}
                                                addTab={addTab}
                                                updateTab={updateTab}
                                                showChatbot={false}
                                                chatWidth={normalizedChatWidth}
                                                setChatWidth={setClampedChatWidth}
                                                runQuery={runQueryWithRef}
                                                onCloseChatbot={closeChatbotPanel}
                                            />
                                        </div>
                                    ) : null}
                                </div>
                            </>
                        )}
                    </div>
                </Panel>
            </Group>

            <SqlConsoleOverlayHost topOffset={isLoading || tabs.length === 0 ? 0 : tabHeaderHeight} />

            <div className="absolute right-0 bottom-0 z-20 flex" style={{ top: isLoading || tabs.length === 0 ? 0 : `${tabHeaderHeight}px` }}>
                <div className="flex h-full w-10 flex-col items-center gap-2 border-l bg-background/95 py-3 shadow-xl backdrop-blur">
                    {activeTab?.tabType === 'sql' && (
                        <Button
                            size="icon"
                            variant={shouldShowChatbot ? 'default' : 'ghost'}
                            className="group h-8 w-8"
                            onClick={toggleChatbotPanel}
                            title={shouldShowChatbot ? t('Copilot.ToggleClose') : t('Copilot.ToggleOpen')}
                            aria-label={t('Copilot.ToggleAria')}
                        >
                            <Sparkles className={cn('h-5 w-5 transition-colors', shouldShowChatbot ? 'text-background' : 'text-muted-foreground group-hover:text-[#9460FF]')} />
                            <span className="sr-only">{t('Copilot.ToggleLabel')}</span>
                        </Button>
                    )}
                </div>
            </div>

            <AlertDialog open={confirmOpen} onOpenChange={open => setConfirmOpen(open)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('SavedQueries.OverrideTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('SavedQueries.OverrideDescription')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel
                            onClick={() => {
                                setConfirmOpen(false);
                                setPendingSavedQuery(null);
                            }}
                        >
                            {t('Actions.Cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                const next = pendingSavedQuery;
                                setConfirmOpen(false);
                                setPendingSavedQuery(null);
                                if (next) {
                                    const tabId = await applySavedQuery(next);
                                    await restoreQueryHistoryResult(next, tabId);
                                }
                            }}
                        >
                            {t('SavedQueries.Override')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </main>
    );
}

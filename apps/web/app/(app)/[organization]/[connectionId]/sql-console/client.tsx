'use client';

import React, { Activity, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
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
import { copilotPanelOpenAtom, copilotPanelWidthAtom, editorSelectionByTabAtom } from './sql-console.store';

import { SQLConsoleSidebar } from '../../components/sql-console-sidebar/sql-console-sidebar';
import { SavedQueriesSidebar, type SavedQueryItem } from './components/saved-queries/saved-queries-sidebar';
import SQLTabEmpty from './components/tabs/tab-empty';
import { SQLTabs } from './components/tabs';
import { SqlMode } from './components/copilot-modes/sql-mode';
import { TableMode } from './components/copilot-modes/table-mode';
import { useSqlConsoleClient } from './hooks/useSqlConsoleClient';
import type { SQLEditorHandle } from './components/sql-editor';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';
import { Separator } from '@/registry/new-york-v4/ui/separator';

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
    editorFocusRetry: {
        maxAttempts: 5,
        delayMs: 50,
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

export default function SQLConsoleClient({
    defaultLayout = INITIAL_LAYOUT.horizontal.default,
}: {
    defaultLayout: number[] | undefined;
}) {
    const {
        normalizedLayout,
        onLayout: onLayoutFromHook,
        editorRef,
        tabs,
        activeTab,
        activeTabId,
        setActiveTabId,
        isLoading,
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
    } = useSqlConsoleClient(defaultLayout);
    const t = useTranslations('SqlConsole');

    const editorRefsByTab = useRef<Record<string, React.MutableRefObject<SQLEditorHandle | null>>>({});
    const horizontalLayout = useMemo(() => normalizeHorizontalLayout(normalizedLayout), [normalizedLayout]);
    const [showChatbot, setShowChatbot] = useAtom(copilotPanelOpenAtom);
    const [chatWidth, setChatWidth] = useAtom(copilotPanelWidthAtom);
    const selectionByTab = useAtomValue(editorSelectionByTabAtom);
    const normalizedChatWidth = useMemo(
        () => clamp(chatWidth ?? INITIAL_LAYOUT.copilot.defaultWidth, INITIAL_LAYOUT.copilot.minWidth, INITIAL_LAYOUT.copilot.maxWidth),
        [chatWidth],
    );
    const [tabHeaderHeight, setTabHeaderHeight] = useState<number>(INITIAL_LAYOUT.tabs.defaultHeaderHeight); // measured from SQLTabs
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [pendingSavedQuery, setPendingSavedQuery] = useState<SavedQueryItem | null>(null);

    useEffect(() => {
        if (activeTab?.tabType === 'table' && showChatbot) {
            setShowChatbot(false);
        }
    }, [activeTab?.tabType, setShowChatbot, showChatbot]);

    const ensureEditorRef = useCallback((tabId: string | undefined | null) => {
        if (!tabId) return null;
        if (!editorRefsByTab.current[tabId]) {
            editorRefsByTab.current[tabId] = { current: null };
        }
        return editorRefsByTab.current[tabId];
    }, []);

    useEffect(() => {
        if (!activeTabId) return;
        const refForActive = ensureEditorRef(activeTabId);
        if (refForActive) {
            editorRef.current = refForActive.current;
        }
    }, [activeTabId, editorRef, ensureEditorRef]);

    useEffect(() => {
        if (!activeTabId || activeTab?.tabType !== 'sql') return;

        let cancelled = false;
        let attempts = 0;

        const focusAtEnd = () => {
            if (cancelled) return;
            const refForActive = ensureEditorRef(activeTabId);
            const handle = refForActive?.current;
            if (handle?.focusAtEnd) {
                handle.focusAtEnd();
                return;
            }
            if (attempts < INITIAL_LAYOUT.editorFocusRetry.maxAttempts) {
                attempts += 1;
                setTimeout(focusAtEnd, INITIAL_LAYOUT.editorFocusRetry.delayMs);
            }
        };

        focusAtEnd();

        return () => {
            cancelled = true;
        };
    }, [activeTab?.tabType, activeTabId, ensureEditorRef]);

    const runQueryWithRef = useCallback(
        (tab: Parameters<typeof runQuery>[0], options?: Parameters<typeof runQuery>[1]) => {
            const refForTab = ensureEditorRef(tab?.tabId);
            if (refForTab) {
                editorRef.current = refForTab.current;
            }

            if (tab?.tabType === 'sql' && tab.tabId) {
                const selection = selectionByTab[tab.tabId];
                if (selection) {
                    const sqlText = editorRef.current?.getValue() ?? '';
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
        [ensureEditorRef, editorRef, runQuery, selectionByTab],
    );

    useEffect(() => {
        if (chatWidth !== normalizedChatWidth) {
            setChatWidth(normalizedChatWidth);
        }
    }, [chatWidth, normalizedChatWidth, setChatWidth]);

    const handleLayoutChange = (next: number[]) => {
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
            const isNewTabShortcut = event.key.toLowerCase() === 't' && (event.metaKey || event.ctrlKey);
            if (!isNewTabShortcut) return;
            event.preventDefault();
            void addTab({ activate: true });
        };
        window.addEventListener('keydown', handler);
        return () => {
            window.removeEventListener('keydown', handler);
        };
    }, [addTab]);

    const applySavedQuery = useCallback(
        async (item: SavedQueryItem) => {
            const sqlText = item.sqlText ?? '';
            if (!sqlText.trim()) return;

            if (!activeTabId) {
                await addTab({ tabName: item.title, content: sqlText, activate: true });
                return;
            }

            if (!activeTab || activeTab.tabType !== 'sql') {
                await addTab({ tabName: item.title, content: sqlText, activate: true });
                return;
            }

            editorRef.current?.applyContentWithUndo?.(sqlText);
            updateTab(activeTabId, { content: sqlText }, { immediate: true });
        },
        [activeTab, activeTabId, addTab, editorRef, updateTab],
    );

    const handleSavedQuerySelect = useCallback(
        async (item: SavedQueryItem) => {
            const sqlText = item.sqlText ?? '';
            if (!sqlText.trim()) return;
            const normalized = sqlText.trim();
            const existing = tabs.find(tab => tab.tabType === 'sql' && (tab.content ?? '').trim() === normalized);
            if (existing) {
                setActiveTabId(existing.tabId);
                return;
            }

            if (!activeTabId) {
                await addTab({ tabName: item.title, content: sqlText, activate: true });
                return;
            }

            if (!activeTab || activeTab.tabType !== 'sql') {
                await addTab({ tabName: item.title, content: sqlText, activate: true });
                return;
            }

            const current = editorRef.current?.getValue() ?? activeTab.content ?? '';
            const hasContent = current.trim().length > 0 && current.trim() !== sqlText.trim();
            if (hasContent) {
                setPendingSavedQuery(item);
                setConfirmOpen(true);
                return;
            }

            await applySavedQuery(item);
        },
        [activeTab, activeTabId, addTab, applySavedQuery, setActiveTabId, tabs],
    );

    return (
        <main className="relative h-full w-full">
            <PanelGroup direction="horizontal" autoSaveId="sql-console-horizontal" onLayout={handleLayoutChange}>
                {/* Left */}
                <Panel
                    defaultSize={horizontalLayout[0]}
                    minSize={INITIAL_LAYOUT.horizontal.leftPanel.min}
                    maxSize={INITIAL_LAYOUT.horizontal.leftPanel.max}
                >
                    <div className="flex flex-col h-full min-h-0 bg-card">
                        <Tabs defaultValue="tables" className="flex-1 min-h-0">
                            <TabsList className="w-full rounded-none px-2">
                                <TabsTrigger value="tables" className="flex-1">
                                    {t('Sidebar.Tables')}
                                </TabsTrigger>
                                <TabsTrigger value="saved" className="flex-1">
                                    {t('Sidebar.SavedQueries')}
                                </TabsTrigger>
                            </TabsList>
                            {/* <Separator /> */}
                            <TabsContent value="tables" className="flex-1 min-h-0">
                                <SQLConsoleSidebar onOpenTableTab={handleOpenTableTab} />
                            </TabsContent>
                            <TabsContent value="saved" className="flex-1 min-h-0">
                                <SavedQueriesSidebar onSelect={handleSavedQuerySelect} />
                            </TabsContent>
                        </Tabs>
                    </div>
                </Panel>

                <PanelResizeHandle className="w-1.5 bg-border data-[resize-handle-active=true]:bg-foreground/30 transition-colors" />

                {/* Middle */}
                <Panel minSize={INITIAL_LAYOUT.horizontal.middlePanel.min} defaultSize={horizontalLayout[1]}>
                    <div className="flex h-full flex-col">
                        {isLoading || tabs.length === 0 ? (
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
                                <div className="flex-1 min-h-0">
                                    {tabs.map(tab => {
                                        const isActive = tab.tabId === activeTabId;
                                        const tabEditorRef = tab.tabType === 'sql' ? (ensureEditorRef(tab.tabId) ?? editorRef) : editorRef;

                                        return (
                                            <Activity key={tab.tabId} mode={isActive ? 'visible' : 'hidden'}>
                                                <div className={cn('flex h-full flex-col', isActive ? '' : 'hidden')}>
                                                    {tab.tabType === 'table' ? (
                                                        <TableMode
                                                            tabs={tabs}
                                                            activeTab={tab}
                                                            activeTabId={tab.tabId}
                                                            setActiveTabId={setActiveTabId}
                                                            addTab={addTab}
                                                            updateTab={updateTab}
                                                            showChatbot={showChatbot}
                                                            chatWidth={normalizedChatWidth}
                                                            setChatWidth={setClampedChatWidth}
                                                            runQuery={runQueryWithRef}
                                                            onCloseChatbot={closeChatbotPanel}
                                                        />
                                                    ) : (
                                                        <SqlMode
                                                            tabs={tabs}
                                                            activeTab={tab}
                                                            activeTabId={tab.tabId}
                                                            setActiveTabId={setActiveTabId}
                                                            addTab={addTab}
                                                            updateTab={updateTab}
                                                            editorRef={tabEditorRef}
                                                            runQuery={runQueryWithRef}
                                                            cancelQuery={cancelQuery}
                                                            runningTabs={runningTabs}
                                                            showChatbot={showChatbot}
                                                            chatWidth={normalizedChatWidth}
                                                            setChatWidth={setClampedChatWidth}
                                                            onCloseChatbot={closeChatbotPanel}
                                                        />
                                                    )}
                                                </div>
                                            </Activity>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                </Panel>
            </PanelGroup>

            <div className="absolute right-0 bottom-0 z-20 flex" style={{ top: isLoading || tabs.length === 0 ? 0 : `${tabHeaderHeight}px` }}>
                <div className="flex h-full w-10 flex-col items-center gap-2 border-l bg-background/95 py-3 shadow-xl backdrop-blur">
                    {activeTab?.tabType === 'sql' && (
                        <Button
                            size="icon"
                            variant={showChatbot ? 'default' : 'ghost'}
                            className="group h-8 w-8"
                            onClick={toggleChatbotPanel}
                            title={showChatbot ? t('Copilot.ToggleClose') : t('Copilot.ToggleOpen')}
                            aria-label={t('Copilot.ToggleAria')}
                        >
                            <Sparkles className={cn('h-5 w-5 transition-colors', showChatbot ? 'text-background' : 'text-muted-foreground group-hover:text-[#9460FF]')} />
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
                                if (next) await applySavedQuery(next);
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

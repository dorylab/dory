'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Check, ChevronDown, Loader2, Play, Save, Square } from 'lucide-react';

import { Button } from '@/registry/new-york-v4/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/registry/new-york-v4/ui/dropdown-menu';
import { editorSelectionByTabAtom } from '../../sql-console.store';

import { ResultTable } from '../result-table/result-table';
import SQLEditor from '../sql-editor';
import CopilotPanel from '../copilot-panel';
import { SaveSqlDialog } from './save-sql-dialog';
import type { SqlModeProps } from './types';
import { authFetch } from '@/lib/client/auth-fetch';
import { useTranslations } from 'next-intl';
import {
    normalizeSqlEditorSettings,
    SQL_EDITOR_QUERY_LIMIT_OPTIONS,
    sqlEditorSettingsAtom,
} from '@/shared/stores/sql-editor-settings.store';

type SavedQueryItem = {
    id: string;
    title: string;
    sqlText: string;
};

export function SqlMode({
    tabs,
    activeTab,
    activeTabId,
    setActiveTabId,
    addTab,
    updateTab,
    editorRef,
    runQuery,
    cancelQuery,
    runningTabs,
    showChatbot,
    chatWidth,
    setChatWidth,
    onCloseChatbot,
}: SqlModeProps) {
    const t = useTranslations('SqlConsole');
    const selectionByTab = useAtomValue(editorSelectionByTabAtom);
    const [editorSettings, setEditorSettings] = useAtom(sqlEditorSettingsAtom);
    const [saveDialogOpen, setSaveDialogOpen] = useState(false);
    const [savedQueries, setSavedQueries] = useState<SavedQueryItem[]>([]);
    const [queryLimit, setQueryLimit] = useState(editorSettings.queryLimit);
    const selection = activeTab?.tabId ? selectionByTab[activeTab.tabId] : null;
    const hasSelection = !!selection && selection.end > selection.start;
    const isRunning = runningTabs[activeTab?.tabId ?? ''] === 'running';
    const canSave = activeTab?.tabType === 'sql';
    const defaultSaveTitle = useMemo(() => activeTab?.tabName ?? t('Tabs.NewQuery'), [activeTab?.tabName, t]);
    const handleRunQuery = () => {
        if (!activeTab || isRunning) return;
        const options = hasSqlLimit ? undefined : { limit: queryLimit };
        runQuery(activeTab, options);
    };
    const handleLimitChange = (value: string) => {
        const next = Number(value);
        if (!Number.isFinite(next)) return;
        setQueryLimit(next);
        setEditorSettings(prev => normalizeSqlEditorSettings({ ...prev, queryLimit: next }));
    };
    const getSqlText = useCallback(
        () => editorRef.current?.getValue() ?? (activeTab?.tabType === 'sql' ? activeTab?.content ?? '' : ''),
        [activeTab?.tabType === 'sql' && activeTab?.content, activeTab?.tabType, editorRef],
    );
    const currentSqlText = getSqlText().trim();
    const hasSqlLimit = /\blimit\b/i.test(currentSqlText);
    const runLabel = hasSelection ? t('Toolbar.RunSelected') : t('Toolbar.Run');
    const runLabelWithLimit = hasSqlLimit ? `${runLabel} ( Limit: SQL )` : `${runLabel} ( Limit: ${queryLimit} )`;
    const isSaved = !!currentSqlText && savedQueries.some(q => q.sqlText.trim() === currentSqlText);

    const fetchSavedQueries = useCallback(async () => {
        try {
            const res = await authFetch('/api/sql-console/saved-queries');
            const data = await res.json().catch(() => null);
            if (!res.ok || (data && data.code !== 0)) return;
            setSavedQueries((data?.data ?? []) as SavedQueryItem[]);
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => {
        fetchSavedQueries();
    }, [fetchSavedQueries]);

    useEffect(() => {
        setQueryLimit(editorSettings.queryLimit);
    }, [editorSettings.queryLimit]);

    useEffect(() => {
        const handler = () => {
            fetchSavedQueries();
        };
        window.addEventListener('saved-queries-updated', handler);
        return () => {
            window.removeEventListener('saved-queries-updated', handler);
        };
    }, [fetchSavedQueries]);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const isSave = event.key.toLowerCase() === 's';
            const hasModifier = event.metaKey || event.ctrlKey;
            if (!isSave || !hasModifier) return;
            if (!canSave) return;
            event.preventDefault();
            setSaveDialogOpen(true);
        };
        window.addEventListener('keydown', handler);
        return () => {
            window.removeEventListener('keydown', handler);
        };
    }, [canSave]);

    return (

        <div className="flex flex-1 flex-col min-h-0 mr-10">
            <PanelGroup
                key={showChatbot ? 'sql-with-copilot' : 'sql-without-copilot'}
                direction="horizontal"
                className="h-full min-h-0"
                onLayout={sizes => {
                    const [, copilotSize] = sizes;
                    if (copilotSize > 5) setChatWidth(copilotSize);
                }}
            >
                <Panel
                    defaultSize={showChatbot ? 100 - chatWidth : 100}
                    minSize={40}
                    order={1}
                    className="min-h-0"
                >
                    <div className="flex h-full flex-col min-h-0">
                        <div className="flex items-center gap-2 p-2 border-b shrink-0">
                            <div className="flex items-center">
                                <Button
                                    disabled={isRunning}
                                    size="sm"
                                    className="gap-2 rounded-r-none cursor-pointer"
                                    onClick={handleRunQuery}
                                >
                                    {isRunning ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Play className="h-4 w-4" />
                                    )}
                                    {runLabelWithLimit}
                                </Button>

                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            size="sm"
                                            variant="default"
                                            className="rounded-l-none px-2 cursor-pointer"
                                            aria-label="Run options"
                                        >
                                            <ChevronDown className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start">
                                        <DropdownMenuItem disabled={isRunning} onSelect={handleRunQuery}>
                                            <Play className="h-4 w-4" />
                                            {runLabelWithLimit}
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuRadioGroup value={String(queryLimit)} onValueChange={handleLimitChange}>
                                            {SQL_EDITOR_QUERY_LIMIT_OPTIONS.map(option => (
                                                <DropdownMenuRadioItem key={option} value={String(option)}>
                                                    Limit {option}
                                                </DropdownMenuRadioItem>
                                            ))}
                                        </DropdownMenuRadioGroup>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>

                            {isRunning && activeTab ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-2"
                                    onClick={() => cancelQuery(activeTab)}
                                >
                                    <Square className="h-4 w-4" />
                                    {t('Toolbar.Stop')}
                                </Button>
                            ) : null}
                            <div className="flex-1" />
                            {isSaved ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Check className="h-4 w-4" />
                                    {t('Toolbar.Saved')}
                                </div>
                            ) : (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-2"
                                    onClick={() => setSaveDialogOpen(true)}
                                    disabled={!canSave}
                                >
                                    <Save className="h-4 w-4" />
                                    {t('Toolbar.SaveQuery')}
                                </Button>
                            )}
                        </div>

                        <PanelGroup
                            direction="vertical"
                            autoSaveId="sql-editor-v"
                            className="h-full min-h-0"
                        >
                            <Panel defaultSize={55} minSize={30} className="min-h-0">
                                <div className="flex flex-col h-full border-b min-h-0">
                                    <SQLEditor ref={editorRef} activeTab={activeTab} updateTab={updateTab} onRunQuery={handleRunQuery} />
                                </div>
                            </Panel>

                            <PanelResizeHandle className="h-1.5 bg-border data-[resize-handle-active=true]:bg-foreground/30 transition-colors" />

                            <Panel minSize={25} className="min-h-0">
                                <div className="flex h-full flex-col min-h-0">
                                    <ResultTable />
                                </div>
                            </Panel>
                        </PanelGroup>
                    </div>
                </Panel>

                <PanelResizeHandle
                    className={[
                        'w-1.5 bg-border data-[resize-handle-active=true]:bg-foreground/30 transition-colors',
                        showChatbot ? '' : 'hidden',
                    ].join(' ')}
                />

                <Panel
                    defaultSize={showChatbot ? chatWidth : 0}
                    minSize={showChatbot ? 30 : 0}
                    order={2}
                    className="min-h-0" // ✅
                >
                    {showChatbot ? (
                        <div className="flex h-full flex-col min-h-0 border-l bg-card">
                            <CopilotPanel
                                tabs={tabs}
                                activeTabId={activeTabId}
                                activeTab={activeTab}
                                updateTab={updateTab}
                                addTab={addTab}
                                setActiveTabId={setActiveTabId}
                                onClose={onCloseChatbot}
                                editorRef={editorRef}
                            />
                        </div>
                    ) : null}
                </Panel>
            </PanelGroup>
            <SaveSqlDialog
                open={saveDialogOpen}
                onOpenChange={setSaveDialogOpen}
                defaultTitle={defaultSaveTitle}
                getSqlText={getSqlText}
                onSaved={fetchSavedQueries}
            />
        </div>
    );
}

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { usePathname, useSearchParams } from 'next/navigation';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import { Check, ChevronDown, Loader2, Play, Save, Sparkles, Square } from 'lucide-react';
import { toast } from 'sonner';

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
import { DEFAULT_INLINE_SQL_ASK_STATE, editorSelectionByTabAtom, inlineSqlAskByTabAtom } from '../../sql-console.store';

import { ResultTable } from '../result-table/result-table';
import SQLEditor from '../sql-editor';
import CopilotPanel from '../copilot-panel';
import { SaveSqlDialog } from './save-sql-dialog';
import type { SqlModeProps } from './types';
import { authClient } from '@/lib/auth-client';
import { executeActionClient } from '@/lib/actions/client';
import { AuthLinkSheet } from '@/components/auth/auth-link-sheet';
import { isAnonymousUser } from '@/lib/auth/anonymous-user';
import { useTranslations } from 'next-intl';
import { normalizeSqlEditorSettings, SQL_EDITOR_QUERY_LIMIT_OPTIONS, sqlEditorSettingsAtom } from '@/shared/stores/sql-editor-settings.store';
import { activeDatabaseAtom, activeSchemaAtom, currentConnectionAtom } from '@/shared/stores/app.store';
import type { SavedQueryItem } from '../saved-queries/saved-queries-sidebar';
import { createCopilotSQLContextEnvelope } from '../../../chatbot/copilot/copilot-envelope';
import { useSqlInlineAskAI } from '../../hooks/useSqlInlineAskAI';
import { useRouteConnectionId } from '../../hooks/useRouteConnectionId';
import { normalizeSqlDialect } from '@/lib/sql/sql-dialect';
import { useTables } from '@/hooks/use-tables';
import { hasSelectLimit, type SelectLimitDialect } from '@dory/shared/utils/enforce-select-limit';

const isEditableShortcutTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;

    const tagName = target.tagName.toLowerCase();
    return (
        tagName === 'input' ||
        tagName === 'textarea' ||
        tagName === 'select' ||
        target.isContentEditable ||
        target.closest('[contenteditable="true"]') ||
        target.getAttribute('role') === 'textbox'
    );
};

const buildInlineAskSqlComment = (prompt: string) => {
    const commentText = prompt.replace(/\s+/g, ' ').replace(/--/g, '-').trim();
    return commentText ? `-- ${commentText}` : '';
};

const normalizeTableMetaName = (table: any) => {
    return String(table?.value ?? table?.label ?? table?.name ?? table?.tableName ?? table?.table ?? '').trim();
};

const resolveTableSchema = (table: any) => {
    const explicitSchema = typeof table?.schema === 'string' ? table.schema.trim() : '';
    if (explicitSchema) return explicitSchema;

    const tableName = normalizeTableMetaName(table);
    const parts = tableName.split('.');
    return parts.length > 1 ? parts[parts.length - 2]?.trim() || null : null;
};

const stripTableQualifier = (tableName: string) => {
    const parts = tableName.split('.');
    return parts[parts.length - 1]?.trim() || tableName.trim();
};

const escapeRegExp = (value: string) => {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const hasTableNameReference = (source: string, tableName: string) => {
    const trimmedName = tableName.trim();
    if (!trimmedName) return false;

    return new RegExp(`(^|[^A-Za-z0-9_$])${escapeRegExp(trimmedName)}([^A-Za-z0-9_$]|$)`, 'i').test(source);
};

const buildInlineAskCandidateTables = (prompt: string, editorSql: string, tables: any[], database: string | null, activeSchema: string | null) => {
    const source = `${prompt}\n${editorSql}`;
    const candidates = new Map<string, { database?: string | null; schema?: string | null; name: string }>();

    for (const table of tables) {
        const rawName = normalizeTableMetaName(table);
        if (!rawName) continue;

        const shortName = stripTableQualifier(rawName);
        const names = [rawName, shortName].filter(Boolean);
        if (!names.some(name => hasTableNameReference(source, name))) continue;

        const schema = resolveTableSchema(table) ?? activeSchema;
        const key = `${database ?? ''}:${schema ?? ''}:${shortName}`;
        if (candidates.has(key)) continue;

        candidates.set(key, {
            database,
            schema,
            name: shortName,
        });
    }

    return Array.from(candidates.values()).slice(0, 12);
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
    autoSelectLatestResultOnInitialLoad,
}: SqlModeProps) {
    const t = useTranslations('SqlConsole');
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { data: session } = authClient.useSession();
    const activeDatabase = useAtomValue(activeDatabaseAtom);
    const { tables } = useTables(activeDatabase);
    const selectionByTab = useAtomValue(editorSelectionByTabAtom);
    const activeSchema = useAtomValue(activeSchemaAtom);
    const [editorSettings, setEditorSettings] = useAtom(sqlEditorSettingsAtom);
    const [inlineAskByTab, setInlineAskByTab] = useAtom(inlineSqlAskByTabAtom);
    const [saveDialogOpen, setSaveDialogOpen] = useState(false);
    const [authSheetOpen, setAuthSheetOpen] = useState(false);
    const [savedQueries, setSavedQueries] = useState<SavedQueryItem[]>([]);
    const [queryLimit, setQueryLimit] = useState(editorSettings.queryLimit);
    const selection = activeTab?.tabId ? selectionByTab[activeTab.tabId] : null;
    const hasSelection = !!selection && selection.end > selection.start;
    const isRunning = runningTabs[activeTab?.tabId ?? ''] === 'running';
    const canSave = activeTab?.tabType === 'sql';
    const defaultSaveTitle = useMemo(() => activeTab?.tabName ?? t('Tabs.NewQuery'), [activeTab?.tabName, t]);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const routeConnectionId = useRouteConnectionId();
    const connectionId = routeConnectionId ?? currentConnection?.connection?.id ?? null;
    const currentRouteConnection = currentConnection?.connection?.id === connectionId ? currentConnection.connection : null;
    const limitDialect: SelectLimitDialect = currentRouteConnection?.type === 'sqlserver' ? 'sqlserver' : currentRouteConnection?.type === 'oracle' ? 'oracle' : 'default';
    const generateSqlFromPrompt = useSqlInlineAskAI();
    const handleRunQuery = () => {
        if (!activeTab || isRunning) return;
        const options = limitDialect === 'sqlserver' || limitDialect === 'oracle' || !hasSqlLimit ? { limit: queryLimit } : undefined;
        runQuery(activeTab, options);
    };
    const handleLimitChange = (value: string) => {
        const next = Number(value);
        if (!Number.isFinite(next)) return;
        setQueryLimit(next);
        setEditorSettings(prev => normalizeSqlEditorSettings({ ...prev, queryLimit: next }));
    };
    const getSqlText = useCallback(
        () => editorRef.current?.getValue() ?? (activeTab?.tabType === 'sql' ? (activeTab?.content ?? '') : ''),
        [activeTab?.tabType === 'sql' && activeTab?.content, activeTab?.tabType, editorRef],
    );
    const currentSqlText = getSqlText().trim();
    const hasSqlLimit = hasSelectLimit(currentSqlText, limitDialect);
    const runLabel = hasSelection ? t('Toolbar.RunSelected') : t('Toolbar.Run');
    const runLabelWithLimit = hasSqlLimit ? `${runLabel} ( Limit: SQL )` : `${runLabel} ( Limit: ${queryLimit} )`;
    const isSaved = !!currentSqlText && savedQueries.some(q => q.sqlText.trim() === currentSqlText);
    const isAnonymous = isAnonymousUser(session?.user);
    const callbackURL = useMemo(() => {
        const query = searchParams?.toString();
        return query ? `${pathname}?${query}` : pathname || '/';
    }, [pathname, searchParams]);
    const inlineAskState = activeTab?.tabType === 'sql' ? (inlineAskByTab[activeTab.tabId] ?? DEFAULT_INLINE_SQL_ASK_STATE) : DEFAULT_INLINE_SQL_ASK_STATE;

    const updateInlineAskState = useCallback(
        (patch: Partial<typeof DEFAULT_INLINE_SQL_ASK_STATE>) => {
            if (!activeTab || activeTab.tabType !== 'sql') return;

            setInlineAskByTab(prev => ({
                ...prev,
                [activeTab.tabId]: {
                    ...(prev[activeTab.tabId] ?? DEFAULT_INLINE_SQL_ASK_STATE),
                    ...patch,
                },
            }));
        },
        [activeTab, setInlineAskByTab],
    );

    const requestSave = useCallback(() => {
        if (!canSave) return;
        if (isAnonymous) {
            setAuthSheetOpen(true);
            return;
        }
        setSaveDialogOpen(true);
    }, [canSave, isAnonymous]);

    const fetchSavedQueries = useCallback(async () => {
        if (!connectionId) {
            setSavedQueries([]);
            return;
        }
        try {
            const data = await executeActionClient<{ savedQueries: SavedQueryItem[] }>('savedQuery.list', { connectionId }, { currentConnectionId: connectionId });
            setSavedQueries(data.savedQueries ?? []);
        } catch {
            // ignore
        }
    }, [connectionId]);

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
            event.preventDefault();
            requestSave();
        };
        window.addEventListener('keydown', handler);
        return () => {
            window.removeEventListener('keydown', handler);
        };
    }, [requestSave]);

    const handleOpenInlineAsk = useCallback(() => {
        updateInlineAskState({
            mode: 'ask-ai',
            promptDraft: '',
            errorMessage: null,
        });
    }, [updateInlineAskState]);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            const isAskShortcut = (event.key === '/' || event.code === 'Slash') && !event.metaKey && !event.ctrlKey && !event.altKey;
            if (!isAskShortcut) return;
            if (event.repeat) return;
            if (activeTab?.tabType !== 'sql') return;
            if (inlineAskState.mode === 'ask-ai') return;
            if (isEditableShortcutTarget(event.target)) return;

            event.preventDefault();
            handleOpenInlineAsk();
        };

        window.addEventListener('keydown', handler);
        return () => {
            window.removeEventListener('keydown', handler);
        };
    }, [activeTab?.tabType, handleOpenInlineAsk, inlineAskState.mode]);

    const handleCancelInlineAsk = useCallback(() => {
        if (inlineAskState.isGenerating) return;

        updateInlineAskState({
            mode: 'sql',
            errorMessage: null,
        });

        window.setTimeout(() => {
            editorRef.current?.focusAtEnd?.();
        }, 0);
    }, [editorRef, inlineAskState.isGenerating, updateInlineAskState]);

    const handleSubmitInlineAsk = useCallback(async () => {
        if (!activeTab || activeTab.tabType !== 'sql' || !connectionId) return;

        const prompt = inlineAskState.promptDraft.trim();
        if (!prompt) return;

        updateInlineAskState({
            isGenerating: true,
            errorMessage: null,
        });

        try {
            const editorSql = getSqlText();
            const copilotEnvelope = await createCopilotSQLContextEnvelope({
                editorText: editorSql,
                selection,
                baselineDatabase: activeDatabase || null,
                dialect: normalizeSqlDialect(currentConnection?.connection?.type),
                meta: {
                    tabId: activeTab.tabId,
                    tabName: activeTab.tabName,
                    connectionId,
                },
                updatedAt: Date.now(),
            });

            const generatedSql = await generateSqlFromPrompt({
                prompt,
                connectionId,
                connectionType: currentConnection?.connection?.type ?? null,
                database: activeDatabase || null,
                activeSchema: activeSchema || null,
                candidateTables: buildInlineAskCandidateTables(prompt, editorSql, tables, activeDatabase || null, activeSchema || null),
                tabId: activeTab.tabId,
                copilotEnvelope,
                errorMessage: t('InlineAsk.Errors.GenerateFailed'),
            });

            const promptComment = buildInlineAskSqlComment(prompt);
            const generatedBlock = [promptComment, generatedSql].filter(Boolean).join('\n');
            const nextSql = editorRef.current?.insertContentWithUndo?.(generatedBlock) ?? `${getSqlText()}${generatedBlock}`;
            editorRef.current?.flushSave?.();
            updateTab(activeTab.tabId, { content: nextSql }, { immediate: true });

            updateInlineAskState({
                mode: 'sql',
                isGenerating: false,
                lastPrompt: prompt,
                lastGeneratedSql: generatedBlock,
                errorMessage: null,
            });

            toast.success(t('InlineAsk.Success.Applied'));
        } catch (error) {
            const message = error instanceof Error && error.message.trim() ? error.message : t('InlineAsk.Errors.GenerateFailed');

            updateInlineAskState({
                isGenerating: false,
                errorMessage: message,
            });
        }
    }, [
        activeDatabase,
        activeSchema,
        activeTab,
        connectionId,
        currentConnection?.connection?.type,
        editorRef,
        generateSqlFromPrompt,
        getSqlText,
        inlineAskState.promptDraft,
        selection,
        tables,
        t,
        updateInlineAskState,
        updateTab,
    ]);

    return (
        <div className="flex flex-1 flex-col min-h-0 mr-10">
            <Group
                key={showChatbot ? 'sql-with-copilot' : 'sql-without-copilot'}
                orientation="horizontal"
                className="h-full min-h-0"
                onLayoutChange={(layout: Layout) => {
                    const copilotSize = layout['copilot-panel'];
                    if (copilotSize !== undefined && copilotSize > 5) setChatWidth(copilotSize);
                }}
            >
                <Panel id="main-panel" defaultSize={`${showChatbot ? 100 - chatWidth : 100}%`} minSize="40%" className="min-h-0">
                    <div className="flex h-full flex-col min-h-0">
                        <div className="flex items-center gap-2 p-2 border-b shrink-0">
                            {inlineAskState.mode === 'ask-ai' ? (
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        className="gap-2"
                                        onClick={() => void handleSubmitInlineAsk()}
                                        disabled={inlineAskState.isGenerating || !inlineAskState.promptDraft.trim()}
                                    >
                                        {inlineAskState.isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                        {t('InlineAsk.Submit')}
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={handleCancelInlineAsk} disabled={inlineAskState.isGenerating}>
                                        {t('Actions.Cancel')}
                                    </Button>
                                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-medium leading-none text-muted-foreground">Enter</kbd>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center">
                                        <Button disabled={isRunning} size="sm" className="gap-2 rounded-r-none cursor-pointer" onClick={handleRunQuery} data-testid="run-query">
                                            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                                            {runLabelWithLimit}
                                        </Button>

                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button size="sm" variant="default" className="rounded-l-none px-2 cursor-pointer" aria-label="Run options">
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
                                    <Button variant="secondary" size="sm" className="gap-2" onClick={handleOpenInlineAsk} aria-keyshortcuts="/">
                                        <Sparkles className="h-4 w-4" />
                                        {t('InlineAsk.Badge')}
                                    </Button>
                                </>
                            )}

                            {isRunning && activeTab ? (
                                <Button variant="outline" size="sm" className="gap-2" onClick={() => cancelQuery(activeTab)}>
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
                                <Button variant="outline" size="sm" className="gap-2" onClick={requestSave} disabled={!canSave}>
                                    <Save className="h-4 w-4" />
                                    {t('Toolbar.SaveQuery')}
                                </Button>
                            )}
                        </div>

                        <Group orientation="vertical" className="h-full min-h-0">
                            <Panel id="editor-panel" defaultSize="25%" minSize="15%" className="min-h-0">
                                <div className="flex flex-col h-full border-b min-h-0">
                                    <SQLEditor
                                        ref={editorRef}
                                        activeTab={activeTab}
                                        updateTab={updateTab}
                                        onRunQuery={handleRunQuery}
                                        onNewTab={() => void addTab({ activate: true })}
                                        onInlineAskOpen={handleOpenInlineAsk}
                                        inlineAskMode={inlineAskState.mode === 'ask-ai'}
                                        inlineAskPromptDraft={inlineAskState.promptDraft}
                                        inlineAskGenerating={inlineAskState.isGenerating}
                                        inlineAskErrorMessage={inlineAskState.errorMessage}
                                        onInlineAskPromptChange={value => {
                                            updateInlineAskState({
                                                promptDraft: value,
                                                errorMessage: null,
                                            });
                                        }}
                                        onInlineAskSubmit={() => void handleSubmitInlineAsk()}
                                        onInlineAskCancel={handleCancelInlineAsk}
                                    />
                                </div>
                            </Panel>

                            <Separator className="h-1.5 bg-border transition-colors" />

                            <Panel id="result-panel" minSize="25%" className="min-h-0">
                                <div className="flex h-full flex-col min-h-0">
                                    <ResultTable autoSelectLatestResultOnInitialLoad={autoSelectLatestResultOnInitialLoad} />
                                </div>
                            </Panel>
                        </Group>
                    </div>
                </Panel>

                <Separator className={['w-1.5 bg-border transition-colors', showChatbot ? '' : 'hidden'].join(' ')} />

                <Panel id="copilot-panel" defaultSize={`${showChatbot ? chatWidth : 0}%`} minSize={`${showChatbot ? 30 : 0}%`} className="min-h-0">
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
            </Group>
            <SaveSqlDialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen} defaultTitle={defaultSaveTitle} getSqlText={getSqlText} onSaved={fetchSavedQueries} />
            <AuthLinkSheet open={authSheetOpen} onOpenChange={setAuthSheetOpen} callbackURL={callbackURL} />
        </div>
    );
}

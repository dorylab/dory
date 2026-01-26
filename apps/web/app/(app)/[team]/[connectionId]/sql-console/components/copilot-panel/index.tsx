'use client';

import React, { useMemo, useState, Activity, useCallback, useEffect } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { Loader2, X } from 'lucide-react';

import { useChatSessions } from '../../../chatbot/core/session-controller';
import type { CopilotEnvelopeV1 } from '../../../chatbot/copilot/types/copilot-envelope';
import { createCopilotFixInputFromExecution, createCopilotSQLContextEnvelope } from '../../../chatbot/copilot/copilot-envelope';
import type { CopilotFixInput } from '../../../chatbot/copilot/types/copilot-fix-input';
import type { ActionIntent, ActionResult } from '@/lib/copilot/action/types';
import { useSqlCopilotExecutor } from '../../hooks/useSqlCopilotExecutor';
import type { UITabPayload } from '@/types/tabs';
import { useTranslations } from 'next-intl';

import { Button } from '@/registry/new-york-v4/ui/button';
import { activeDatabaseAtom, currentConnectionAtom } from '@/shared/stores/app.store';
import { currentSessionMetaAtom } from '../result-table/stores/result-table.atoms';
import { copilotActionRequestAtom, editorSelectionByTabAtom } from '../../sql-console.store';
import type { SQLEditorHandle } from '../sql-editor';
import AskTab, { type ActionsState } from './ask';
import ContextTab from './context';

// ✅ shadcn Tabs
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/registry/new-york-v4/ui/tabs';
import { ActionTab } from './action/ui';

type CopilotPanelProps = {
    tabs: UITabPayload[];
    activeTabId?: string;
    activeTab?: UITabPayload;
    updateTab: (tabId: string, patch: Partial<UITabPayload>, options?: { immediate?: boolean }) => void;
    addTab: (payload?: { tabName?: string; content?: string; activate?: boolean }) => Promise<string>;
    setActiveTabId: (tabId: string) => void;
    onClose?: () => void;
    editorRef?: React.MutableRefObject<SQLEditorHandle | null>;
};

type SubTabKey = 'ask' | 'action' | 'context';

export default function CopilotPanel({
    tabs,
    activeTabId,
    activeTab,
    updateTab,
    addTab,
    setActiveTabId,
    onClose,
    editorRef,
}: CopilotPanelProps) {
    const t = useTranslations('SqlConsole');
    const activeDatabase = useAtomValue(activeDatabaseAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const sessionMeta = useAtomValue(currentSessionMetaAtom);
    const selectionByTab = useAtomValue(editorSelectionByTabAtom);
    const [actionRequest, setActionRequest] = useAtom(copilotActionRequestAtom);

    const [subTab, setSubTab] = useState<SubTabKey>('ask');
    const [actionsState, setActionsState] = useState<ActionsState | null>(null);
    const activeTabCoreFields = activeTab
        ? {
            tabId: activeTab.tabId,
            tabName: activeTab.tabName,
            tabType: activeTab.tabType,
            connectionId: activeTab.connectionId,
            databaseName: (activeTab as any)?.databaseName,
            tableName: (activeTab as any)?.tableName,
        }
        : null;

    const onExecuteAction = useSqlCopilotExecutor({
        tabs,
        activeTabId: activeTabId ?? '',
        updateTab,
        addTab,
        setActiveTabId,
    });

    const sqlTextFromResult = typeof (sessionMeta as any)?.sqlText === 'string' ? (sessionMeta as any).sqlText : '';
    const sessionErrorMessage = (sessionMeta as any)?.errorMessage ?? null;
    const sessionErrorCode = (sessionMeta as any)?.errorCode ?? null;
    const sessionFinishedAt = (sessionMeta as any)?.finishedAt ?? null;
    const sessionStartedAt = (sessionMeta as any)?.startedAt ?? null;

    const tabId = activeTab?.tabId;
    const tabName = activeTab?.tabName;
    const tabType = (activeTab as any)?.tabType; 
    const tabConnectionId = (activeTab as any)?.connectionId;
    const tabContent = (activeTab as any)?.content ?? '';
    const editorSelection = tabId ? (selectionByTab[tabId] ?? null) : null;

    
    const isSqlTab = tabType === 'sql';

    const copilotEnvelope: CopilotEnvelopeV1 | null = useMemo(() => {
        if (!tabId || !tabType) return null;
        if (tabType !== 'sql') return null;

        const connectionId = tabConnectionId ?? currentConnection?.connection.id ?? undefined;
        const editorSqlText = typeof tabContent === 'string' ? tabContent : '';

        const lastUpdatedAt = sessionFinishedAt ?? sessionStartedAt ?? undefined;

        return createCopilotSQLContextEnvelope({
            editorText: editorSqlText || '',
            selection: editorSelection,
            baselineDatabase: activeDatabase || null,
            dialect: (currentConnection as any)?.connection?.type ?? 'unknown',
            updatedAt: lastUpdatedAt ?? undefined,
            meta: {
                tabId,
                tabName,
                connectionId,
            },
        });
    }, [
        tabId,
        tabType,
        tabConnectionId,
        activeDatabase,
        currentConnection?.connection.id,
        (currentConnection as any)?.connection?.type,
        sessionFinishedAt,
        sessionStartedAt,
        tabContent,
        tabName,
        editorSelection,
    ]);

    const actionInput: CopilotFixInput | null = useMemo(() => {
        if (!sqlTextFromResult) return null;

        const hasErrorMessage = typeof sessionErrorMessage === 'string' && !!sessionErrorMessage.trim();

        return createCopilotFixInputFromExecution({
            sql: sqlTextFromResult,
            error: hasErrorMessage
                ? {
                    message: sessionErrorMessage!,
                    code: sessionErrorCode ?? null,
                }
                : null,
            database: activeDatabase || null,
            dialect: (currentConnection as any)?.connection?.type ?? undefined,
            occurredAt: sessionFinishedAt ?? sessionStartedAt ?? undefined,
            meta: {
                tabId,
                tabName,
                connectionId: tabConnectionId ?? currentConnection?.connection.id ?? undefined,
            },
        });
    }, [
        sqlTextFromResult,
        sessionErrorMessage,
        sessionErrorCode,
        activeDatabase,
        currentConnection?.connection.id,
        sessionFinishedAt,
        sessionStartedAt,
        tabId,
        tabName,
        tabConnectionId,
    ]);

    type ApplySqlMeta = { intent?: ActionIntent; risk?: ActionResult['risk']; originalSql?: string; operation?: 'apply' | 'undo' };

    const applySqlToEditor = useCallback(
        (sql: string, meta?: ApplySqlMeta) => {
            if (!activeTab || activeTab.tabType !== 'sql') return;

            const previousSql =
                (editorRef?.current?.getValue?.() as string | undefined) ??
                (typeof tabContent === 'string' ? tabContent : '');

            const currentSql = previousSql ?? '';
            const originalSql = meta?.originalSql;

            // Try to patch only the executed statement instead of replacing the whole editor.
            const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const computeNextSql = () => {
                if (!originalSql) return sql;

                const directIdx = currentSql.indexOf(originalSql);
                if (directIdx !== -1) {
                    return currentSql.slice(0, directIdx) + sql + currentSql.slice(directIdx + originalSql.length);
                }

                const trimmed = originalSql.trim().replace(/;+\s*$/, '');
                if (trimmed) {
                    const regex = new RegExp(escapeRegExp(trimmed) + '\\s*;?', 'm');
                    const match = regex.exec(currentSql);
                    if (match) {
                        return currentSql.slice(0, match.index) + sql + currentSql.slice(match.index + match[0].length);
                    }
                }

                return sql;
            };

            const nextSql = computeNextSql();

            const handle = editorRef?.current;
            if (handle?.applyContentWithUndo) {
                handle.applyContentWithUndo(nextSql);
                handle.flushSave?.();
            } else if (activeTabId) {
                updateTab(activeTabId, { content: nextSql }, { immediate: true });
            }

            return { previousSql };
        },
        [activeTab, activeTabId, editorRef, tabContent, updateTab],
    );

    const handleActionExecuted = useCallback(({ intent }: { intent: ActionIntent; result: ActionResult }) => {
        const at = new Date().toISOString();
        setActionsState(prev => ({
            activeAction: intent ?? prev?.activeAction ?? null,
            lastEvent: { type: 'action_generated', at, actionKey: intent },
        }));
    }, []);

    const handleApplySqlWithEvent = useCallback(
        async (sql: string, meta?: ApplySqlMeta) => {
            const res = await applySqlToEditor(sql, meta);
            if (!activeTab || activeTab.tabType !== 'sql') return res;

            const at = new Date().toISOString();
            setActionsState(prev => {
                const activeAction = meta?.intent ?? prev?.activeAction ?? null;
                const eventType = meta?.operation === 'undo' ? 'action_undone' : 'action_applied';
                return {
                    activeAction,
                    lastEvent: {
                        type: eventType,
                        at,
                        actionKey: activeAction ?? undefined,
                    },
                };
            });

            return res;
        },
        [activeTab, applySqlToEditor],
    );

    const chat = useChatSessions({
        mode: 'copilot',
        copilotEnvelope,
    });

    const loading = chat.loadingSessions || (chat.loadingMessages && !chat.selectedSessionId);

    useEffect(() => {
        setActionsState(null);
    }, [activeTabId]);

    useEffect(() => {
        if (actionRequest?.id) {
            setSubTab('action');
        }
    }, [actionRequest?.id]);

    return (
        <div className="flex h-full min-h-0 flex-col border-t">
            <div className="flex-1 min-h-0">
                {!activeTab ? (
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">{t('Copilot.Panel.NoSqlTab')}</div>
                ) : !isSqlTab ? (
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                        {t('Copilot.Panel.UnsupportedTab', { type: String(tabType) })}
                    </div>
                ) : loading ? (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                ) : (
                    <Tabs value={subTab} onValueChange={v => setSubTab(v as SubTabKey)} className="flex h-full min-h-0 flex-col">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <TabsList className="h-8">
                                <TabsTrigger value="ask" className="h-7 px-3 text-xs">
                                    {t('Copilot.Panel.TabAsk')}
                                </TabsTrigger>
                                <TabsTrigger value="action" className="h-7 px-3 text-xs">
                                    {t('Copilot.Panel.TabAction')}
                                </TabsTrigger>
                                <TabsTrigger value="context" className="h-7 px-3 text-xs">
                                    {t('Copilot.Panel.TabContext')}
                                </TabsTrigger>
                            </TabsList>
                            {onClose ? (
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}>
                                    <X className="h-4 w-4" />
                                </Button>
                            ) : null}
                        </div>

                        {/* Ask */}
                        <TabsContent value="ask" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden" forceMount>
                            <Activity mode={subTab === 'ask' ? 'visible' : 'hidden'}>
                                <AskTab
                                    chat={chat}
                                    copilotEnvelope={copilotEnvelope}
                                    actionsState={actionsState}
                                    onExecuteAction={onExecuteAction}
                                    onGoToActions={() => setSubTab('action')}
                                />
                            </Activity>
                        </TabsContent>

                        {/* Action */}
                        <TabsContent value="action" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden" forceMount>
                            <Activity mode={subTab === 'action' ? 'visible' : 'hidden'}>
                                <ActionTab
                                    input={actionInput}
                                    onApplySql={handleApplySqlWithEvent}
                                    onExecuted={handleActionExecuted}
                                    autoRun={actionRequest ? { intent: actionRequest.intent, requestId: actionRequest.id } : null}
                                    onAutoRunHandled={(requestId) => {
                                        setActionRequest(prev => (prev?.id === requestId ? null : prev));
                                    }}
                                />
                            </Activity>
                        </TabsContent>

                        {/* Context */}
                        <TabsContent value="context" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden" forceMount>
                            <Activity mode={subTab === 'context' ? 'visible' : 'hidden'}>
                                <ContextTab copilotEnvelope={copilotEnvelope} sessionMeta={sessionMeta} activeTabCoreFields={activeTabCoreFields} />
                            </Activity>
                        </TabsContent>
                    </Tabs>
                )}
            </div>
        </div>
    );
}

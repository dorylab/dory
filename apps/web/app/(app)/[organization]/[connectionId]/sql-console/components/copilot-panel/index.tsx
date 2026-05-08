'use client';

import React, { useMemo, useState, Activity, useCallback, useEffect } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { X } from 'lucide-react';

import { useChatSessions } from '../../../chatbot/core/session-controller';
import type { CopilotEnvelopeV1 } from '../../../chatbot/copilot/types/copilot-envelope';
import { createCopilotFixInputFromExecution, createCopilotSQLContextEnvelope } from '../../../chatbot/copilot/copilot-envelope';
import type { CopilotResultSetContext } from '../../../chatbot/copilot/types/copilot-context-sql';
import type { CopilotFixInput } from '../../../chatbot/copilot/types/copilot-fix-input';
import type { ActionIntent, ActionResult } from '@/lib/copilot/action/types';
import { useSqlCopilotExecutor } from '../../hooks/useSqlCopilotExecutor';
import type { UITabPayload } from '@/types/tabs';
import { useTranslations } from 'next-intl';

import { Button } from '@/registry/new-york-v4/ui/button';
import { activeDatabaseAtom, currentConnectionAtom } from '@/shared/stores/app.store';
import { currentSessionMetaAtom } from '../result-table/stores/result-table.atoms';
import { copilotPromptRequestAtom } from '../result-table/stores/copilot-prompt.atoms';
import { copilotActionRequestAtom, copilotAnalysisRequestAtom, copilotPanelTabAtom, editorSelectionByTabAtom } from '../../sql-console.store';
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

export default function CopilotPanel({ tabs, activeTabId, activeTab, updateTab, addTab, setActiveTabId, onClose, editorRef }: CopilotPanelProps) {
    const t = useTranslations('SqlConsole');
    const activeDatabase = useAtomValue(activeDatabaseAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const sessionMeta = useAtomValue(currentSessionMetaAtom);
    const selectionByTab = useAtomValue(editorSelectionByTabAtom);
    const [actionRequest, setActionRequest] = useAtom(copilotActionRequestAtom);
    const [analysisRequest, setAnalysisRequest] = useAtom(copilotAnalysisRequestAtom);
    const [promptRequest, setPromptRequest] = useAtom(copilotPromptRequestAtom);
    const [panelTab, setPanelTab] = useAtom(copilotPanelTabAtom);

    const [subTab, setSubTab] = useState<SubTabKey>(panelTab === 'ask' || panelTab === 'context' ? panelTab : 'action');
    const [actionsState, setActionsState] = useState<ActionsState | null>(null);
    const [copilotEnvelope, setCopilotEnvelope] = useState<CopilotEnvelopeV1 | null>(null);
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
    const resultSetContext = useMemo<CopilotResultSetContext | null>(() => {
        if (!sessionMeta || !(sessionMeta as any)?.sessionId) return null;

        return {
            sessionId: (sessionMeta as any).sessionId ?? null,
            setIndex: (sessionMeta as any).setIndex ?? null,
            title: (sessionMeta as any).title ?? null,
            sqlText: typeof (sessionMeta as any).sqlText === 'string' ? (sessionMeta as any).sqlText : null,
            status: (sessionMeta as any).status ?? null,
            rowCount: (sessionMeta as any).rowCount ?? null,
            limited: (sessionMeta as any).limited ?? null,
            limit: (sessionMeta as any).limit ?? null,
            durationMs: (sessionMeta as any).durationMs ?? null,
            columns: (sessionMeta as any).columns ?? null,
            stats: (sessionMeta as any).stats ?? null,
            aiProfileVersion: (sessionMeta as any).aiProfileVersion ?? null,
        };
    }, [sessionMeta]);

    const tabId = activeTab?.tabId;
    const tabName = activeTab?.tabName;
    const tabType = (activeTab as any)?.tabType;
    const tabConnectionId = (activeTab as any)?.connectionId;
    const tabContent = (activeTab as any)?.content ?? '';
    const editorSelection = tabId ? (selectionByTab[tabId] ?? null) : null;

    const isSqlTab = tabType === 'sql';

    useEffect(() => {
        if (!tabId || !tabType || tabType !== 'sql') {
            setCopilotEnvelope(null);
            return;
        }

        let cancelled = false;

        const connectionId = tabConnectionId ?? currentConnection?.connection.id ?? undefined;
        const editorSqlText = typeof tabContent === 'string' ? tabContent : '';
        const lastUpdatedAt = sessionFinishedAt ?? sessionStartedAt ?? undefined;

        void (async () => {
            const nextEnvelope = await createCopilotSQLContextEnvelope({
                editorText: editorSqlText || '',
                selection: editorSelection,
                baselineDatabase: activeDatabase || null,
                dialect: (currentConnection as any)?.connection?.type ?? 'unknown',
                resultSet: resultSetContext,
                updatedAt: lastUpdatedAt ?? undefined,
                meta: {
                    tabId,
                    tabName,
                    connectionId,
                },
            });

            if (!cancelled) {
                setCopilotEnvelope(nextEnvelope);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [
        tabId,
        tabType,
        tabConnectionId,
        activeDatabase,
        currentConnection?.connection.id,
        (currentConnection as any)?.connection?.type,
        sessionFinishedAt,
        sessionStartedAt,
        resultSetContext,
        tabContent,
        tabName,
        editorSelection,
    ]);

    const activeCopilotEnvelope = useMemo(() => {
        if (!isSqlTab || !tabId) return null;
        return copilotEnvelope?.meta?.tabId === tabId ? copilotEnvelope : null;
    }, [copilotEnvelope, isSqlTab, tabId]);

    const actionInput: CopilotFixInput | null = useMemo(() => {
        const hasErrorMessage = typeof sessionErrorMessage === 'string' && !!sessionErrorMessage.trim();
        const selectedSql =
            editorSelection && typeof tabContent === 'string' && editorSelection.end > editorSelection.start ? tabContent.slice(editorSelection.start, editorSelection.end) : '';
        const editorSql = selectedSql.trim() ? selectedSql : typeof tabContent === 'string' ? tabContent : '';
        const sourceSql = sqlTextFromResult.trim() ? sqlTextFromResult : editorSql;

        if (!sourceSql.trim()) return null;

        // Prefer the last executed SQL when available, but allow editor-triggered actions
        // to run against the current draft on the first click.
        return createCopilotFixInputFromExecution({
            sql: sourceSql,
            error:
                sqlTextFromResult.trim() && hasErrorMessage
                    ? {
                          message: sessionErrorMessage!,
                          code: sessionErrorCode ?? null,
                      }
                    : null,
            database: activeDatabase || null,
            dialect: (currentConnection as any)?.connection?.type ?? undefined,
            occurredAt: sqlTextFromResult.trim() ? (sessionFinishedAt ?? sessionStartedAt ?? undefined) : undefined,
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
        tabContent,
        editorSelection,
    ]);

    const autoRunRequest = useMemo(() => {
        if (!actionRequest || !actionInput) return null;

        if (actionRequest.intent === 'fix-sql-error') {
            return actionInput.lastExecution.error?.message ? actionRequest : null;
        }

        return actionInput.lastExecution.sql.trim() ? actionRequest : null;
    }, [actionInput, actionRequest]);

    type ApplySqlMeta = { intent?: ActionIntent; risk?: ActionResult['risk']; originalSql?: string; operation?: 'apply' | 'undo' };

    const applySqlToEditor = useCallback(
        (sql: string, meta?: ApplySqlMeta) => {
            if (!activeTab || activeTab.tabType !== 'sql') return;

            const previousSql = (editorRef?.current?.getValue?.() as string | undefined) ?? (typeof tabContent === 'string' ? tabContent : '');

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
        copilotEnvelope: activeCopilotEnvelope,
    });

    useEffect(() => {
        setActionsState(null);
    }, [activeTabId]);

    useEffect(() => {
        if (actionRequest?.id) {
            setSubTab('action');
        }
    }, [actionRequest?.id]);

    useEffect(() => {
        if (promptRequest?.id) {
            setSubTab('ask');
        }
    }, [promptRequest?.id]);

    useEffect(() => {
        if (analysisRequest?.id) {
            setSubTab('action');
        }
    }, [analysisRequest?.id]);

    useEffect(() => {
        if (panelTab !== subTab) {
            setPanelTab(subTab);
        }
    }, [panelTab, setPanelTab, subTab]);

    return (
        <div className="flex h-full min-h-0 flex-col border-t">
            <div className="flex-1 min-h-0">
                {!activeTab ? (
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">{t('Copilot.Panel.NoSqlTab')}</div>
                ) : !isSqlTab ? (
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                        {t('Copilot.Panel.UnsupportedTab', { type: String(tabType) })}
                    </div>
                ) : (
                    <Tabs
                        value={subTab}
                        onValueChange={v => {
                            const next = v as SubTabKey;
                            setSubTab(next);
                            setPanelTab(next);
                        }}
                        className="flex h-full min-h-0 flex-col"
                    >
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

                        <div className="relative min-h-0 flex-1 overflow-hidden">
                            {/* Ask */}
                            <TabsContent value="ask" className="absolute inset-0 mt-0 min-h-0 data-[state=inactive]:pointer-events-none data-[state=inactive]:invisible" forceMount>
                                <Activity mode={subTab === 'ask' ? 'visible' : 'hidden'}>
                                    <AskTab
                                        chat={chat}
                                        copilotEnvelope={activeCopilotEnvelope}
                                        actionsState={actionsState}
                                        initialPrompt={activeCopilotEnvelope ? (promptRequest?.prompt ?? null) : null}
                                        onInitialPromptConsumed={() => {
                                            if (!promptRequest?.id) return;
                                            setPromptRequest(prev => (prev?.id === promptRequest.id ? null : prev));
                                        }}
                                        onExecuteAction={onExecuteAction}
                                        onGoToActions={() => setSubTab('action')}
                                    />
                                </Activity>
                            </TabsContent>

                            {/* Action */}
                            <TabsContent
                                value="action"
                                className="absolute inset-0 mt-0 min-h-0 data-[state=inactive]:pointer-events-none data-[state=inactive]:invisible"
                                forceMount
                            >
                                <Activity mode={subTab === 'action' ? 'visible' : 'hidden'}>
                                    <ActionTab
                                        input={actionInput}
                                        onApplySql={handleApplySqlWithEvent}
                                        onExecuted={handleActionExecuted}
                                        autoRun={autoRunRequest ? { intent: autoRunRequest.intent, requestId: autoRunRequest.id } : null}
                                        onAutoRunHandled={requestId => {
                                            setActionRequest(prev => (prev?.id === requestId ? null : prev));
                                        }}
                                        analysisRequestId={analysisRequest?.id ?? null}
                                        tabId={activeTabId}
                                        connectionId={tabConnectionId ?? currentConnection?.connection.id ?? null}
                                        databaseName={activeDatabase || null}
                                    />
                                </Activity>
                            </TabsContent>

                            {/* Context */}
                            <TabsContent
                                value="context"
                                className="absolute inset-0 mt-0 min-h-0 data-[state=inactive]:pointer-events-none data-[state=inactive]:invisible"
                                forceMount
                            >
                                <Activity mode={subTab === 'context' ? 'visible' : 'hidden'}>
                                    <ContextTab copilotEnvelope={activeCopilotEnvelope} sessionMeta={sessionMeta} activeTabCoreFields={activeTabCoreFields} />
                                </Activity>
                            </TabsContent>
                        </div>
                    </Tabs>
                )}
            </div>
        </div>
    );
}

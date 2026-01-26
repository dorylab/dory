'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { useAtom, useAtomValue } from 'jotai';
import type { StickToBottomContext } from 'use-stick-to-bottom';
import type { CopilotEnvelopeV1 } from '../copilot/types/copilot-envelope';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import type { SqlResultManualExecutionMode } from '@/components/@dory/ui/ai/sql-result/type';

import {
    Conversation,
    ConversationContent,
    ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Loader } from '@/components/ai-elements/loader';

import {
    PromptInput,
    PromptInputBody,
    PromptInputSubmit,
    PromptInputTextarea,
    PromptInputFooter,
    type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';

import { AssistantFallbackCard } from '@/components/@dory/ui/ai/assistant-fallback';

import { activeDatabaseAtom, currentConnectionAtom } from '@/shared/stores/app.store';
import { useDatabases } from '@/hooks/use-databases';
import { useTables } from '@/hooks/use-tables';

import MessageRenderer from './message-render';
import { TableMentionTextarea } from './table-mention-textarea';
import { getSqlResultFromPart, getChartResultFromPart } from '../core/utils';
import { DatabasesSelect } from '../../../components/schema-sidebar/databases-select/databases-select';
import { CopilotActionExecutor } from '../copilot/action-bridge';
import { apiGetOrCreateCopilotSession } from '../core/api';

type ChatBotCompProps = {
    sessionId?: string | null;
    initialMessages: UIMessage[];
    onConversationActivity?: () => void;
    onSessionCreated?: (sessionId: string) => void;

    mode?: 'global' | 'copilot';
    copilotEnvelope?: CopilotEnvelopeV1 | null;
    onExecuteAction?: CopilotActionExecutor;
};

const ChatBotComp = ({
    sessionId,
    initialMessages,
    onConversationActivity,
    onSessionCreated,
    mode = 'global',
    copilotEnvelope = null,
    onExecuteAction,
}: ChatBotCompProps) => {
    const router = useRouter();
    const params = useParams<{ team: string; connectionId: string }>();
    const t = useTranslations('Chatbot');

    const [input, setInput] = useState('');
    const [webSearch, setWebSearch] = useState(false);
    const restoredSessionRef = useRef<string | null>(null);
    const scrollPositionsRef = useRef<Map<string, number>>(new Map());
    const stickToBottomContextRef = useRef<StickToBottomContext | null>(null);

    const [activeDatabase, setActiveDatabase] = useAtom(activeDatabaseAtom);
    const currentConnection = useAtomValue(currentConnectionAtom);

    const { databases } = useDatabases();
    const { tables } = useTables(activeDatabase);


    const [selectedTable, setSelectedTable] = useState<string>('');

    const tabId = mode === 'copilot' ? copilotEnvelope?.meta?.tabId ?? 'unknown' : null;
    const chatStateId = mode === 'copilot' ? `copilot:${tabId}` : (sessionId ?? 'global');

    const { messages, sendMessage, status, error, setMessages } = useChat({
        id: chatStateId,
    });

    const appliedInitialRef = useRef<string | null>(null);
    const sessionRef = useRef<string>(chatStateId);
    const activityRef = useRef(false);

    const hasAssistantContent = messages.some((m) => {
        if (m.role !== 'assistant') return false;
        if (!Array.isArray((m as any).parts)) return false;

        return (m as any).parts.some((part: any) => {
            if (part.type === 'text' && part.text?.trim()) return true;
            if (getSqlResultFromPart(part)) return true;
            if (getChartResultFromPart(part)) return true;
            return false;
        });
    });

    const showGlobalLoader = status === 'submitted' || (status === 'streaming' && !hasAssistantContent);

    useEffect(() => {
        if (sessionRef.current !== chatStateId) {
            sessionRef.current = chatStateId;
            appliedInitialRef.current = null;
        }

        const key = initialMessages.map((message) => message.id).join('|');
        if (appliedInitialRef.current !== key) {
            setMessages(initialMessages);
            appliedInitialRef.current = key;
        }
    }, [chatStateId, initialMessages, setMessages]);

    useEffect(() => {
        if (status === 'submitted' || status === 'streaming') {
            activityRef.current = true;
        } else if (status === 'ready' && activityRef.current) {
            activityRef.current = false;
            onConversationActivity?.();
        }
    }, [status, onConversationActivity]);

    const handleStickToBottomContextRef = useCallback((context: StickToBottomContext | null) => {
        stickToBottomContextRef.current = context;
    }, []);

    const saveScrollPosition = useCallback((id: string) => {
        const scrollElement = stickToBottomContextRef.current?.scrollRef?.current;
        if (!scrollElement) return;
        scrollPositionsRef.current.set(id, scrollElement.scrollTop);
    }, []);

    const restoreScrollPosition = useCallback(() => {
        const context = stickToBottomContextRef.current;
        const scrollElement = context?.scrollRef?.current;
        if (!context || !scrollElement) return;

        const savedScrollTop = scrollPositionsRef.current.get(chatStateId);
        const distanceToBottom =
            scrollElement.scrollHeight - scrollElement.clientHeight - (savedScrollTop ?? 0);

        if (savedScrollTop !== undefined) {
            scrollElement.scrollTop = savedScrollTop;

            if (distanceToBottom <= 4) {
                context.scrollToBottom('instant');
            } else {
                context.stopScroll();
            }
            return;
        }

        context.scrollToBottom('instant');
    }, [chatStateId]);

    useEffect(() => {
        const sessionIdForCleanup = chatStateId;
        return () => {
            saveScrollPosition(sessionIdForCleanup);
        };
    }, [chatStateId, saveScrollPosition]);

    useEffect(() => {
        if (restoredSessionRef.current === chatStateId) return;

        const raf = requestAnimationFrame(() => {
            restoreScrollPosition();
            restoredSessionRef.current = chatStateId;
        });

        return () => cancelAnimationFrame(raf);
    }, [chatStateId, messages, restoreScrollPosition]);

    const handleCopySql = useCallback(async (sql: string) => {
        try {
            await navigator.clipboard.writeText(sql);
        } catch (error) {
            console.error(t('Errors.CopySqlFailed'), error);
        }
    }, [t]);

    const handleManualExecute = useCallback(
        ({
            sql,
            database,
            mode,
        }: {
            sql: string;
            database: string | null;
            mode?: SqlResultManualExecutionMode;
        }) => {
            try {
                const payload: {
                    sql: string;
                    database: string | null;
                    mode?: SqlResultManualExecutionMode;
                    createdAt: number;
                } = {
                    sql,
                    database,
                    createdAt: Date.now(),
                };
                if (mode) {
                    payload.mode = mode;
                }
                localStorage.setItem('chatbot:pending-sql', JSON.stringify(payload));
            } catch (error) {
                console.error(t('Errors.CacheSqlFailed'), error);
            }
            const team = params?.team;
            const connectionIdTarget = params?.connectionId ?? currentConnection?.connection.id;
            const targetPath =
                team && connectionIdTarget ? `/${team}/${connectionIdTarget}/sql-console` : '/sql-console';
            router.push(targetPath);
        },
        [router, t, params, currentConnection],
    );

    const handleDatabaseChange = (db: string) => {
        setActiveDatabase(db);
        setSelectedTable('');
    };

    const handleSubmit = async (message: PromptInputMessage) => {
        const hasText = Boolean(message.text);
        const hasAttachments = Boolean(message.files?.length);
        if (!(hasText || hasAttachments)) return;

        const tabId = mode === 'copilot' ? copilotEnvelope?.meta?.tabId ?? null : null;
        if (mode === 'copilot' && !tabId) return;
        const connectionId = copilotEnvelope?.meta?.connectionId ?? currentConnection?.connection.id ?? null;

        const databaseForContext =
            mode === 'copilot'
                ? copilotEnvelope?.surface === 'sql'
                    ? copilotEnvelope.context.baseline.database ?? activeDatabase ?? null
                    : copilotEnvelope?.context.database ?? activeDatabase ?? null
                : activeDatabase || null;

        const tableForContext =
            mode === 'copilot'
                ? copilotEnvelope?.surface === 'table'
                    ? copilotEnvelope.context.table.name ?? null
                    : null
                : selectedTable || null;

        let chatIdForRequest = sessionId ?? null;
        if (mode === 'copilot' && !chatIdForRequest) {
            try {
                const session = await apiGetOrCreateCopilotSession({
                    envelope: copilotEnvelope ?? null,
                    errorMessage: t('Errors.FetchCopilotSession'),
                });
                chatIdForRequest = session.id;
                onSessionCreated?.(session.id);
            } catch (err: any) {
                console.error('[chat] create copilot session failed', err);
                toast.error(err?.message || t('Errors.CreateCopilotSession'));
                return;
            }
        }

        sendMessage(
            { text: message.text || t('Input.SentWithAttachments'), files: message.files },
            {
                body: {
                    webSearch,
                    database: databaseForContext,
                    table: tableForContext,
                    connectionId,
                    mode,
                    tabId,
                    copilotEnvelope,
                    chatId: chatIdForRequest,
                },
            },
        );

        setInput('');
    };

    return (
        <div className="relative flex h-full w-full flex-col p-4">
            <Conversation
                className="flex-1 min-h-0"
                contextRef={handleStickToBottomContextRef}

            >
                <ConversationContent>
                    {messages.map((message, messageIndex) => (
                        <MessageRenderer
                            key={message.id}
                            message={message as any}
                            messageIndex={messageIndex}
                            messages={messages as any}
                            status={status}
                            mode={mode}
                            onCopySql={handleCopySql}
                            onManualExecute={handleManualExecute}
                            onExecuteAction={onExecuteAction}
                        />
                    ))}

                    {error && <AssistantFallbackCard key="global-error" reason={error.message} />}
                    {showGlobalLoader && <Loader />}
                </ConversationContent>

                <ConversationScrollButton />
            </Conversation>

            <div className="mt-4">
                <PromptInput onSubmit={handleSubmit} className="mt-1" globalDrop multiple>
                    <PromptInputBody>
                        <div className="flex flex-col gap-2 w-full">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex flex-1 items-center gap-2">
                                    {mode === 'global' && (
                                        <DatabasesSelect
                                            className="w-auto max-w-80 border-0 shadow-none text-xs outline-0 focus-visible:ring-0"
                                            value={activeDatabase}
                                            databases={databases}
                                            onChange={handleDatabaseChange}
                                        />
                                    )}
                                </div>
                            </div>

                            <div className="flex items-start gap-2 w-full">
                                {mode === 'global' ? (
                                    <TableMentionTextarea value={input} onChange={setInput} tables={tables.map((t) => (t as any).name ?? t)}>
                                        <PromptInputTextarea
                                            placeholder={t('Input.GlobalPlaceholder')}
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            className="min-h-18 w-full resize-none border-0 bg-transparent text-sm focus-visible:outline-none focus-visible:ring-0"
                                        />
                                    </TableMentionTextarea>
                                ) : (
                                    <PromptInputTextarea
                                        placeholder={t('Input.CopilotPlaceholder')}
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        className="min-h-18 w-full resize-none border-0 bg-transparent text-sm focus-visible:outline-none focus-visible:ring-0"
                                    />
                                )}
                            </div>
                        </div>
                    </PromptInputBody>

                    <PromptInputFooter className='justify-end'>
                        <PromptInputSubmit
                            status={status}
                            disabled={!input || status === 'submitted' || status === 'streaming'}
                        />
                    </PromptInputFooter>
                </PromptInput>
            </div>
        </div>
    );
};

export default ChatBotComp;

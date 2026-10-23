'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/registry/new-york-v4/ui/button';
import { useChat } from '@ai-sdk/react';
import type { AnalysisScope, WorkDocumentSummary, WorkDocumentView } from '@dory/shared/types/work-document';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { parseAsArrayOf, parseAsJson, parseAsString, useQueryStates } from 'nuqs';
import { z } from 'zod';

import { workRequest } from '@/lib/work-documents/client';
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { PromptInput, PromptInputBody, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from '@/components/ai-elements/prompt-input';
import { Suggestion } from '@/components/ai-elements/suggestion';
import { apiFetchSessionDetail } from '@/app/(app)/[organization]/[connectionId]/chatbot/core/api';
import type { ChatSessionItem } from '@/app/(app)/[organization]/[connectionId]/chatbot/core/types';
import MessageRenderer from '@/app/(app)/[organization]/[connectionId]/chatbot/thread/message-render';

import { AgentScopePicker, useAgentDatabases, type AgentConnection, type AgentKnowledge } from './agent-scope-picker';
import { AgentSessionSidebar } from './agent-session-sidebar';
import { WorkReport } from './work-report';

type AgentSession = ChatSessionItem & { connectionId: string | null; activeDatabase?: string | null; scope: AnalysisScope | null };
type Options = { connections: AgentConnection[]; models: AgentKnowledge[]; sessions: AgentSession[] };
const databaseSelections = z.record(z.string(), z.string().min(1));
const emptyConnections: AgentConnection[] = [];

function sessionScope(session?: AgentSession): AnalysisScope {
    const scope = session?.scope ?? { connectionIds: session?.connectionId ? [session.connectionId] : [] };
    if (!scope.databasesByConnection && session?.connectionId && session.activeDatabase && scope.connectionIds.includes(session.connectionId)) {
        return { ...scope, databasesByConnection: { [session.connectionId]: session.activeDatabase } };
    }
    return scope;
}

export function DataAgent() {
    const { organization } = useParams<{ organization: string }>();
    const t = useTranslations('WorkDocuments');
    const [state, setState] = useQueryStates({
        chat: parseAsString,
        document: parseAsString,
        sources: parseAsArrayOf(parseAsString),
        knowledge: parseAsString,
        databases: parseAsJson(databaseSelections.parse),
    });
    const [newId, setNewId] = useState(() => crypto.randomUUID());
    const [busy, setBusy] = useState(false);
    const options = useQuery({ queryKey: ['data-agent', organization], queryFn: () => workRequest<Options>('/api/data-agent') });
    const openDocument = useQuery({
        queryKey: ['work-document', organization, state.document],
        enabled: Boolean(state.document),
        queryFn: () => workRequest<{ document: WorkDocumentView }>(`/api/work-documents/${state.document}`),
    });
    const chatId = state.chat ?? openDocument.data?.document.chatId ?? newId;
    const session = options.data?.sessions.find(item => item.id === chatId);
    const savedScope = openDocument.data?.document.scope ?? sessionScope(session);
    const selectedScope: AnalysisScope =
        state.sources !== null
            ? { connectionIds: state.sources, knowledgeModelId: state.knowledge, databasesByConnection: state.databases ?? undefined }
            : { ...savedScope, knowledgeModelId: state.knowledge ?? savedScope.knowledgeModelId, databasesByConnection: state.databases ?? savedScope.databasesByConnection };
    const databases = useAgentDatabases(organization, options.data?.connections ?? emptyConnections, selectedScope);
    const scope = databases.scope;
    const history = useQuery({ queryKey: ['agent-history', organization, chatId], queryFn: () => apiFetchSessionDetail(chatId), enabled: chatId !== newId });
    const reports = useQuery({
        queryKey: ['work-documents', organization, chatId],
        queryFn: () => workRequest<{ documents: WorkDocumentSummary[] }>(`/api/work-documents?chatId=${encodeURIComponent(chatId)}`),
        refetchInterval: busy ? 1500 : false,
    });
    const [prompt, setPrompt] = useState<{ id: string; text: string } | null>(null);
    const [editingReport, setEditingReport] = useState(false);
    const observedReports = useRef<{ chatId: string; ids: Set<string> } | null>(null);
    useEffect(() => {
        if (!reports.data) return;
        const previous = observedReports.current;
        const created = previous?.chatId === chatId ? reports.data.documents.find(item => !previous.ids.has(item.id)) : null;
        observedReports.current = { chatId, ids: new Set(reports.data.documents.map(item => item.id)) };
        if (created && !editingReport) void setState({ chat: chatId, document: created.id });
    }, [reports.data, chatId, editingReport, setState]);
    const scopeState = (value: AnalysisScope) => ({ sources: value.connectionIds, knowledge: value.knowledgeModelId ?? null, databases: value.databasesByConnection ?? {} });
    const newChat = () => {
        if (busy || editingReport) return;
        setPrompt(null);
        setNewId(crypto.randomUUID());
        void setState({ chat: null, document: null, ...scopeState(scope) });
    };
    // Opening a newly created draft must not unmount the streaming conversation.
    const loading = (chatId !== newId && history.isPending) || (Boolean(state.document) && !state.chat && openDocument.isPending);
    const error = options.error ?? history.error ?? openDocument.error;
    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground md:flex-row md:rounded-xl" data-testid="data-agent">
            <AgentSessionSidebar
                organization={organization}
                sessions={options.data?.sessions ?? []}
                loading={options.isPending}
                chatId={chatId}
                disabled={busy || editingReport}
                onCreate={newChat}
                onRefresh={() => void options.refetch()}
                onSelect={id => {
                    if (busy || editingReport) return;
                    setPrompt(null);
                    void setState({ chat: id, document: null, ...scopeState(sessionScope(options.data?.sessions.find(item => item.id === id))) });
                }}
            />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
                <main className={state.document ? 'flex min-h-80 min-w-0 flex-1 flex-col lg:w-2/5' : 'flex min-h-0 min-w-0 flex-1 flex-col'}>
                    {error ? (
                        <p role="alert" className="p-4 text-sm text-destructive">
                            {error.message}
                        </p>
                    ) : null}
                    {loading ? (
                        <p className="p-6">{t('Loading')}</p>
                    ) : (
                        <AgentConversation
                            key={chatId}
                            chatId={chatId}
                            initialMessages={history.data?.messages ?? []}
                            scope={scope}
                            documentId={state.document}
                            prompt={prompt}
                            blocked={editingReport}
                            ready={databases.ready && !options.isError}
                            onBusy={setBusy}
                            onFinished={() => {
                                void setState({ chat: chatId });
                            }}
                            onCreateReport={() => setPrompt({ id: crypto.randomUUID(), text: t('CreatePrompt') })}
                            scopePicker={
                                <AgentScopePicker
                                    connections={options.data?.connections ?? emptyConnections}
                                    models={options.data?.models ?? []}
                                    scope={scope}
                                    databases={databases}
                                    disabled={busy || editingReport || options.isPending}
                                    onChange={value => {
                                        if (!busy && !editingReport) void setState(scopeState(value));
                                    }}
                                />
                            }
                            reportLinks={
                                reports.data?.documents.length ? (
                                    <div className="flex flex-wrap gap-2 pb-3">
                                        {reports.data.documents.map(item => (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="max-w-full truncate"
                                                key={item.id}
                                                disabled={busy || editingReport}
                                                onClick={() => void setState({ document: item.id })}
                                            >
                                                {item.title}
                                            </Button>
                                        ))}
                                    </div>
                                ) : null
                            }
                        />
                    )}
                </main>
                {state.document ? (
                    <div className="min-h-96 min-w-0 flex-1 border-t lg:w-3/5 lg:border-l lg:border-t-0">
                        <WorkReport
                            key={state.document}
                            documentId={state.document}
                            busy={busy}
                            onEditingChange={setEditingReport}
                            onContinue={text => setPrompt({ id: crypto.randomUUID(), text })}
                        />
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function AgentConversation({
    chatId,
    initialMessages,
    scope,
    documentId,
    prompt,
    blocked,
    ready,
    scopePicker,
    reportLinks,
    onBusy,
    onFinished,
    onCreateReport,
}: {
    chatId: string;
    initialMessages: UIMessage[];
    scope: AnalysisScope;
    documentId: string | null;
    prompt: { id: string; text: string } | null;
    blocked: boolean;
    ready: boolean;
    scopePicker: ReactNode;
    reportLinks: ReactNode;
    onBusy: (busy: boolean) => void;
    onFinished: () => void;
    onCreateReport: () => void;
}) {
    const t = useTranslations('WorkDocuments');
    const chatT = useTranslations('Chatbot');
    const client = useQueryClient();
    const { organization } = useParams<{ organization: string }>();
    const [text, setText] = useState('');
    const lastPrompt = useRef<string | null>(null);
    const sendLock = useRef(false);
    const { messages, sendMessage, status, error, stop } = useChat({
        id: chatId,
        messages: initialMessages,
        onFinish: () => {
            onFinished();
            void client.invalidateQueries({ queryKey: ['data-agent', organization] });
            void client.invalidateQueries({ queryKey: ['agent-history', organization, chatId] });
            void client.invalidateQueries({ queryKey: ['work-documents', organization] });
            void client.invalidateQueries({ queryKey: ['work-document', organization] });
        },
    });
    const busy = status === 'submitted' || status === 'streaming';
    useEffect(() => {
        onBusy(busy);
    }, [busy, onBusy]);
    const submit = useCallback(
        (value: string) => {
            if (!value.trim() || busy || blocked || !ready || sendLock.current) return;
            sendLock.current = true;
            onBusy(true);
            void sendMessage({ text: value }, { body: { chatId, analysisScope: scope, documentId } }).finally(() => {
                sendLock.current = false;
                onBusy(false);
            });
            setText('');
        },
        [busy, blocked, ready, scope, sendMessage, chatId, documentId, onBusy],
    );
    useEffect(() => {
        if (prompt && prompt.id !== lastPrompt.current && !busy && !blocked && ready) {
            lastPrompt.current = prompt.id;
            submit(prompt.text);
        }
    }, [prompt, busy, blocked, ready, submit]);
    const empty = !messages.length;
    return (
        <div className={`flex min-h-0 flex-1 flex-col p-4 ${empty ? 'justify-center overflow-y-auto' : ''}`}>
            {empty ? (
                <div className="mx-auto mb-8 flex w-full max-w-2xl flex-col items-center gap-8">
                    <div className="flex flex-col items-center gap-2 text-center">
                        <div className="flex items-center gap-2">
                            <Sparkles className="size-6 shrink-0 text-primary" />
                            <h1 className="text-2xl font-semibold tracking-tight">{chatT('Welcome.Heading')}</h1>
                        </div>
                        <p className="text-sm text-muted-foreground">{t('AgentDescription')}</p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                        {['AnomalyPrompt', 'ComparePrompt', 'ReportPrompt'].map(key => (
                            <Suggestion key={key} suggestion={t(key)} onClick={setText} disabled={blocked || busy} />
                        ))}
                    </div>
                </div>
            ) : (
                <Conversation className="min-h-0 flex-1">
                    <ConversationContent className="mx-auto w-full max-w-5xl gap-2 px-2 pb-6 pt-2 lg:px-4 lg:pt-4">
                        {messages.map((message, index) => (
                            <MessageRenderer
                                key={message.id}
                                message={message}
                                messageIndex={index}
                                messages={messages}
                                status={status}
                                onCopySql={sql => navigator.clipboard.writeText(sql)}
                            />
                        ))}
                    </ConversationContent>
                    <ConversationScrollButton aria-label={t('LatestMessages')} />
                </Conversation>
            )}
            <div key="composer" className={`mx-auto w-full shrink-0 ${empty ? 'max-w-2xl' : 'mt-4 max-w-5xl'}`}>
                {error ? (
                    <p role="alert" className="mb-3 text-sm text-destructive">
                        {error.message}
                    </p>
                ) : null}
                {reportLinks}
                <PromptInput onSubmit={message => submit(message.text)}>
                    <PromptInputBody>
                        <PromptInputTextarea
                            aria-label={t('Question')}
                            placeholder={t('Question')}
                            value={text}
                            onChange={event => setText(event.target.value)}
                            disabled={blocked}
                            className="min-h-24 w-full resize-none border-0 bg-transparent text-sm focus-visible:ring-0"
                        />
                    </PromptInputBody>
                    <PromptInputFooter className="justify-between">
                        <Button type="button" variant="ghost" size="sm" onClick={onCreateReport} disabled={busy || blocked || !ready || empty}>
                            {t('CreateWork')}
                        </Button>
                        <PromptInputSubmit
                            status={status}
                            onStop={() => void stop()}
                            aria-label={busy ? t('Stop') : t('Send')}
                            disabled={!busy && (!text.trim() || !ready || blocked)}
                        />
                    </PromptInputFooter>
                </PromptInput>
                {scopePicker}
            </div>
        </div>
    );
}

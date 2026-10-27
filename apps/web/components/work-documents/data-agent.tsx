'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Popover, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';
import { useChat } from '@ai-sdk/react';
import type { AnalysisScope, WorkDocumentSummary, WorkDocumentView } from '@dory/shared/types/work-document';
import type { AgentWorkSummary } from '@dory/shared/types/agent-work';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getChatCompletion } from '@/lib/ai/chat-response-state';
import type { UIMessage } from 'ai';
import { ListTree, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { parseAsArrayOf, parseAsInteger, parseAsJson, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { databaseSelectionsSchema } from '@/lib/work-documents/schema';

import { workRequest } from '@/lib/work-documents/client';
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { AgentComposer } from './agent-composer';
import { AgentMessageReports } from './agent-message-reports';
import type { ChatSubmission } from '@/lib/chat-context/types';
import { Suggestion } from '@/components/ai-elements/suggestion';
import { apiFetchSessionDetail } from '@/app/(app)/[organization]/[connectionId]/chatbot/core/api';
import type { ChatSessionItem } from '@/app/(app)/[organization]/[connectionId]/chatbot/core/types';
import MessageRenderer from '@/app/(app)/[organization]/[connectionId]/chatbot/thread/message-render';

import { AgentArtifactPreview, AgentQueryPreview } from './agent-resource-preview';
import { AgentResources } from './agent-resources';
import { AgentScopePicker, useAgentDatabases, type AgentConnection, type AgentKnowledge } from './agent-scope-picker';
import { AgentSessionSidebar, useAgentWorkActions, WorkActionDialog, WorkMenu, WorkMetadata, WorkTitle } from './agent-session-sidebar';
import { WorkReport, type WorkReportHandle } from './work-report';

const WorkShareDialog = dynamic(() => import('./work-share-dialog').then(module => module.WorkShareDialog), { ssr: false });

type AgentSession = ChatSessionItem & { connectionId: string | null; activeDatabase?: string | null; scope: AnalysisScope | null };
type Options = { connections: AgentConnection[]; models: AgentKnowledge[]; sessions: AgentSession[]; works?: AgentWorkSummary[] };
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
        revision: parseAsInteger,
        panel: parseAsStringLiteral(['resources', 'report', 'query', 'artifact', 'closed'] as const),
        queryRun: parseAsString,
        querySession: parseAsString,
        artifact: parseAsString,
        resourcePage: parseAsInteger.withDefault(0),
        sources: parseAsArrayOf(parseAsString),
        knowledge: parseAsString,
        connectionMode: parseAsStringLiteral(['auto', 'manual'] as const),
        knowledgeMode: parseAsStringLiteral(['auto', 'manual', 'none'] as const),
        databases: parseAsJson(databaseSelectionsSchema.parse),
    });
    const [newId, setNewId] = useState(() => crypto.randomUUID());
    const [busy, setBusy] = useState(false);
    const [sharing, setSharing] = useState(false);
    const options = useQuery({
        queryKey: ['data-agent', organization],
        queryFn: () => workRequest<Options>('/api/data-agent'),
        refetchInterval: query => (busy || query.state.data?.works?.some(work => work.status === 'running' || work.titlePending) ? 1500 : false),
    });
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
    selectedScope.connectionMode =
        state.connectionMode ??
        (state.sources !== null ? (state.sources.length ? 'manual' : 'auto') : savedScope.connectionMode) ??
        (selectedScope.connectionIds.length ? 'manual' : 'auto');
    selectedScope.knowledgeMode = state.knowledgeMode ?? savedScope.knowledgeMode ?? (selectedScope.knowledgeModelId ? 'manual' : 'auto');
    if (selectedScope.connectionMode === 'auto') selectedScope.connectionIds = [];
    if (selectedScope.knowledgeMode !== 'manual') selectedScope.knowledgeModelId = null;
    const databases = useAgentDatabases(organization, options.data?.connections ?? emptyConnections, selectedScope);
    const scope = databases.scope;
    const history = useQuery({ queryKey: ['agent-history', organization, chatId], queryFn: () => apiFetchSessionDetail(chatId), enabled: chatId !== newId });
    const reports = useQuery({
        queryKey: ['work-documents', organization, chatId],
        queryFn: () => workRequest<{ documents: WorkDocumentSummary[] }>(`/api/work-documents?chatId=${encodeURIComponent(chatId)}`),
        refetchInterval: busy ? 1500 : false,
    });
    const [prompt, setPrompt] = useState<ChatSubmission | null>(null);
    const [editingReport, setEditingReport] = useState(false);
    const [liveMessages, setLiveMessages] = useState<UIMessage[]>([]);
    const reportRef = useRef<WorkReportHandle>(null);
    const resourcesButton = useRef<HTMLButtonElement>(null);
    const panel = state.panel ?? (state.document ? 'report' : 'closed');
    const navigatePanel = async (
        next: 'resources' | 'report' | 'query' | 'artifact' | 'closed',
        target: { document?: string; queryRun?: string; querySession?: string; artifact?: string } = {},
    ) => {
        if (reportRef.current && !(await reportRef.current.requestLeave())) return false;
        await setState({
            panel: next,
            queryRun: null,
            querySession: null,
            artifact: null,
            resourcePage: 0,
            ...target,
            ...(target.document ? { chat: chatId, ...(target.document !== state.document ? { revision: null } : {}) } : {}),
        });
        return true;
    };
    const scopeState = (value: AnalysisScope) => ({
        connectionMode: value.connectionMode ?? (value.connectionIds.length ? ('manual' as const) : ('auto' as const)),
        knowledgeMode: value.knowledgeMode ?? (value.knowledgeModelId ? ('manual' as const) : ('auto' as const)),
        sources: value.connectionIds,
        knowledge: value.knowledgeModelId ?? null,
        databases: value.databasesByConnection ?? {},
    });
    const newChat = () => {
        if (busy || editingReport) return;
        setPrompt(null);
        setLiveMessages([]);
        setNewId(crypto.randomUUID());
        void setState({
            chat: null,
            document: null,
            revision: null,
            panel: null,
            queryRun: null,
            querySession: null,
            artifact: null,
            resourcePage: 0,
            ...scopeState({ connectionIds: [], connectionMode: 'auto', knowledgeMode: 'auto' }),
        });
    };
    const works: AgentWorkSummary[] =
        options.data?.works ??
        (options.data?.sessions ?? []).map(item => ({
            id: item.id,
            title: item.title ?? null,
            titlePending: false,
            status: 'idle',
            updatedAt: item.updatedAt ?? item.createdAt ?? new Date().toISOString(),
            counts: { report: 0, chart: 0, result: 0 },
            outputs: [],
        }));
    const savedWork = works.find(item => item.id === chatId);
    const lastMessage = (liveMessages.length ? liveMessages : (history.data?.messages ?? [])).at(-1);
    const latestCompletion = lastMessage?.role === 'assistant' ? getChatCompletion(lastMessage) : undefined;
    const currentWork = savedWork
        ? {
              ...savedWork,
              ...(busy
                  ? { status: 'running' as const }
                  : latestCompletion
                    ? { status: latestCompletion.status === 'aborted' ? ('stopped' as const) : latestCompletion.status }
                    : {}),
          }
        : undefined;
    const actions = useAgentWorkActions(organization, chatId, newChat);
    const workT = useTranslations('WorkDocuments.Works');
    // Opening a newly created draft must not unmount the streaming conversation.
    const loading = (chatId !== newId && history.isPending) || (Boolean(state.document) && !state.chat && openDocument.isPending);
    const error = options.error ?? history.error ?? openDocument.error;
    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground md:flex-row md:rounded-xl" data-testid="data-agent">
            <AgentSessionSidebar
                works={works.map(item => (item.id === chatId && busy ? { ...item, status: 'running' as const } : item))}
                loading={options.isPending}
                chatId={chatId}
                disabled={busy || editingReport}
                onCreate={newChat}
                actions={actions}
                onSelect={id => {
                    if (busy || editingReport) return;
                    setPrompt(null);
                    setLiveMessages([]);
                    void setState({
                        chat: id,
                        document: null,
                        revision: null,
                        panel: null,
                        queryRun: null,
                        querySession: null,
                        artifact: null,
                        resourcePage: 0,
                        ...scopeState(sessionScope(options.data?.sessions.find(item => item.id === id))),
                    });
                }}
            />
            <Popover open={panel !== 'closed'} onOpenChange={open => void navigatePanel(open ? 'resources' : 'closed')}>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3" data-testid="work-header">
                        <div className="min-w-0">
                            <h1 className="truncate text-base font-semibold">
                                <WorkTitle work={currentWork} />
                            </h1>
                            {currentWork ? (
                                <p className="mt-1 text-xs text-muted-foreground" role="status">
                                    <WorkMetadata work={currentWork} />
                                </p>
                            ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            <PopoverTrigger asChild>
                                <Button
                                    ref={resourcesButton}
                                    variant="ghost"
                                    size="sm"
                                    title={t('Resources.Title')}
                                    aria-label={t('Resources.Title')}
                                    aria-expanded={panel !== 'closed'}
                                >
                                    <ListTree className="size-5" />
                                    <span className="hidden sm:inline">{workT('Outputs')}</span>
                                </Button>
                            </PopoverTrigger>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={!currentWork || busy}
                                onClick={async () => {
                                    if (await navigatePanel('closed')) setSharing(true);
                                }}
                            >
                                {workT('Share')}
                            </Button>
                            {currentWork ? <WorkMenu work={currentWork} actions={actions} disabled={busy || editingReport || actions.mutation.isPending} /> : null}
                        </div>
                    </header>
                    <div className="flex min-h-0 min-w-0 flex-1">
                        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
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
                                    sourceNames={Object.fromEntries((options.data?.connections ?? []).map(connection => [connection.id, connection.name]))}
                                    documentId={state.document}
                                    prompt={prompt}
                                    blocked={editingReport}
                                    ready={databases.ready && !options.isError}
                                    onBusy={setBusy}
                                    onFinished={() => {
                                        void setState({ chat: chatId });
                                    }}
                                    reports={reports.data?.documents ?? []}
                                    onOpenReport={id => void navigatePanel('report', { document: id })}
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
                                    onMessages={setLiveMessages}
                                />
                            )}
                        </main>
                        <AgentResources
                            key={chatId}
                            activeDocumentId={state.document}
                            open={panel !== 'closed'}
                            detailVisible={panel === 'report' || panel === 'query' || panel === 'artifact'}
                            editing={editingReport}
                            reports={reports.data?.documents ?? []}
                            messages={liveMessages.length ? liveMessages : (history.data?.messages ?? [])}
                            busy={busy}
                            loading={reports.isPending}
                            error={reports.error}
                            onRetry={() => void reports.refetch()}
                            onSelect={id => void navigatePanel('report', { document: id })}
                            onSelectQuery={(queryRun, querySession) => void navigatePanel('query', { queryRun, querySession })}
                            onSelectArtifact={artifact => void navigatePanel('artifact', { artifact })}
                            onBack={() => void navigatePanel('resources')}
                            onClose={() => void navigatePanel('closed')}
                            onRestoreFocus={() => resourcesButton.current?.focus()}
                        >
                            {panel === 'query' && state.queryRun && state.querySession ? (
                                <AgentQueryPreview key={`${state.queryRun}:${state.querySession}`} workId={state.queryRun} sessionId={state.querySession} />
                            ) : null}
                            {panel === 'artifact' && state.artifact ? (
                                <AgentArtifactPreview
                                    key={state.artifact}
                                    artifactId={state.artifact}
                                    page={Math.max(0, state.resourcePage)}
                                    onPageChange={resourcePage => void setState({ resourcePage })}
                                />
                            ) : null}
                            {state.document && panel === 'report' ? (
                                <WorkReport
                                    ref={reportRef}
                                    key={state.document}
                                    documentId={state.document}
                                    busy={busy}
                                    onEditingChange={setEditingReport}
                                    onContinue={text => setPrompt({ id: crypto.randomUUID(), text, files: [] })}
                                />
                            ) : null}
                        </AgentResources>
                    </div>
                </div>
            </Popover>
            <WorkActionDialog actions={actions} disabled={busy || editingReport} />
            {sharing && currentWork ? <WorkShareDialog key={chatId} work={currentWork} onClose={() => setSharing(false)} /> : null}
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
    sourceNames,
    onMessages,
    onBusy,
    onFinished,
    reports,
    onOpenReport,
}: {
    chatId: string;
    initialMessages: UIMessage[];
    scope: AnalysisScope;
    documentId: string | null;
    prompt: ChatSubmission | null;
    blocked: boolean;
    ready: boolean;
    scopePicker: ReactNode;
    sourceNames: Record<string, string>;
    onMessages: (messages: UIMessage[]) => void;
    onBusy: (busy: boolean) => void;
    onFinished: () => void;
    reports: WorkDocumentSummary[];
    onOpenReport: (id: string) => void;
}) {
    const t = useTranslations('WorkDocuments');
    const chatT = useTranslations('Chatbot');
    const client = useQueryClient();
    const { organization } = useParams<{ organization: string }>();
    const [text, setText] = useState('');
    const lastPrompt = useRef<string | null>(null);
    const sendLock = useRef(false);
    const sendFailed = useRef(false);
    const { messages, sendMessage, status, error, stop } = useChat({
        id: chatId,
        messages: initialMessages,
        onError: () => {
            sendFailed.current = true;
        },
        onFinish: () => {
            onFinished();
            void client.invalidateQueries({ queryKey: ['data-agent', organization] });
            void client.invalidateQueries({ queryKey: ['agent-resource-run', organization] });
            void client.invalidateQueries({ queryKey: ['agent-history', organization, chatId] });
            void client.invalidateQueries({ queryKey: ['work-documents', organization] });
            void client.invalidateQueries({ queryKey: ['work-document', organization] });
        },
    });
    useEffect(() => {
        onMessages(messages);
    }, [messages, onMessages]);
    const busy = status === 'submitted' || status === 'streaming';
    useEffect(() => {
        onBusy(busy);
    }, [busy, onBusy]);
    const submit = useCallback(
        async (message: ChatSubmission) => {
            if (busy || blocked || !ready || sendLock.current) return false;
            sendLock.current = true;
            sendFailed.current = false;
            onBusy(true);
            try {
                const metadata = {
                    references: message.references ?? [],
                    mentionSpans: message.mentionSpans,
                    outputIntent: message.outputIntent ?? 'answer',
                    sourceMessageId: message.sourceMessageId,
                };
                await sendMessage(
                    {
                        id: message.id ?? crypto.randomUUID(),
                        messageId: message.id && messages.some(item => item.id === message.id) ? message.id : undefined,
                        role: 'user',
                        parts: [{ type: 'text', text: message.text }, ...message.files],
                        metadata,
                    },
                    { body: { chatId, analysisScope: scope, documentId, ...metadata } },
                );
                return !sendFailed.current;
            } finally {
                sendLock.current = false;
                onBusy(false);
            }
        },
        [busy, blocked, ready, scope, sendMessage, chatId, documentId, onBusy, messages],
    );
    useEffect(() => {
        if (prompt && prompt.id !== lastPrompt.current && !busy && !blocked && ready) {
            lastPrompt.current = prompt.id ?? null;
            void submit(prompt);
        }
    }, [prompt, busy, blocked, ready, submit]);
    const runIds = [
        ...new Set(
            messages.flatMap(message => {
                const metadata = message.metadata as { agentRunId?: string } | undefined;
                return metadata?.agentRunId ? [metadata.agentRunId] : [];
            }),
        ),
    ];
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
                            <div key={message.id}>
                                <MessageRenderer
                                    message={message}
                                    messageIndex={index}
                                    messages={messages}
                                    status={status}
                                    showRunLinks={false}
                                    onOpenReport={onOpenReport}
                                    onContinue={messageId => {
                                        if (busy || blocked || !ready || sendLock.current) return;
                                        sendLock.current = true;
                                        void sendMessage({ text: t('ContinueUnfinished') }, { body: { chatId, analysisScope: scope, resumeMessageId: messageId } }).finally(() => {
                                            sendLock.current = false;
                                        });
                                    }}
                                    onCopySql={sql => navigator.clipboard.writeText(sql)}
                                />
                                <AgentMessageReports message={message} messages={messages} reports={reports} busy={busy} onOpen={onOpenReport} />
                            </div>
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
                <AgentComposer
                    text={text}
                    onTextChange={setText}
                    onSubmit={submit}
                    onStop={() => void stop()}
                    scope={scope}
                    sourceNames={sourceNames}
                    chatId={chatId}
                    runIds={runIds}
                    busy={busy}
                    disabled={blocked}
                    ready={ready}
                    toolbar={scopePicker}
                />
            </div>
        </div>
    );
}

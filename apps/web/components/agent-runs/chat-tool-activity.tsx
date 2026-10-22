'use client';

import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { chatToolActivityState, mergeChatToolActivities, type ChatMessageTool, type ChatToolActivity, type ChatToolState } from '@/lib/agent-runs/chat-tool-activity';
import { getAgentActivityTitleKey, type AgentRunEventLike } from '@/lib/agent-runs/summary';
import { SqlResultBody, SqlStatementBlock } from '@/components/@dory/ui/ai/sql-result';
import type { SqlResultBodyProps } from '@/components/@dory/ui/ai/sql-result/type';
import { Tool, ToolContent, ToolHeader } from '@/components/ai-elements/tool';

export type ChatMessageToolRow = ChatMessageTool & {
    title: string;
    state: ChatToolState;
    content: ReactNode;
    input?: unknown;
    output?: unknown;
    noResults?: boolean;
};

type SqlActions = {
    onCopySql: (sql: string) => Promise<void> | void;
    onManualExecute: SqlResultBodyProps['onManualExecute'];
};

type SnapshotResponse = {
    data: {
        snapshot: {
            sessions: Array<{
                session: { sessionId: string; sqlText: string; database: string | null; status: string; durationMs?: number | null; errorMessage?: string | null };
                queryResultSets: Array<{ columns: Array<{ name: string; type?: string | null }> | null; rowCount: number | null; limited?: boolean | null }>;
                results: unknown[][];
            }>;
        };
    };
};

function SavedSqlDetail({ workId, sessionId, open, onCopySql, onManualExecute }: SqlActions & { workId: string; sessionId: string; open: boolean }) {
    const t = useTranslations('AgentRuns');
    const { data, isPending, isError } = useQuery({
        queryKey: ['chat-tool-sql-snapshot', workId, sessionId],
        enabled: open,
        staleTime: 60_000,
        queryFn: async ({ signal }) => {
            const response = await fetch(`/api/works/${encodeURIComponent(workId)}/snapshot`, { signal });
            if (!response.ok) throw new Error('Unable to load SQL evidence');
            const body: SnapshotResponse = await response.json();
            return body.data.snapshot.sessions.find(item => item.session.sessionId === sessionId) ?? null;
        },
    });
    if (isPending) return <p className="text-muted-foreground">{t('Chat.Loading')}</p>;
    if (isError || !data) return <p className="text-muted-foreground">{t('Chat.ResultUnavailable')}</p>;
    const set = data.queryResultSets[0];
    const rows = (data.results[0] ?? []).filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)));
    return (
        <div className="space-y-3">
            <SqlStatementBlock sql={data.session.sqlText} onCopy={onCopySql} />
            <SqlResultBody
                embedded
                onManualExecute={onManualExecute}
                result={{
                    type: 'sql-result',
                    ok: data.session.status === 'success',
                    sql: data.session.sqlText,
                    database: data.session.database,
                    columns: (set?.columns ?? []).map(column => ({ name: column.name, type: column.type ?? null })),
                    rowCount: set?.rowCount ?? rows.length,
                    previewRows: rows,
                    truncated: Boolean(set?.limited),
                    durationMs: data.session.durationMs ?? undefined,
                    ...(data.session.errorMessage ? { error: { message: data.session.errorMessage } } : {}),
                }}
            />
        </div>
    );
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function text(value: unknown) {
    return typeof value === 'string' ? value : '';
}

function RecordedToolDetail({ activity, open, workId, ...actions }: SqlActions & { activity: ChatToolActivity; open: boolean; workId?: string }) {
    const t = useTranslations('AgentRuns');
    const event = activity.events.at(-1);
    const input = event?.inputSummary ?? {};
    const output = event?.outputSummary ?? {};
    const error = activity.events.find(item => item.errorMessage)?.errorMessage;
    if (error) return <p className="whitespace-pre-wrap text-destructive">{error}</p>;
    if (activity.toolName === 'sqlRunner' && workId && typeof output.sessionId === 'string') {
        return <SavedSqlDetail workId={workId} sessionId={output.sessionId} open={open} {...actions} />;
    }
    if (activity.toolName === 'semantic_model_context') {
        return (
            <ul className="space-y-2">
                {activity.events.map((item, index) => {
                    const source = item.outputSummary ?? {};
                    const title = text(source.title) || text(item.inputSummary?.knowledgeModelId) || t('Timeline.Titles.loadedSemanticContext');
                    const revision = text(source.modelRevision) || text(source.revision);
                    return (
                        <li key={item.eventId ?? index}>
                            {source.deepLink ? (
                                <a className="underline underline-offset-4" href={text(source.deepLink)}>
                                    {title}
                                </a>
                            ) : (
                                <p>{title}</p>
                            )}
                            {revision ? <p className="mt-1 text-muted-foreground">{t('Chat.SourceRevision', { revision: revision.slice(0, 12) })}</p> : null}
                        </li>
                    );
                })}
            </ul>
        );
    }
    if (activity.toolName === 'search_assets') {
        const candidates = Array.isArray(output.candidates) ? output.candidates.map(record) : [];
        return (
            <div className="space-y-2">
                {input.query ? <p>{t('Chat.SearchQuery', { query: text(input.query) })}</p> : null}
                {typeof output.resultCount === 'number' ? (
                    <p className="text-muted-foreground">
                        {output.resultCount ? t('Chat.KnowledgeResults', { count: output.resultCount }) : t('Timeline.Titles.knowledgeNotFound')}
                    </p>
                ) : null}
                {candidates.map((asset, index) => (
                    <div key={text(asset.ref) || index} className="space-y-1">
                        <a className="font-medium underline underline-offset-4" href={text(asset.deepLink) || undefined}>
                            {text(asset.title) || text(asset.ref)}
                        </a>
                        {asset.summary ? <p className="text-muted-foreground">{text(asset.summary)}</p> : null}
                    </div>
                ))}
            </div>
        );
    }
    if (activity.toolName === 'read_asset') {
        return (
            <div className="space-y-2">
                <a className="underline underline-offset-4" href={text(output.deepLink) || undefined}>
                    {text(output.title) || text(output.ref) || text(input.ref)}
                </a>
                {output.revision ? <p className="text-muted-foreground">{t('Chat.SourceRevision', { revision: text(output.revision).slice(0, 12) })}</p> : null}
                {output.summary ? <p>{text(output.summary)}</p> : null}
            </div>
        );
    }
    if (activity.toolName === 'finishAnalysis' && event?.status === 'success') return <p>{t('Chat.ConclusionsSaved')}</p>;
    const fields = [
        ['Database', input.database],
        ['Table', input.table],
        ['Operation', input.operation],
        ['Action', input.actionId],
        ['Rows', output.rowCount],
        ['Results', output.resultCount],
    ] as const;
    return (
        <div className="space-y-2">
            <p className="text-muted-foreground">{t('Chat.RecordedStep')}</p>
            <dl className="space-y-1">
                {fields
                    .filter(([, value]) => value !== null && value !== undefined)
                    .map(([key, value]) => (
                        <div key={key} className="flex gap-2">
                            <dt className="text-muted-foreground">{t(`Chat.Fields.${key}`)}</dt>
                            <dd>{String(value)}</dd>
                        </div>
                    ))}
            </dl>
        </div>
    );
}

function ChatToolActivityRow({ activity, workId, ended, ...actions }: SqlActions & { activity: ChatToolActivity<ChatMessageToolRow>; workId?: string; ended: boolean }) {
    const t = useTranslations('AgentRuns');
    const [open, setOpen] = useState(false);
    const message = activity.message;
    const state = chatToolActivityState(activity, message?.state);
    const interrupted = ended && (state === 'input-available' || state === 'input-streaming');
    const noResults = state === 'output-available' && activity.toolName === 'search_assets' && (message?.noResults || activity.events.at(-1)?.outputSummary?.resultCount === 0);
    const key = getAgentActivityTitleKey(activity.toolName);
    const title =
        activity.toolName === 'finishAnalysis'
            ? t('Chat.Tools.SaveConclusions')
            : activity.toolName === 'sqlRunner'
              ? t('Chat.Tools.QueryData')
              : (message?.title ?? (key ? t(`Timeline.Titles.${key}`) : t('Chat.Tools.RunTool', { name: activity.toolName.replace(/^dory_/, '').replaceAll('_', ' ') })));
    const messageHasDetails = message && (state === message.state || ['output-available', 'output-error', 'output-denied'].includes(message.state));
    const label = interrupted
        ? 'Interrupted'
        : noResults
          ? 'NoMatches'
          : state === 'output-error' || state === 'output-denied'
            ? 'Failed'
            : state === 'output-available'
              ? 'Completed'
              : 'Running';
    return (
        <Tool
            open={open}
            onOpenChange={setOpen}
            className="mb-0 border-0 shadow-none"
            data-testid="chat-tool-activity"
            data-tool-name={activity.toolName}
            data-activity-id={activity.id}
        >
            <ToolHeader type="dynamic-tool" toolName={activity.toolName} title={title} state={interrupted ? 'output-error' : state} statusLabel={t(`Chat.ToolStatus.${label}`)} />
            <ToolContent>
                <div className="space-y-3 pb-2 text-sm">
                    {interrupted ? (
                        <p className="text-muted-foreground">{t('Chat.StepInterrupted')}</p>
                    ) : messageHasDetails ? (
                        message.content
                    ) : (
                        <RecordedToolDetail activity={activity} workId={workId} open={open} {...actions} />
                    )}
                    <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer">{t('Timeline.ShowRawDetails')}</summary>
                        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2">
                            {JSON.stringify(activity.events.length ? activity.events : { input: message?.input, output: message?.output }, null, 2)}
                        </pre>
                    </details>
                </div>
            </ToolContent>
        </Tool>
    );
}

export function ChatToolActivityList({
    events = [],
    tools,
    workId,
    ended = false,
    ...actions
}: SqlActions & { events?: AgentRunEventLike[]; tools: ChatMessageToolRow[]; workId?: string; ended?: boolean }) {
    const rows = mergeChatToolActivities(events, tools);
    return (
        <div className="space-y-1">
            {rows.map(activity => (
                <ChatToolActivityRow key={activity.id} activity={activity} workId={workId} ended={ended} {...actions} />
            ))}
        </div>
    );
}

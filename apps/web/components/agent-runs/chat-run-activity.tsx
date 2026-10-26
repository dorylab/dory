'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/registry/new-york-v4/ui/button';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Database, Loader2, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ChatCheckpoints } from '@dory/shared/types/chat-checkpoints';
import type { ChatProgressEntry } from '@dory/shared/types/chat-progress';
import { buildChatTimeline, chatTurnDuration, formatChatDuration, resolveChatTimeline, type ChatTimelineItem } from '@/lib/agent-runs/chat-timeline';
import { canonicalChatToolName, chatToolActivityState, type ChatToolActivity } from '@/lib/agent-runs/chat-tool-activity';
import { type AgentRunEventLike, type AgentRunWorkLike } from '@/lib/agent-runs/summary';
import type { SqlResultBodyProps } from '@/components/@dory/ui/ai/sql-result/type';
import { MessageResponse } from '@/components/ai-elements/message';
import { ChatToolActivityList, getChatToolActivityTitle, type ChatMessageToolRow } from './chat-tool-activity';

type Activity = {
    work: AgentRunWorkLike;
    events: AgentRunEventLike[];
    progress?: ChatProgressEntry[];
    checkpoints?: ChatCheckpoints | null;
    runHref: string;
    workspaceHref: string | null;
};
type Actions = { onCopySql: (sql: string) => Promise<void> | void; onManualExecute?: SqlResultBodyProps['onManualExecute'] };

export function ChatAnalysisProcess({
    streaming,
    failed = false,
    ended = !streaming,
    durationMs = null,
    startedAt,
    children,
}: {
    streaming: boolean;
    failed?: boolean;
    ended?: boolean;
    durationMs?: number | null;
    startedAt?: number;
    children: ReactNode;
}) {
    const t = useTranslations('AgentRuns');
    const [open, setOpen] = useState(streaming || failed);
    const [mountedAt] = useState(Date.now);
    const [now, setNow] = useState(mountedAt);
    const previous = useRef<string | null>(null);
    const start = typeof startedAt === 'number' && Number.isFinite(startedAt) ? startedAt : mountedAt;
    const duration = formatChatDuration(ended ? durationMs : Math.max(0, now - start));
    const phase = !ended ? 'running' : failed ? 'failed' : 'completed';
    useEffect(() => {
        if (ended) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [ended]);
    useEffect(() => {
        if (previous.current !== phase) setOpen(phase !== 'completed');
        previous.current = phase;
    }, [phase]);
    return (
        <details className="group/analysis my-3 text-sm" open={open} onToggle={event => setOpen(event.currentTarget.open)} data-testid="chat-analysis-process">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                {phase === 'running' ? <Loader2 className="size-4 animate-spin" /> : <ChevronRight className="size-4 transition-transform group-open/analysis:rotate-90" />}
                {!ended
                    ? t('Chat.WorkingFor', { duration: duration ?? '<1s' })
                    : duration
                      ? t('Chat.WorkedFor', { duration })
                      : t(failed ? 'Chat.Process' : 'Chat.ProcessCompleted')}
            </summary>
            <div className="mt-3 space-y-3">{children}</div>
        </details>
    );
}

function ToolGroup({ activities, ended, ...props }: Actions & { activities: ChatToolActivity<ChatMessageToolRow>[]; ended: boolean; workId?: string }) {
    const t = useTranslations('AgentRuns');
    const running = !ended && activities.some(row => ['input-available', 'input-streaming'].includes(chatToolActivityState(row, row.message?.state)));
    const [expanded, setExpanded] = useState(false);
    const categoryKeys = {
        read_asset: 'ReadKnowledge',
        search_assets: 'SearchKnowledge',
        semantic_model_context: 'ReadKnowledge',
        exploreSchema: 'ExploreSchema',
        getSchemaGraph: 'ExploreSchema',
        sqlRunner: 'QueryData',
        readArtifact: 'ReadResults',
        listConnections: 'ListSources',
        chartBuilder: 'BuildCharts',
        readAttachment: 'ReadFiles',
        dory_read_attachment: 'ReadFiles',
        searchAttachment: 'SearchFiles',
        dory_search_attachment: 'SearchFiles',
    } as const;
    const groups = new Map<string, { category?: (typeof categoryKeys)[keyof typeof categoryKeys]; count: number }>();
    for (const activity of activities) {
        const category = categoryKeys[activity.toolName as keyof typeof categoryKeys];
        const key = category ?? getChatToolActivityTitle(activity, t);
        const prior = groups.get(key);
        groups.set(key, { category, count: (prior?.count ?? 0) + 1 });
    }
    const titles = [...groups].map(([title, { category, count }]) => (category ? t(`Chat.Groups.${category}`, { count }) : `${title} × ${count}`)).join(' · ');
    const ActivityIcon = activities.every(activity => ['exploreSchema', 'getSchemaGraph', 'sqlRunner', 'listConnections'].includes(activity.toolName)) ? Database : Wrench;
    return (
        <div>
            <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)} data-testid="chat-tool-group" className="group/actions text-sm">
                <summary className="flex w-fit max-w-full cursor-pointer list-none items-center gap-2 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                    {running ? <Loader2 className="size-3.5 shrink-0 animate-spin" /> : <ActivityIcon className="size-3.5 shrink-0" />}
                    <span>{titles}</span>
                    <ChevronRight className="size-3.5 shrink-0 transition-transform group-open/actions:rotate-90" />
                </summary>
                <div className="mt-2">{(expanded || ended) && <ChatToolActivityList activities={activities} tools={[]} ended={ended} {...props} />}</div>
            </details>
        </div>
    );
}

export function ChatTimeline({
    items,
    tools,
    events,
    ended,
    ...actions
}: Actions & { items: ChatTimelineItem[]; tools: ChatMessageToolRow[]; events: AgentRunEventLike[]; ended: boolean; workId?: string }) {
    const { groups, unplaced } = buildChatTimeline(items, tools, events);
    return (
        <>
            {groups.map(group =>
                group.kind === 'content' ? <div key={group.id}>{group.content}</div> : <ToolGroup key={group.id} activities={group.activities} ended={ended} {...actions} />,
            )}
            {unplaced.length > 0 && <ToolGroup activities={unplaced} ended={ended} {...actions} />}
        </>
    );
}

export function ChatRunActivity({
    workId,
    requestId,
    streaming,
    tools,
    timeline,
    answer,
    failed = false,
    responseError,
    showLinks = true,
    summarySave,
    durationMs,
    ...actions
}: Actions & {
    workId: string;
    requestId: string;
    streaming: boolean;
    tools: ChatMessageToolRow[];
    timeline: ChatTimelineItem[];
    answer: ReactNode;
    children?: ReactNode;
    failed?: boolean;
    responseError?: string;
    showLinks?: boolean;
    summarySave?: { status: string; error?: string };
    durationMs?: number;
}) {
    const t = useTranslations('AgentRuns');
    const { data, isError } = useQuery({
        queryKey: ['chat-run-activity', workId, requestId],
        queryFn: async ({ signal }): Promise<Activity> => {
            const response = await fetch(`/api/chat/run-activity?workId=${encodeURIComponent(workId)}&requestId=${encodeURIComponent(requestId)}`, { signal });
            if (!response.ok) throw new Error('Unable to load analysis activity');
            return response.json();
        },
        refetchInterval: query =>
            streaming || (query.state.data?.work?.status === 'active' && (query.state.data.work.metadata?.chatTurn as { requestId?: string } | undefined)?.requestId === requestId)
                ? 750
                : false,
    });
    const events = (data?.events ?? []).filter(event => event.toolName !== 'chat_progress');
    const turn = data?.work?.metadata?.chatTurn as { requestId?: string; summarySaved?: boolean; responseSaved?: boolean; startedAt?: string; finishedAt?: string } | undefined;
    const ended = !streaming && Boolean(data?.work && (data.work.status !== 'active' || turn?.requestId !== requestId));
    const saveFailed = summarySave?.status === 'failed' || events.some(event => event.toolName === 'dory_finish_work' && event.status === 'error' && !event.inputSummary?.report);
    const incomplete = saveFailed || (data?.work?.status === 'error' && turn?.requestId === requestId && turn.summarySaved === true && !turn.responseSaved);
    const interrupted = failed || incomplete || (turn?.requestId === requestId && data?.work?.status === 'error');
    const checkpointEntries = data?.checkpoints?.entries;
    const progress = checkpointEntries ?? data?.progress ?? [];
    const localItems: ChatTimelineItem[] = [];
    const localTools: ChatMessageToolRow[] = [];
    let finalText = checkpointEntries ? data?.progress?.findLast(entry => entry.phase === 'final')?.text : undefined;
    for (const entry of progress) {
        if (entry.kind === 'text') {
            if (entry.phase === 'final') finalText = entry.text;
            else if (entry.text) localItems.push({ id: entry.id, kind: 'content', content: <MessageResponse>{entry.text}</MessageResponse> });
        } else {
            const name = canonicalChatToolName(entry.toolName ?? '');
            const sourceId = events.find(event => event.eventId === entry.eventId)?.inputSummary?.toolCallId;
            const source = tools.find(tool => tool.toolCallId === sourceId);
            localTools.push({
                ...source,
                toolCallId: entry.id,
                toolName: name,
                state: entry.state === 'completed' ? 'output-available' : entry.state === 'failed' ? 'output-error' : 'input-available',
                content: source?.content ?? null,
            });
            localItems.push({ id: entry.id, kind: 'tool', toolCallId: entry.id });
            if (checkpointEntries && typeof sourceId === 'string') localItems.push(...timeline.filter(item => item.kind === 'content' && item.relatedToolCallId === sourceId));
        }
    }
    // Local call IDs are linked by the actual MCP response. Until then the CLI
    // lifecycle row is authoritative; don't show a second polling copy.
    const visibleEvents = checkpointEntries
        ? events.filter(event => checkpointEntries.some(entry => entry.eventId === event.eventId))
        : progress.length && !ended
          ? events.filter(
                event =>
                    progress.some(entry => entry.eventId === event.eventId) || event.inputSummary?.activitySource === 'automatic' || event.toolName === 'semantic_model_context',
            )
          : events;
    const { items, tools: rows, fromMessages } = resolveChatTimeline(timeline, tools, localItems, localTools);
    const mappedEvents = fromMessages
        ? visibleEvents
        : visibleEvents.map(event => {
              const entry = progress.find(entry => entry.eventId === event.eventId && entry.kind === 'tool');
              return entry ? { ...event, inputSummary: { ...event.inputSummary, toolCallId: entry.id } } : event;
          });
    const count = buildChatTimeline(items, rows, mappedEvents).count;
    const hasProcess = items.length > 0 || count > 0;
    return (
        <>
            {hasProcess && (
                <ChatAnalysisProcess
                    streaming={streaming}
                    ended={ended || (!data && !streaming)}
                    failed={interrupted}
                    durationMs={chatTurnDuration(durationMs, turn, requestId)}
                    startedAt={turn?.requestId === requestId && turn.startedAt ? Date.parse(turn.startedAt) : undefined}
                >
                    {isError && <p className="text-destructive">{t('Chat.LoadFailed')}</p>}
                    <ChatTimeline items={items} tools={rows} events={mappedEvents} ended={ended} workId={workId} {...actions} />
                </ChatAnalysisProcess>
            )}
            {showLinks && ended && data && hasProcess && (
                <div className="mb-3 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                        <Link href={data.runHref}>{t('Chat.ViewRun')}</Link>
                    </Button>
                    {data.workspaceHref && (
                        <Button asChild size="sm" variant="ghost">
                            <Link href={data.workspaceHref}>{t('Chat.OpenWorkspace')}</Link>
                        </Button>
                    )}
                </div>
            )}
            {ended && incomplete && <p className="mb-3 text-sm text-muted-foreground">{t('Chat.Incomplete')}</p>}
            {finalText ? <MessageResponse>{finalText}</MessageResponse> : answer}
            {finalText && responseError && (
                <p role="alert" className="text-sm text-destructive">
                    {responseError}
                </p>
            )}
        </>
    );
}

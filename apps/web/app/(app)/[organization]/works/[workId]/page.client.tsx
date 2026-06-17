'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Bot, ChevronDown, ChevronRight, Clock, Database, Loader2, Play, Send, SquarePen } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import { buildContinueAgentRunFetchInit } from '@/lib/work/continue-agent-request';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import { useConnections } from '../../connections/hooks/use-connections';
import type { WorkDetail, WorkRun, WorkRunEvent, WorkWorkspaceSummaryTab } from '../types';
import { formatRelativeTime, statusClassName } from '../utils';

type WorkDetailPageClientProps = {
    organization: string;
    workId: string;
};

function tabStatusClassName(status: string) {
    if (status === 'unsynced' || status === 'human_edited') return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300';
    if (status === 'failed') return 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300';
    if (status === 'running') return 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300';
    return 'border-border bg-muted text-muted-foreground';
}

function statusLabel(status: string, t: ReturnType<typeof useTranslations>) {
    if (status === 'running') return t('Status.Running');
    if (status === 'waiting_for_user' || status === 'draft') return t('Status.WaitingForUser');
    if (status === 'completed') return t('Status.Completed');
    return t('Status.Failed');
}

function tabStatusLabel(status: string, t: ReturnType<typeof useTranslations>) {
    if (status === 'unsynced' || status === 'human_edited') return t('TabStatus.Unsynced');
    if (status === 'agent_generated') return t('TabStatus.AgentGenerated');
    if (status === 'running') return t('TabStatus.Running');
    if (status === 'failed') return t('TabStatus.Failed');
    return t('TabStatus.Synced');
}

function eventTypeLabel(type: WorkRunEvent['type'], t: ReturnType<typeof useTranslations>) {
    if (type === 'tool_call') return t('EventType.ToolCall');
    if (type === 'tool_result') return t('EventType.ToolResult');
    if (type === 'sql_executed') return t('EventType.SqlExecuted');
    if (type === 'sql_tab_created') return t('EventType.SqlTabCreated');
    if (type === 'sql_tab_updated') return t('EventType.SqlTabUpdated');
    if (type === 'workspace_snapshot') return t('EventType.WorkspaceSnapshot');
    if (type === 'work_done') return t('EventType.WorkDone');
    if (type === 'investigation_created') return t('EventType.InvestigationCreated');
    if (type === 'investigation_updated') return t('EventType.InvestigationUpdated');
    if (type === 'conclusion_updated') return t('EventType.ConclusionUpdated');
    if (type === 'error') return t('EventType.Error');
    if (type === 'completed') return t('EventType.Completed');
    return t('EventType.Message');
}

function eventContent(event: WorkRunEvent, t: ReturnType<typeof useTranslations>) {
    const payload = event.payload ?? {};
    const payloadTitle = typeof payload.title === 'string' || typeof payload.title === 'number' ? String(payload.title) : null;
    if (event.type === 'sql_tab_created') return t('EventContent.SqlTabCreated', { title: event.content ?? payloadTitle ?? t('UntitledSqlTab') });
    if (event.type === 'sql_tab_updated') return t('EventContent.SqlTabUpdated', { title: event.content ?? payloadTitle ?? t('SqlTab') });
    if (event.type === 'sql_executed') {
        const query = payload.query && typeof payload.query === 'object' ? (payload.query as Record<string, unknown>) : null;
        const queryResultSets = Array.isArray(query?.queryResultSets) ? query.queryResultSets : [];
        const firstSet = queryResultSets[0] && typeof queryResultSets[0] === 'object' ? (queryResultSets[0] as Record<string, unknown>) : null;
        const rowCount = typeof firstSet?.rowCount === 'number' ? t('Rows', { count: firstSet.rowCount }) : t('QueryResult');
        return t('EventContent.SqlExecuted', { result: rowCount });
    }
    if (event.type === 'workspace_snapshot') return t('EventContent.WorkspaceSnapshot');
    if (event.type === 'tool_call') return event.content ?? t('EventContent.ToolCall');
    if (event.type === 'tool_result') return event.content ?? t('EventContent.ToolResult');
    if (event.content?.trim()) return event.content.trim();
    return eventTypeLabel(event.type, t);
}

function latestEvent(events: WorkRunEvent[], predicate: (event: WorkRunEvent) => boolean) {
    return [...events].reverse().find(predicate) ?? null;
}

function buildOutcome(input: {
    latestRun: WorkRun | null;
    events: WorkRunEvent[];
    tabs: WorkWorkspaceSummaryTab[];
    resultCount: number;
    locale: string;
    t: ReturnType<typeof useTranslations>;
}) {
    const doneEvent = latestEvent(input.events, event => event.type === 'work_done' && Boolean(event.content?.trim()));
    if (doneEvent?.content?.trim()) {
        return {
            title: input.t('AgentSummary'),
            body: doneEvent.content.trim(),
            meta: input.t('OutcomeMeta.Completed', { time: formatRelativeTime(doneEvent.createdAt, input.locale) }),
        };
    }

    const errorEvent = latestEvent(input.events, event => event.type === 'error' && Boolean(event.content?.trim()));
    if (input.latestRun?.status === 'failed' || errorEvent) {
        return {
            title: input.t('Outcome'),
            body: errorEvent?.content?.trim() || input.latestRun?.error || input.t('OutcomeBody.FailedNoResult'),
            meta: input.latestRun?.completedAt
                ? input.t('OutcomeMeta.FailedAt', { time: formatRelativeTime(input.latestRun.completedAt, input.locale) })
                : input.t('OutcomeMeta.Failed'),
        };
    }

    if (input.latestRun?.status === 'running') {
        return {
            title: input.t('Outcome'),
            body: input.t('OutcomeBody.Running'),
            meta: input.t('OutcomeMeta.Started', { time: formatRelativeTime(input.latestRun.startedAt, input.locale) }),
        };
    }

    if (input.tabs.length || input.resultCount) {
        const tabTitles = input.tabs
            .slice(0, 3)
            .map(tab => tab.title)
            .join(', ');
        return {
            title: input.t('Outcome'),
            body: input.t(tabTitles ? 'OutcomeBody.WorkspaceWithTitles' : 'OutcomeBody.Workspace', {
                tabCount: input.tabs.length,
                resultCount: input.resultCount,
                titles: tabTitles,
            }),
            meta: input.latestRun?.completedAt
                ? input.t('OutcomeMeta.Updated', { time: formatRelativeTime(input.latestRun.completedAt, input.locale) })
                : input.t('OutcomeMeta.WorkspaceUpdated'),
        };
    }

    return {
        title: input.t('Outcome'),
        body: input.t('OutcomeBody.Empty'),
        meta: input.t('OutcomeMeta.Waiting'),
    };
}

export function WorkDetailPageClient({ organization, workId }: WorkDetailPageClientProps) {
    const t = useTranslations('WorkDetail');
    const locale = useLocale();
    const connectionsQuery = useConnections();
    const [instruction, setInstruction] = useState('');
    const [isExecutionCollapsed, setIsExecutionCollapsed] = useState(false);

    const workQuery = useQuery({
        queryKey: ['work', workId],
        queryFn: () => executeActionClient<WorkDetail>('work.get', { id: workId }),
        refetchInterval: query => (query.state.data?.latestRun?.status === 'running' ? 1500 : false),
    });

    const work = workQuery.data?.work ?? null;
    const workspaceSummary = workQuery.data?.workspaceSummary ?? null;
    const latestRun = workQuery.data?.latestRun ?? null;
    const timelineEvents = useMemo(() => workQuery.data?.timelineEvents ?? [], [workQuery.data?.timelineEvents]);
    const connectionById = useMemo(() => new Map((connectionsQuery.data ?? []).map(item => [item.connection.id, item.connection])), [connectionsQuery.data]);
    const connection = work ? connectionById.get(work.connectionId) : null;
    const isRunRunning = latestRun?.status === 'running' || work?.status === 'running';

    const continueMutation = useMutation({
        mutationFn: async (input: { userInstruction?: string | null; focusTabId?: string | null }) => {
            const response = await fetch(
                `/api/works/${encodeURIComponent(workId)}/run`,
                buildContinueAgentRunFetchInit({
                    userInstruction: input.userInstruction,
                    focusTabId: input.focusTabId,
                    trigger: input.focusTabId ? 'continue_from_tab' : 'user_instruction',
                }),
            );

            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(text || t('Toast.ContinueAgentFailed'));
            }

            setInstruction('');
            await workQuery.refetch();
            void response.text().finally(() => {
                void workQuery.refetch();
            });
        },
        onSuccess: () => toast.success(t('Toast.AgentRunStarted')),
        onError: error => toast.error(error instanceof Error ? error.message : t('Toast.ContinueAgentFailed')),
    });

    const runTabMutation = useMutation({
        mutationFn: async (tab: WorkWorkspaceSummaryTab) => {
            await executeActionClient('work.executeSqlTab', { workId, tabId: tab.tabId });
            await workQuery.refetch();
        },
        onSuccess: () => toast.success(t('Toast.SqlTabExecuted')),
        onError: error => toast.error(error instanceof Error ? error.message : t('Toast.RunSqlTabFailed')),
    });

    if (workQuery.isLoading) {
        return (
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-36 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    if (!work) {
        return (
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-6">
                <Button variant="ghost" asChild className="w-fit gap-2">
                    <Link href={`/${organization}/works`}>
                        <ArrowLeft className="size-4" />
                        {t('BackToWork')}
                    </Link>
                </Button>
                <Card>
                    <CardContent className="p-6 text-sm text-muted-foreground">{t('WorkNotFound')}</CardContent>
                </Card>
            </div>
        );
    }

    const tabs = workspaceSummary?.tabs ?? [];
    const executionEvents = timelineEvents
        .map(event => event.runEvent)
        .filter((event): event is WorkRunEvent => Boolean(event))
        .filter(event => event.role !== 'system' || event.type === 'completed' || event.type === 'error');
    const latestRunEvents = workQuery.data?.latestRunEvents ?? [];
    const outcome = buildOutcome({
        latestRun,
        events: latestRunEvents.length ? latestRunEvents : executionEvents,
        tabs,
        resultCount: workspaceSummary?.resultCount ?? 0,
        locale,
        t,
    });

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                    <Button variant="ghost" size="sm" className="-ml-2 gap-2" asChild>
                        <Link href={`/${organization}/works`}>
                            <ArrowLeft className="size-4" />
                            {t('Work')}
                        </Link>
                    </Button>
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="truncate text-2xl font-semibold">{work.title}</h1>
                        <Badge variant="outline" className={statusClassName(work.status)}>
                            {statusLabel(work.status, t)}
                        </Badge>
                    </div>
                    <p className="max-w-3xl text-sm text-muted-foreground">{t('Goal', { goal: work.goal })}</p>
                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                            <Database className="size-4" />
                            {t('DataSource', { name: connection?.name ?? work.connectionId })}
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <Clock className="size-4" />
                            {t('Updated', { time: formatRelativeTime(work.updatedAt, locale) })}
                        </span>
                    </div>
                </div>
                <div className="flex shrink-0 gap-2">
                    <Button variant="outline" asChild>
                        <Link href={`/${organization}/works/${workId}/workspace`}>{t('OpenWorkspace')}</Link>
                    </Button>
                    <Button
                        onClick={() => continueMutation.mutate({ userInstruction: instruction.trim() || t('DefaultContinueInstruction') })}
                        disabled={isRunRunning || continueMutation.isPending}
                    >
                        {continueMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Bot className="size-4" />}
                        {t('ContinueWithAgent')}
                    </Button>
                </div>
            </div>

            <Card>
                <CardContent className="space-y-4 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h2 className="text-base font-semibold">{t('Workspace')}</h2>
                            <p className="text-sm text-muted-foreground">
                                {t('WorkspaceCounts', {
                                    tabCount: workspaceSummary?.tabCount ?? 0,
                                    resultCount: workspaceSummary?.resultCount ?? 0,
                                    unsyncedCount: workspaceSummary?.unsyncedCount ?? 0,
                                })}
                            </p>
                        </div>
                        <Button variant="outline" size="sm" asChild>
                            <Link href={`/${organization}/works/${workId}/workspace`}>{t('OpenWorkspace')}</Link>
                        </Button>
                    </div>

                    {tabs.length ? (
                        <div className="divide-y rounded-md border">
                            {tabs.map(tab => (
                                <div key={tab.tabId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="truncate text-sm font-medium">{tab.title}</p>
                                            <Badge variant="outline" className={tabStatusClassName(tab.status)}>
                                                {tabStatusLabel(tab.status, t)}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {t('TabMeta', {
                                                rows: tab.rows ?? 0,
                                                columns: tab.columns ?? 0,
                                                time: formatRelativeTime(tab.updatedAt, locale),
                                            })}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 gap-2">
                                        <Button variant="outline" size="sm" asChild>
                                            <Link href={`/${organization}/works/${workId}/workspace`}>{t('Open')}</Link>
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => runTabMutation.mutate(tab)} disabled={runTabMutation.isPending}>
                                            <Play className="size-4" />
                                            {t('Run')}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() =>
                                                continueMutation.mutate({
                                                    focusTabId: tab.tabId,
                                                    userInstruction: instruction.trim() || t('ContinueFromTabInstruction', { title: tab.title }),
                                                })
                                            }
                                            disabled={isRunRunning || continueMutation.isPending}
                                        >
                                            <SquarePen className="size-4" />
                                            {t('Continue')}
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">{t('NoSqlTabs')}</div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardContent className="space-y-3 p-5">
                    <div className="space-y-1">
                        <h2 className="text-base font-semibold">{outcome.title}</h2>
                        <p className="text-sm text-muted-foreground">{outcome.meta}</p>
                    </div>
                    <p className="max-w-4xl whitespace-pre-wrap text-sm leading-6">{outcome.body}</p>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="space-y-3 p-5">
                    <h2 className="text-base font-semibold">{t('TellAgent')}</h2>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Textarea
                            value={instruction}
                            onChange={event => setInstruction(event.target.value)}
                            placeholder={t('InstructionPlaceholder')}
                            className="min-h-20 flex-1"
                        />
                        <Button
                            className="sm:self-end"
                            onClick={() => continueMutation.mutate({ userInstruction: instruction.trim() })}
                            disabled={!instruction.trim() || isRunRunning || continueMutation.isPending}
                        >
                            {continueMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                            {t('Continue')}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="space-y-4 p-5">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-base font-semibold">{t('Execution')}</h2>
                            <p className="text-sm text-muted-foreground">{t('ExecutionEvents', { count: executionEvents.length })}</p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setIsExecutionCollapsed(value => !value)}>
                            {isExecutionCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                            {isExecutionCollapsed ? t('Show') : t('Hide')}
                        </Button>
                    </div>
                    {!isExecutionCollapsed && executionEvents.length ? (
                        <div className="max-h-96 space-y-3 overflow-y-auto pr-2">
                            {executionEvents.map(event => (
                                <div key={event.id} className="flex gap-3">
                                    <div className="mt-1 size-2 rounded-full bg-muted-foreground" />
                                    <div className="min-w-0">
                                        <p className="text-sm">{eventContent(event, t)}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {eventTypeLabel(event.type, t)} · {formatRelativeTime(event.createdAt, locale)}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : !isExecutionCollapsed ? (
                        <p className="text-sm text-muted-foreground">{t('NoExecutionHistory')}</p>
                    ) : null}
                </CardContent>
            </Card>
        </div>
    );
}

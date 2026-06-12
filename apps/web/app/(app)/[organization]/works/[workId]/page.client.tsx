'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpRight, Bot, Check, ChevronDown, Clock, Database, Loader2, MoreVertical, Pencil, Play, Plus, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import { fetchSqlTabs, SQL_TABS_PREFETCH_STALE_TIME_MS, sqlTabsQueryKey } from '@/lib/sql-console/tab-queries';
import { effectiveInvestigationStatus, investigationActivityDisplay } from '@/lib/work/investigation-card-state';
import {
    buildIncludedAnalysisConclusion,
    formatWorkEvidenceSummary,
    formatUnconfirmedAnalysisSummary,
    getConclusionSourceBoundary,
    getWorkLifecycleDisplayStatus,
    type WorkLifecycleDisplayStatus,
} from '@/lib/work/review-state';
import { SqlResultBody, SqlStatementBlock } from '@/components/@dory/ui/ai/sql-result';
import type { SqlResultManualExecutionMode, SqlResultPart } from '@/components/@dory/ui/ai/sql-result/type';
import { MessageResponse } from '@/components/ai-elements/message';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/registry/new-york-v4/ui/alert-dialog';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/registry/new-york-v4/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import type { WorkspaceScope } from '@dory/shared/types/tabs';
import { useConnections } from '../../connections/hooks/use-connections';
import type { Work, WorkAnalysisAuditStatus, WorkDetail, WorkInvestigation, WorkRun, WorkRunEvent } from '../types';
import { eventTypeLabel, formatRelativeTime, runStatusClassName, runStatusLabel, statusClassName, statusLabel } from '../utils';

type WorkDetailPageClientProps = {
    organization: string;
    workId: string;
};

const WORKSPACE_PREFETCH_STALE_TIME_MS = 30_000;

function hasSqlBackedFinding(investigation: WorkInvestigation) {
    return investigation.findings.some(finding => Boolean(finding.sourceRunEventId || finding.sourceTabId));
}

function workLifecycleDisplayStatusLabel(status: WorkLifecycleDisplayStatus) {
    if (status === 'running') return 'Running';
    if (status === 'failed') return 'Failed';
    if (status === 'completed') return 'Completed';
    return 'Draft';
}

function workLifecycleDisplayStatusClassName(status: WorkLifecycleDisplayStatus) {
    if (status === 'running') return statusClassName('running');
    if (status === 'completed') return statusClassName('completed');
    if (status === 'failed') return 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300';
    return statusClassName('draft');
}

function pluralizeAnalysis(count: number) {
    return count === 1 ? 'analysis' : 'analyses';
}

function analysisAuditStatusToastLabel(status: WorkAnalysisAuditStatus) {
    if (status === 'accepted') return 'confirmed';
    if (status === 'rejected') return 'excluded';
    return 'included';
}

export function WorkDetailPageClient({ organization, workId }: WorkDetailPageClientProps) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const connectionsQuery = useConnections();
    const [goal, setGoal] = useState('');
    const [titleDraft, setTitleDraft] = useState('');
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [conclusion, setConclusion] = useState('');
    const [isEditingConclusion, setIsEditingConclusion] = useState(false);
    const [investigationTitle, setInvestigationTitle] = useState('');
    const [openingInvestigationId, setOpeningInvestigationId] = useState<string | null>(null);
    const [deletingInvestigation, setDeletingInvestigation] = useState<WorkInvestigation | null>(null);
    const [runDetailsOpen, setRunDetailsOpen] = useState(false);

    const workQuery = useQuery({
        queryKey: ['work', workId],
        queryFn: () => executeActionClient<WorkDetail>('work.get', { id: workId }),
        refetchInterval: query => {
            const latestRun = query.state.data?.latestRun;
            return latestRun?.status === 'running' ? 1500 : false;
        },
    });

    const connectionById = useMemo(() => new Map((connectionsQuery.data ?? []).map(item => [item.connection.id, item.connection])), [connectionsQuery.data]);
    const work = workQuery.data?.work ?? null;
    const investigations = useMemo(() => workQuery.data?.investigations ?? [], [workQuery.data?.investigations]);
    const latestRun = workQuery.data?.latestRun ?? null;
    const latestRunEvents = useMemo(() => workQuery.data?.latestRunEvents ?? [], [workQuery.data?.latestRunEvents]);
    const connection = work ? connectionById.get(work.connectionId) : null;
    const isRunRunning = latestRun?.status === 'running' || work?.status === 'running';
    const latestEvent = latestRunEvents[latestRunEvents.length - 1] ?? null;
    const evidenceSummary = useMemo(() => formatWorkEvidenceSummary(investigations), [investigations]);
    const unconfirmedAnalysisSummary = useMemo(() => formatUnconfirmedAnalysisSummary(investigations), [investigations]);
    const conclusionSourceBoundary = useMemo(() => getConclusionSourceBoundary(investigations), [investigations]);
    const includedAnalysisConclusion = useMemo(() => buildIncludedAnalysisConclusion(investigations), [investigations]);
    const workLifecycleStatus = work ? getWorkLifecycleDisplayStatus({ workStatus: work.status, latestRun }) : 'draft';
    const includedAnalysisCount = conclusionSourceBoundary.includedAnalyses.length;
    const hasIncludedAnalysis = includedAnalysisCount > 0;
    const conclusionEvidenceLine =
        includedAnalysisCount > 0
            ? `Conclusion based on ${includedAnalysisCount} included ${pluralizeAnalysis(includedAnalysisCount)}`
            : 'Conclusion needs at least one included analysis';
    const excludedAnalysisCount = conclusionSourceBoundary.excludedAnalyses.length;
    const excludedAnalysisTitle =
        excludedAnalysisCount > 0
            ? `${excludedAnalysisCount} ${pluralizeAnalysis(excludedAnalysisCount)} ${excludedAnalysisCount === 1 ? 'is' : 'are'} excluded from this conclusion.`
            : undefined;

    useEffect(() => {
        if (!work) return;
        if (!isEditingTitle) {
            setTitleDraft(work.title);
        }
        setGoal(work.goal);
        if (!isEditingConclusion) {
            setConclusion(work.conclusion ?? '');
        }
    }, [work, isEditingTitle, isEditingConclusion]);

    const invalidateWork = () => queryClient.invalidateQueries({ queryKey: ['work', workId] });

    useEffect(() => {
        if (latestRun?.status === 'running') {
            setRunDetailsOpen(true);
        }
    }, [latestRun?.status]);

    const updateTitleMutation = useMutation({
        mutationFn: (nextTitle: string) => executeActionClient<Work>('work.updateTitle', { id: workId, title: nextTitle }),
        onSuccess: updatedWork => {
            toast.success('Title updated');
            setTitleDraft(updatedWork.title);
            setIsEditingTitle(false);
            queryClient.setQueryData<WorkDetail>(['work', workId], current =>
                current
                    ? {
                          ...current,
                          work: {
                              ...current.work,
                              title: updatedWork.title,
                              updatedAt: updatedWork.updatedAt,
                          },
                      }
                    : current,
            );
            invalidateWork();
        },
        onError: error => toast.error(error instanceof Error ? error.message : 'Failed to update title'),
    });

    const updateGoalMutation = useMutation({
        mutationFn: (nextGoal: string) => executeActionClient<Work>('work.updateGoal', { id: workId, goal: nextGoal }),
        onSuccess: () => {
            toast.success('Goal updated');
            invalidateWork();
        },
        onError: error => toast.error(error instanceof Error ? error.message : 'Failed to update goal'),
    });

    const updateConclusionMutation = useMutation({
        mutationFn: (nextConclusion: string) =>
            executeActionClient<Work>('work.updateConclusion', {
                id: workId,
                conclusion: nextConclusion.trim() ? nextConclusion.trim() : null,
            }),
        onSuccess: updatedWork => {
            toast.success('Conclusion updated');
            setConclusion(updatedWork.conclusion ?? '');
            setIsEditingConclusion(false);
            invalidateWork();
        },
        onError: error => toast.error(error instanceof Error ? error.message : 'Failed to update conclusion'),
    });

    const updateAnalysisAuditStatusMutation = useMutation({
        mutationFn: (input: { investigation: WorkInvestigation; auditStatus: WorkAnalysisAuditStatus }) =>
            executeActionClient<WorkInvestigation>('work.updateInvestigation', {
                workId,
                id: input.investigation.id,
                auditStatus: input.auditStatus,
            }),
        onSuccess: (_updatedInvestigation, input) => {
            toast.success(`Analysis ${analysisAuditStatusToastLabel(input.auditStatus)}`);
            invalidateWork();
        },
        onError: error => toast.error(error instanceof Error ? error.message : 'Failed to update Analysis review status'),
    });

    const runWorkMutation = useMutation({
        mutationFn: async (input?: { focusInvestigationId?: string | null }) => {
            if (work && goal.trim() && goal.trim() !== work.goal) {
                await executeActionClient<Work>('work.updateGoal', { id: workId, goal: goal.trim() });
                await invalidateWork();
            }

            const response = await fetch(`/api/works/${encodeURIComponent(workId)}/run`, {
                method: 'POST',
                headers: input?.focusInvestigationId ? { 'Content-Type': 'application/json' } : undefined,
                body: input?.focusInvestigationId
                    ? JSON.stringify({
                          focusInvestigationId: input.focusInvestigationId,
                      })
                    : undefined,
            });

            if (!response.ok) {
                const text = await response.text().catch(() => '');
                let message = text;
                try {
                    const parsed = JSON.parse(text) as { error?: string };
                    message = parsed.error ?? text;
                } catch {
                    // keep text response
                }
                throw new Error(message || 'Failed to start Work run');
            }

            await invalidateWork();
            setRunDetailsOpen(true);
            void response.text().finally(() => {
                void invalidateWork();
            });
        },
        onError: error => {
            void invalidateWork();
            toast.error(error instanceof Error ? error.message : 'Failed to start Work run');
        },
    });

    const regenerateConclusionFromIncluded = () => {
        if (!includedAnalysisConclusion) {
            toast.error('Include at least one Analysis before regenerating a Conclusion');
            return;
        }
        updateConclusionMutation.mutate(includedAnalysisConclusion);
    };

    const createInvestigationMutation = useMutation({
        mutationFn: (title: string) => executeActionClient<WorkInvestigation>('work.createInvestigation', { workId, title }),
        onSuccess: investigation => {
            setInvestigationTitle('');
            invalidateWork();
            toast.success('Analysis added. Agent run started');
            runWorkMutation.mutate({ focusInvestigationId: investigation.id });
        },
        onError: error => toast.error(error instanceof Error ? error.message : 'Failed to create Analysis'),
    });

    const deleteInvestigationMutation = useMutation({
        mutationFn: (investigation: WorkInvestigation) => executeActionClient<{ ok: boolean }>('work.deleteInvestigation', { workId, id: investigation.id }),
        onMutate: async investigation => {
            await queryClient.cancelQueries({ queryKey: ['work', workId] });
            const previousWorkDetail = queryClient.getQueryData<WorkDetail>(['work', workId]);
            setDeletingInvestigation(null);
            queryClient.setQueryData<WorkDetail>(['work', workId], current =>
                current
                    ? {
                          ...current,
                          investigations: current.investigations.filter(item => item.id !== investigation.id),
                      }
                    : current,
            );
            return { previousWorkDetail };
        },
        onSuccess: () => {
            toast.success('Analysis deleted');
        },
        onError: (error, _investigation, context) => {
            if (context?.previousWorkDetail) {
                queryClient.setQueryData(['work', workId], context.previousWorkDetail);
            }
            toast.error(error instanceof Error ? error.message : 'Failed to delete Analysis');
        },
        onSettled: () => {
            void invalidateWork();
        },
    });

    const copySql = async (sql: string) => {
        try {
            await navigator.clipboard.writeText(sql);
            toast.success('SQL copied');
        } catch (error) {
            console.error(error);
            toast.error('Failed to copy SQL');
        }
    };

    const openSqlInConsole = async (payload: { sql: string; database: string | null; mode?: SqlResultManualExecutionMode }) => {
        if (!work || !payload.sql.trim()) return;

        try {
            const tab = await executeActionClient<{ tabId: string }>(
                'tab.create',
                {
                    connectionId: work.connectionId,
                    tabType: 'sql',
                    tabName: 'Work SQL',
                    content: payload.sql,
                    databaseName: payload.database,
                },
                { currentConnectionId: work.connectionId },
            );

            try {
                localStorage.setItem(`sqlconsole:activeTabId:${work.connectionId}`, tab.tabId);
            } catch {
                // ignore
            }

            router.push(`/${organization}/${work.connectionId}/sql-console`);
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : 'Failed to open SQL');
        }
    };

    const investigationWorkspaceHref = useCallback((investigationId: string) => `/${organization}/works/${workId}/investigations/${investigationId}`, [organization, workId]);

    const investigationWorkspaceScope = useCallback(
        (investigationId: string): WorkspaceScope => ({
            type: 'work_investigation',
            workId,
            investigationId,
        }),
        [workId],
    );

    const ensureInvestigationWorkspaceQueryKey = useCallback((investigationId: string) => ['work', workId, 'investigation', investigationId, 'workspace'] as const, [workId]);

    const prepareInvestigationWorkspace = useCallback(
        async (investigation: WorkInvestigation, options?: { awaitTabs?: boolean }) => {
            if (!work) return null;

            const href = investigationWorkspaceHref(investigation.id);
            const workspaceScope = investigationWorkspaceScope(investigation.id);
            router.prefetch(href);

            const ensuredInvestigation = await queryClient.fetchQuery({
                queryKey: ensureInvestigationWorkspaceQueryKey(investigation.id),
                queryFn: () =>
                    executeActionClient<WorkInvestigation>(
                        'work.ensureInvestigationWorkspace',
                        {
                            workId,
                            investigationId: investigation.id,
                        },
                        {
                            currentConnectionId: work.connectionId,
                        },
                    ),
                staleTime: WORKSPACE_PREFETCH_STALE_TIME_MS,
            });

            const tabsPrefetch = queryClient.prefetchQuery({
                queryKey: sqlTabsQueryKey(work.connectionId, workspaceScope),
                queryFn: () => fetchSqlTabs(work.connectionId, workspaceScope),
                staleTime: SQL_TABS_PREFETCH_STALE_TIME_MS,
            });

            if (options?.awaitTabs) {
                await tabsPrefetch;
            }

            return ensuredInvestigation;
        },
        [ensureInvestigationWorkspaceQueryKey, investigationWorkspaceHref, investigationWorkspaceScope, queryClient, router, work, workId],
    );

    const prefetchInvestigationWorkspace = (investigation: WorkInvestigation) => {
        void prepareInvestigationWorkspace(investigation, { awaitTabs: true }).catch(error => {
            console.debug('[WorkDetailPageClient] workspace prefetch failed', error);
        });
    };

    const openInvestigation = async (investigation: WorkInvestigation) => {
        if (!work) return;
        setOpeningInvestigationId(investigation.id);
        try {
            await prepareInvestigationWorkspace(investigation);
            router.push(investigationWorkspaceHref(investigation.id));
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : 'Failed to open Analysis');
        } finally {
            setOpeningInvestigationId(null);
        }
    };

    const startEditingTitle = () => {
        if (!work) return;
        setTitleDraft(work.title);
        setIsEditingTitle(true);
    };

    const cancelEditingTitle = () => {
        if (!work) return;
        setTitleDraft(work.title);
        setIsEditingTitle(false);
    };

    const submitTitle = () => {
        if (!work) return;
        const nextTitle = titleDraft.trim();
        if (!nextTitle) {
            toast.error('Title is required');
            return;
        }
        if (nextTitle === work.title) {
            setTitleDraft(work.title);
            setIsEditingTitle(false);
            return;
        }
        updateTitleMutation.mutate(nextTitle);
    };

    if (workQuery.isLoading) {
        return (
            <div className="bg-n8 h-screen overflow-auto">
                <div className="container mx-auto mt-6 max-w-6xl px-4 py-6 sm:mt-8 sm:px-6 lg:px-8 2xl:px-4">
                    <Skeleton className="h-32 w-full" />
                    <div className="mt-6 grid gap-4">
                        <Skeleton className="h-28 w-full" />
                        <Skeleton className="h-36 w-full" />
                    </div>
                </div>
            </div>
        );
    }

    if (!work) {
        return (
            <div className="bg-n8 h-screen overflow-auto">
                <div className="container mx-auto mt-6 max-w-6xl px-4 py-6 sm:mt-8 sm:px-6 lg:px-8 2xl:px-4">
                    <Button variant="ghost" onClick={() => router.push(`/${organization}/works`)}>
                        <ArrowLeft />
                        Work
                    </Button>
                    <div className="mt-8 rounded-lg border border-dashed bg-card p-10 text-center">
                        <h1 className="text-lg font-semibold">Work not found</h1>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-n8 h-screen overflow-auto">
            <div className="container mx-auto mt-6 max-w-6xl px-4 py-6 sm:mt-8 sm:px-6 lg:px-8 2xl:px-4">
                <Button variant="ghost" className="mb-5 w-fit" onClick={() => router.push(`/${organization}/works`)}>
                    <ArrowLeft />
                    Work
                </Button>

                <header className="rounded-lg border bg-card p-6 text-card-foreground">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                                {isEditingTitle ? (
                                    <form
                                        className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-xl"
                                        onSubmit={event => {
                                            event.preventDefault();
                                            submitTitle();
                                        }}
                                    >
                                        <Input
                                            value={titleDraft}
                                            onChange={event => setTitleDraft(event.target.value)}
                                            onKeyDown={event => {
                                                if (event.key === 'Escape') {
                                                    event.preventDefault();
                                                    cancelEditingTitle();
                                                }
                                            }}
                                            className="h-9 min-w-0 text-lg font-semibold"
                                            autoFocus
                                            disabled={updateTitleMutation.isPending}
                                        />
                                        <Button
                                            type="submit"
                                            size="icon-sm"
                                            variant="secondary"
                                            disabled={updateTitleMutation.isPending || !titleDraft.trim()}
                                            aria-label="Save title"
                                            title="Save title"
                                        >
                                            {updateTitleMutation.isPending ? <Loader2 className="animate-spin" /> : <Check />}
                                        </Button>
                                        <Button
                                            type="button"
                                            size="icon-sm"
                                            variant="ghost"
                                            onClick={cancelEditingTitle}
                                            disabled={updateTitleMutation.isPending}
                                            aria-label="Cancel title edit"
                                            title="Cancel title edit"
                                        >
                                            <X />
                                        </Button>
                                    </form>
                                ) : (
                                    <div className="flex min-w-0 items-center gap-2">
                                        <h1 className="truncate text-2xl font-semibold tracking-tight">{work.title}</h1>
                                        <Button type="button" variant="ghost" size="icon-sm" onClick={startEditingTitle} aria-label="Edit title" title="Edit title">
                                            <Pencil />
                                        </Button>
                                    </div>
                                )}
                                <Badge variant="outline" className={workLifecycleDisplayStatusClassName(workLifecycleStatus)}>
                                    {workLifecycleDisplayStatusLabel(workLifecycleStatus)}
                                </Badge>
                                <Badge variant="secondary">{work.createdBy === 'agent' ? 'Created by AI' : 'Created by You'}</Badge>
                            </div>
                            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                                <span className="inline-flex items-center gap-1.5">
                                    <Database className="size-4" />
                                    Data Source: {connection?.name ?? work.connectionId}
                                </span>
                                <span>Created {formatRelativeTime(work.createdAt)}</span>
                                <span>Last updated {formatRelativeTime(work.updatedAt)}</span>
                            </div>
                        </div>
                        <div className="flex w-full flex-col gap-3 sm:w-auto sm:min-w-44">
                            <Button onClick={() => runWorkMutation.mutate({})} disabled={isRunRunning || runWorkMutation.isPending || !goal.trim()}>
                                {isRunRunning || runWorkMutation.isPending ? <Loader2 className="animate-spin" /> : <Play />}
                                {isRunRunning ? 'Running' : latestRun ? 'Run again' : 'Run'}
                            </Button>
                            <div className="rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground">
                                <div className="font-medium text-foreground">Evidence</div>
                                <div className="mt-1">{evidenceSummary}</div>
                                <div className="mt-1">{conclusionEvidenceLine}</div>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="mt-6 grid gap-6">
                    <section className="rounded-lg border bg-card p-6 text-card-foreground">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-base font-semibold">Goal</h2>
                            <Button size="sm" variant="secondary" onClick={() => updateGoalMutation.mutate(goal.trim())} disabled={!goal.trim() || updateGoalMutation.isPending}>
                                {updateGoalMutation.isPending && <Loader2 className="animate-spin" />}
                                Save
                            </Button>
                        </div>
                        <Textarea value={goal} onChange={event => setGoal(event.target.value)} className="min-h-28 resize-none text-sm" />
                    </section>

                    <section className="rounded-lg border bg-card p-6 text-card-foreground">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-base font-semibold">Latest Agent Run</h2>
                                    {latestRun ? (
                                        <Badge variant="outline" className={runStatusClassName(latestRun.status)}>
                                            {runStatusLabel(latestRun.status)}
                                        </Badge>
                                    ) : null}
                                </div>
                                {latestRun ? (
                                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                        <span>Started {formatRelativeTime(latestRun.startedAt)}</span>
                                        <span>Completed {formatRelativeTime(latestRun.completedAt)}</span>
                                        {latestEvent ? <span className="truncate">Latest: {latestEvent.content || eventTypeLabel(latestEvent.type)}</span> : null}
                                    </div>
                                ) : (
                                    <p className="mt-2 text-sm text-muted-foreground">Run the Work to let Dory investigate the goal and record its steps here.</p>
                                )}
                            </div>
                            <Button size="sm" variant="secondary" onClick={() => setRunDetailsOpen(value => !value)} disabled={!latestRun}>
                                <ChevronDown className={runDetailsOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                                {runDetailsOpen ? 'Hide details' : 'View details'}
                            </Button>
                        </div>

                        {latestRun && runDetailsOpen ? (
                            <div className="mt-5 grid gap-3">
                                {latestRunEvents.length ? (
                                    latestRunEvents.map(event => <WorkRunEventRow key={event.id} event={event} onCopySql={copySql} onManualExecute={openSqlInConsole} />)
                                ) : (
                                    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                                        {latestRun.status === 'running' ? 'Waiting for the first Agent event...' : 'No events recorded for this run.'}
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </section>

                    <section className="rounded-lg border bg-card p-6 text-card-foreground">
                        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <h2 className="text-base font-semibold">Analyses</h2>
                                <p className="mt-1 text-sm text-muted-foreground">{evidenceSummary}</p>
                                <p className="mt-1 text-sm text-muted-foreground">Conclusion uses included analyses.</p>
                                {unconfirmedAnalysisSummary ? <p className="mt-1 text-sm text-muted-foreground">{unconfirmedAnalysisSummary}</p> : null}
                            </div>
                            <div className="flex w-full gap-2 sm:w-auto">
                                <Input value={investigationTitle} onChange={event => setInvestigationTitle(event.target.value)} placeholder="Analysis title" className="sm:w-64" />
                                <Button
                                    onClick={() => createInvestigationMutation.mutate(investigationTitle.trim())}
                                    disabled={!investigationTitle.trim() || createInvestigationMutation.isPending || runWorkMutation.isPending || isRunRunning}
                                >
                                    {createInvestigationMutation.isPending || runWorkMutation.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
                                    New
                                </Button>
                            </div>
                        </div>

                        {investigations.length ? (
                            <div className="grid gap-3 md:grid-cols-2">
                                {investigations.map(investigation => (
                                    <AnalysisCard
                                        key={investigation.id}
                                        investigation={investigation}
                                        latestRun={latestRun}
                                        latestRunEvents={latestRunEvents}
                                        openingInvestigationId={openingInvestigationId}
                                        onOpen={openInvestigation}
                                        onPrefetch={prefetchInvestigationWorkspace}
                                        onDelete={setDeletingInvestigation}
                                        onUpdateAuditStatus={(investigation, auditStatus) => updateAnalysisAuditStatusMutation.mutate({ investigation, auditStatus })}
                                        auditStatusUpdatingId={
                                            updateAnalysisAuditStatusMutation.isPending ? (updateAnalysisAuditStatusMutation.variables?.investigation.id ?? null) : null
                                        }
                                        auditStatusUpdatingTo={
                                            updateAnalysisAuditStatusMutation.isPending ? (updateAnalysisAuditStatusMutation.variables?.auditStatus ?? null) : null
                                        }
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-lg border border-dashed p-8 text-center">
                                <h3 className="text-sm font-semibold">No analyses yet</h3>
                                <p className="mt-2 text-sm text-muted-foreground">Run the Agent or create an Analysis to start producing findings.</p>
                            </div>
                        )}
                    </section>

                    <section className="rounded-lg border bg-card p-6 text-card-foreground">
                        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <h2 className="text-base font-semibold">Conclusion</h2>
                            {isEditingConclusion ? (
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                            setConclusion(work.conclusion ?? '');
                                            setIsEditingConclusion(false);
                                        }}
                                        disabled={updateConclusionMutation.isPending}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => updateConclusionMutation.mutate(conclusion)}
                                        disabled={updateConclusionMutation.isPending || (Boolean(conclusion.trim()) && !hasIncludedAnalysis)}
                                        title={!hasIncludedAnalysis && conclusion.trim() ? 'Include at least one Analysis before saving a conclusion' : undefined}
                                    >
                                        {updateConclusionMutation.isPending && <Loader2 className="animate-spin" />}
                                        Save
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={regenerateConclusionFromIncluded}
                                        disabled={!hasIncludedAnalysis || updateConclusionMutation.isPending}
                                        title={!hasIncludedAnalysis ? 'Include at least one Analysis before regenerating a Conclusion' : excludedAnalysisTitle}
                                    >
                                        {updateConclusionMutation.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                                        Regenerate from Included
                                    </Button>
                                    <Button size="sm" variant="secondary" onClick={() => setIsEditingConclusion(true)}>
                                        Edit
                                    </Button>
                                </div>
                            )}
                        </div>
                        <div className="mb-4 rounded-lg border bg-background p-4 text-sm">
                            {hasIncludedAnalysis ? (
                                <>
                                    <div className="font-medium">
                                        Based on {conclusionSourceBoundary.includedAnalyses.length} included {pluralizeAnalysis(conclusionSourceBoundary.includedAnalyses.length)}:
                                    </div>
                                    <ul className="mt-2 space-y-1 text-muted-foreground">
                                        {conclusionSourceBoundary.includedAnalyses.map(analysis => (
                                            <li key={analysis.id}>
                                                - {analysis.title} · {analysis.provenanceLabel}
                                            </li>
                                        ))}
                                    </ul>
                                    {conclusionSourceBoundary.excludedAnalyses.length ? (
                                        <>
                                            <div className="mt-4 font-medium">Excluded:</div>
                                            <ul className="mt-2 space-y-1 text-muted-foreground">
                                                {conclusionSourceBoundary.excludedAnalyses.map(analysis => (
                                                    <li key={analysis.id}>
                                                        - {analysis.title} · {analysis.provenanceLabel}
                                                    </li>
                                                ))}
                                            </ul>
                                        </>
                                    ) : null}
                                </>
                            ) : (
                                <>
                                    <div className="font-medium">No included analysis yet.</div>
                                    <p className="mt-2 text-muted-foreground">Include at least one Analysis to generate a Conclusion.</p>
                                </>
                            )}
                        </div>
                        {isEditingConclusion ? (
                            <>
                                {!hasIncludedAnalysis ? (
                                    <p className="mb-3 text-sm text-amber-600 dark:text-amber-400">Include at least one Analysis before saving a Conclusion.</p>
                                ) : null}
                                <Textarea
                                    value={conclusion}
                                    onChange={event => setConclusion(event.target.value)}
                                    placeholder="Summarize the final reasoning and recommended next steps."
                                    className="min-h-36 resize-none text-sm"
                                />
                            </>
                        ) : hasIncludedAnalysis && includedAnalysisConclusion ? (
                            <div className="min-h-36 rounded-lg border bg-background p-4 text-sm">
                                <MessageResponse>{includedAnalysisConclusion}</MessageResponse>
                            </div>
                        ) : (
                            <div className="min-h-36 rounded-lg border border-dashed bg-background p-6 text-sm text-muted-foreground">
                                {hasIncludedAnalysis ? 'No included findings yet.' : 'No included analysis yet.'}
                            </div>
                        )}
                    </section>
                </main>
            </div>
            <AlertDialog open={Boolean(deletingInvestigation)} onOpenChange={open => !open && setDeletingInvestigation(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Analysis?</AlertDialogTitle>
                        <AlertDialogDescription>This will delete the Analysis, its findings, workspace snapshots, and linked Work SQL tabs.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteInvestigationMutation.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={deleteInvestigationMutation.isPending}
                            onClick={() => deletingInvestigation && deleteInvestigationMutation.mutate(deletingInvestigation)}
                        >
                            {deleteInvestigationMutation.isPending && <Loader2 className="animate-spin" />}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function AnalysisCard({
    investigation,
    latestRun,
    latestRunEvents,
    openingInvestigationId,
    auditStatusUpdatingId,
    auditStatusUpdatingTo,
    onOpen,
    onPrefetch,
    onDelete,
    onUpdateAuditStatus,
}: {
    investigation: WorkInvestigation;
    latestRun: WorkRun | null;
    latestRunEvents: WorkRunEvent[];
    openingInvestigationId: string | null;
    auditStatusUpdatingId: string | null;
    auditStatusUpdatingTo: WorkAnalysisAuditStatus | null;
    onOpen: (investigation: WorkInvestigation) => void;
    onPrefetch: (investigation: WorkInvestigation) => void;
    onDelete: (investigation: WorkInvestigation) => void;
    onUpdateAuditStatus: (investigation: WorkInvestigation, auditStatus: WorkAnalysisAuditStatus) => void;
}) {
    const effectiveStatus = effectiveInvestigationStatus({
        investigation,
        latestRun,
        latestRunEvents,
    });
    const activity = investigationActivityDisplay({
        investigation,
        latestRunEvents,
    });
    const isRunning = effectiveStatus === 'running';
    const showReviewControls = !isRunning;
    const isAuditStatusUpdating = auditStatusUpdatingId === investigation.id;
    const sqlBackedFinding = hasSqlBackedFinding(investigation);
    const isExcluded = investigation.auditStatus === 'rejected';
    const includeAuditStatus: WorkAnalysisAuditStatus = investigation.findings.some(finding => finding.createdBy === 'user') ? 'revised' : 'draft';
    const canConfirm = showReviewControls && !isExcluded && investigation.auditStatus !== 'accepted' && investigation.auditStatus !== 'reviewed';
    const canExclude = showReviewControls && !isExcluded;
    const canInclude = showReviewControls && isExcluded;

    return (
        <div className="flex min-h-56 flex-col rounded-lg border bg-background p-4">
            <div className="min-w-0">
                <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <div className="mb-1 text-[11px] font-medium uppercase tracking-normal text-muted-foreground">Title</div>
                        <h3 className="truncate text-sm font-semibold">{investigation.title}</h3>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon-sm" aria-label={`More actions for ${investigation.title}`} title="More actions">
                                <MoreVertical />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(investigation)}>
                                <Trash2 />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    {isRunning ? (
                        <Badge variant="outline" className={statusClassName(effectiveStatus)}>
                            <Loader2 className="mr-1 size-3 animate-spin" />
                            {statusLabel(effectiveStatus)}
                        </Badge>
                    ) : null}
                    {isRunning ? <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Agent is working</span> : null}
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3" />
                        {activity.label} {formatRelativeTime(activity.value)}
                    </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                    {canConfirm ? (
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            disabled={isAuditStatusUpdating || !sqlBackedFinding}
                            title={!sqlBackedFinding ? 'A SQL-backed Finding is required before confirmation' : undefined}
                            onClick={() => onUpdateAuditStatus(investigation, 'accepted')}
                        >
                            {isAuditStatusUpdating && auditStatusUpdatingTo === 'accepted' ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                            Confirm
                        </Button>
                    ) : null}
                    {canExclude ? (
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs text-muted-foreground"
                            disabled={isAuditStatusUpdating}
                            onClick={() => onUpdateAuditStatus(investigation, 'rejected')}
                        >
                            {isAuditStatusUpdating && auditStatusUpdatingTo === 'rejected' ? <Loader2 className="animate-spin" /> : <X />}
                            Exclude
                        </Button>
                    ) : null}
                    {canInclude ? (
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            disabled={isAuditStatusUpdating}
                            onClick={() => onUpdateAuditStatus(investigation, includeAuditStatus)}
                        >
                            {isAuditStatusUpdating && auditStatusUpdatingTo === includeAuditStatus ? <Loader2 className="animate-spin" /> : <Check />}
                            Include
                        </Button>
                    ) : null}
                </div>
            </div>
            <div className="mt-5 min-w-0 flex-1">
                <div className="mb-2 text-[11px] font-medium uppercase tracking-normal text-muted-foreground">Findings</div>
                {investigation.findings.length ? (
                    <ul className="space-y-2 text-sm leading-6">
                        {investigation.findings.map(finding => (
                            <li key={finding.id} className="flex gap-2">
                                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/70" />
                                <span className="min-w-0 whitespace-pre-wrap">{finding.content}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-muted-foreground">Waiting for findings.</p>
                )}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Assets</span>
                    <span className="ml-2">{investigation.sqlAssetCount} SQL</span>
                </div>
                <Button
                    size="sm"
                    variant="secondary"
                    onPointerEnter={() => onPrefetch(investigation)}
                    onFocus={() => onPrefetch(investigation)}
                    onClick={() => onOpen(investigation)}
                    disabled={openingInvestigationId === investigation.id}
                >
                    {openingInvestigationId === investigation.id ? <Loader2 className="animate-spin" /> : <ArrowUpRight />}
                    Open Workspace
                </Button>
            </div>
        </div>
    );
}

function WorkRunEventRow({
    event,
    onCopySql,
    onManualExecute,
}: {
    event: WorkRunEvent;
    onCopySql: (sql: string) => void | Promise<void>;
    onManualExecute: (payload: { sql: string; database: string | null; mode?: SqlResultManualExecutionMode }) => void;
}) {
    const [open, setOpen] = useState(false);
    const isError = event.type === 'error';
    const isAgentMessage = event.type === 'message' && event.role === 'agent';
    const sqlInput = getSqlInputFromEvent(event);
    const sqlResult = getSqlResultFromEvent(event);
    const hasDetails = Boolean(sqlInput || sqlResult || event.payload);

    return (
        <div
            className={
                isError
                    ? 'rounded-lg border border-red-200 bg-red-50/70 p-4 text-red-900 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-200'
                    : 'rounded-lg border bg-background p-4'
            }
        >
            <Collapsible open={open} onOpenChange={setOpen}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={isError ? 'destructive' : 'secondary'}>{eventTypeLabel(event.type)}</Badge>
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <Bot className="size-3" />
                                {event.role}
                            </span>
                            {hasDetails ? (
                                <CollapsibleTrigger asChild>
                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground">
                                        <ChevronDown className={open ? 'size-3 rotate-180 transition-transform' : 'size-3 transition-transform'} />
                                        {open ? 'Hide details' : 'View details'}
                                    </Button>
                                </CollapsibleTrigger>
                            ) : null}
                        </div>
                        {event.content ? (
                            <p className={isAgentMessage ? 'mt-3 whitespace-pre-wrap text-sm leading-6' : 'mt-3 break-words text-sm text-muted-foreground'}>{event.content}</p>
                        ) : null}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(event.createdAt)}</span>
                </div>

                {hasDetails ? (
                    <CollapsibleContent>
                        <div className="mt-4 space-y-3 rounded-lg border bg-card/40 p-3">
                            {sqlInput ? <SqlStatementBlock sql={sqlInput} onCopy={onCopySql} /> : null}
                            {sqlResult ? <SqlResultBody result={sqlResult} onManualExecute={onManualExecute} mode="global" embedded /> : null}
                            {!sqlInput && !sqlResult && event.payload ? <EventPayloadPreview payload={event.payload} /> : null}
                        </div>
                    </CollapsibleContent>
                ) : null}
            </Collapsible>
        </div>
    );
}

function EventPayloadPreview({ payload }: { payload: Record<string, unknown> }) {
    return <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">{JSON.stringify(payload, null, 2)}</pre>;
}

function getSqlInputFromEvent(event: WorkRunEvent) {
    const payload = event.payload;
    if (!payload || typeof payload !== 'object') return null;
    if (event.type === 'sql_executed') {
        const sql = payload.sql;
        return typeof sql === 'string' && sql.trim() ? sql : null;
    }
    if (payload.toolName !== 'sqlRunner') return null;
    const input = payload.input;
    if (!input || typeof input !== 'object') return null;
    const sql = (input as Record<string, unknown>).sql;
    return typeof sql === 'string' && sql.trim() ? sql : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseSqlResultColumns(value: unknown) {
    if (!Array.isArray(value)) return [];

    return value.map(column => {
        const record = isRecord(column) ? column : {};
        return {
            name: String(record.name ?? ''),
            type: record.type != null ? String(record.type) : null,
        };
    });
}

function parseSqlResultRows(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.filter(isRecord);
}

function getSqlResultFromEvent(event: WorkRunEvent): SqlResultPart | null {
    const payload = event.payload;
    if (!payload || typeof payload !== 'object') return null;
    if (event.type === 'sql_executed') {
        return getSqlResultFromQueryPayload(payload.query);
    }
    if (payload.toolName !== 'sqlRunner') return null;

    const output = payload.output;
    if (!output || typeof output !== 'object') return null;
    const candidate = output as Record<string, unknown>;
    if (candidate.type !== 'sql-result') return null;
    const manualExecution = isRecord(candidate.manualExecution) ? candidate.manualExecution : null;
    const error = isRecord(candidate.error) ? candidate.error : null;

    return {
        type: 'sql-result',
        ok: Boolean(candidate.ok),
        sql: String(candidate.sql ?? ''),
        database: typeof candidate.database === 'string' ? candidate.database : null,
        manualExecution:
            candidate.ok === false && manualExecution?.required
                ? {
                      required: true,
                      reason: 'non-readonly-query',
                  }
                : undefined,
        previewRows: parseSqlResultRows(candidate.previewRows),
        columns: parseSqlResultColumns(candidate.columns),
        rowCount: typeof candidate.rowCount === 'number' ? candidate.rowCount : undefined,
        truncated: Boolean(candidate.truncated),
        durationMs: typeof candidate.durationMs === 'number' ? candidate.durationMs : undefined,
        error:
            candidate.ok === false && error
                ? {
                      message: String(error.message ?? 'SQL execution failed'),
                  }
                : undefined,
        timestamp: typeof candidate.timestamp === 'string' ? candidate.timestamp : undefined,
    };
}

function getSqlResultFromQueryPayload(query: unknown): SqlResultPart | null {
    if (!query || typeof query !== 'object') return null;
    const record = query as Record<string, unknown>;
    const firstSet = Array.isArray(record.queryResultSets) && isRecord(record.queryResultSets[0]) ? record.queryResultSets[0] : undefined;
    if (!firstSet) return null;
    const results = Array.isArray(record.results) ? record.results : [];
    const rows = parseSqlResultRows(results[0]);
    const session = isRecord(record.session) ? record.session : {};

    return {
        type: 'sql-result',
        ok: firstSet.status !== 'error',
        sql: String(firstSet.sqlText ?? session.sqlText ?? ''),
        database: typeof session.database === 'string' ? session.database : null,
        previewRows: rows,
        columns: parseSqlResultColumns(firstSet.columns),
        rowCount: typeof firstSet.rowCount === 'number' ? firstSet.rowCount : undefined,
        truncated: Boolean(firstSet.limited),
        durationMs: typeof firstSet.durationMs === 'number' ? firstSet.durationMs : typeof session.durationMs === 'number' ? session.durationMs : undefined,
        error:
            firstSet.status === 'error'
                ? {
                      message: String(firstSet.errorMessage ?? 'SQL execution failed'),
                  }
                : undefined,
        timestamp: typeof firstSet.finishedAt === 'string' ? firstSet.finishedAt : undefined,
    };
}

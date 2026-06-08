'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpRight, Bot, ChevronDown, Clock, Database, Loader2, Play, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import { SqlResultBody, SqlStatementBlock } from '@/components/@dory/ui/ai/sql-result';
import type { SqlResultManualExecutionMode, SqlResultPart } from '@/components/@dory/ui/ai/sql-result/type';
import { MessageResponse } from '@/components/ai-elements/message';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/registry/new-york-v4/ui/collapsible';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Label } from '@/registry/new-york-v4/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import { useConnections } from '../../connections/hooks/use-connections';
import type { Work, WorkDetail, WorkInvestigation, WorkRunEvent, WorkStatus } from '../types';
import { eventTypeLabel, formatRelativeTime, runStatusClassName, runStatusLabel, statusClassName, statusLabel } from '../utils';

type WorkDetailPageClientProps = {
    organization: string;
    workId: string;
};

const statusOptions: WorkStatus[] = ['draft', 'running', 'completed'];

export function WorkDetailPageClient({ organization, workId }: WorkDetailPageClientProps) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const connectionsQuery = useConnections();
    const [goal, setGoal] = useState('');
    const [conclusion, setConclusion] = useState('');
    const [isEditingConclusion, setIsEditingConclusion] = useState(false);
    const [investigationTitle, setInvestigationTitle] = useState('');
    const [openingInvestigationId, setOpeningInvestigationId] = useState<string | null>(null);
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
    const investigations = workQuery.data?.investigations ?? [];
    const latestRun = workQuery.data?.latestRun ?? null;
    const latestRunEvents = workQuery.data?.latestRunEvents ?? [];
    const connection = work ? connectionById.get(work.connectionId) : null;
    const isRunRunning = latestRun?.status === 'running' || work?.status === 'running';
    const latestEvent = latestRunEvents[latestRunEvents.length - 1] ?? null;

    useEffect(() => {
        if (!work) return;
        setGoal(work.goal);
        if (!isEditingConclusion) {
            setConclusion(work.conclusion ?? '');
        }
    }, [work, isEditingConclusion]);

    const invalidateWork = () => queryClient.invalidateQueries({ queryKey: ['work', workId] });

    useEffect(() => {
        if (latestRun?.status === 'running') {
            setRunDetailsOpen(true);
        }
    }, [latestRun?.status]);

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

    const updateStatusMutation = useMutation({
        mutationFn: (status: WorkStatus) => executeActionClient<Work>('work.updateStatus', { id: workId, status }),
        onSuccess: () => invalidateWork(),
        onError: error => toast.error(error instanceof Error ? error.message : 'Failed to update status'),
    });

    const createInvestigationMutation = useMutation({
        mutationFn: (title: string) => executeActionClient<WorkInvestigation>('work.createInvestigation', { workId, title }),
        onSuccess: () => {
            setInvestigationTitle('');
            invalidateWork();
        },
        onError: error => toast.error(error instanceof Error ? error.message : 'Failed to create Analysis'),
    });

    const runWorkMutation = useMutation({
        mutationFn: async () => {
            if (work && goal.trim() && goal.trim() !== work.goal) {
                await executeActionClient<Work>('work.updateGoal', { id: workId, goal: goal.trim() });
                await invalidateWork();
            }

            const response = await fetch(`/api/work/${encodeURIComponent(workId)}/run`, {
                method: 'POST',
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

    const openInvestigation = async (investigation: WorkInvestigation) => {
        if (!work) return;
        setOpeningInvestigationId(investigation.id);
        try {
            if (!investigation.linkedTabId) {
                await executeActionClient<WorkInvestigation>('work.ensureInvestigationWorkspace', {
                    workId,
                    investigationId: investigation.id,
                });
            }

            router.push(`/${organization}/works/${workId}/investigations/${investigation.id}`);
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : 'Failed to open Analysis');
        } finally {
            setOpeningInvestigationId(null);
        }
    };

    if (workQuery.isLoading) {
        return (
            <div className="bg-n8 h-screen overflow-auto">
                <div className="container mx-auto mt-10 p-12 lg:p-12 xl:p-8 2xl:p-4">
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
                <div className="container mx-auto mt-10 p-12 lg:p-12 xl:p-8 2xl:p-4">
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
            <div className="container mx-auto mt-10 max-w-6xl p-12 lg:p-12 xl:p-8 2xl:p-4">
                <Button variant="ghost" className="mb-5 w-fit" onClick={() => router.push(`/${organization}/works`)}>
                    <ArrowLeft />
                    Work
                </Button>

                <header className="rounded-lg border bg-card p-6 text-card-foreground">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                                <h1 className="truncate text-2xl font-semibold tracking-tight">{work.title}</h1>
                                <Badge variant="outline" className={statusClassName(work.status)}>
                                    {statusLabel(work.status)}
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
                            <Button onClick={() => runWorkMutation.mutate()} disabled={isRunRunning || runWorkMutation.isPending || !goal.trim()}>
                                {isRunRunning || runWorkMutation.isPending ? <Loader2 className="animate-spin" /> : <Play />}
                                {isRunRunning ? 'Running' : latestRun ? 'Run again' : 'Run'}
                            </Button>
                            <div>
                                <Label className="mb-2 block text-xs text-muted-foreground">Status</Label>
                                <Select value={work.status} onValueChange={value => updateStatusMutation.mutate(value as WorkStatus)} disabled={isRunRunning || updateStatusMutation.isPending}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {statusOptions.map(status => (
                                            <SelectItem key={status} value={status}>
                                                {statusLabel(status)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
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
                                    latestRunEvents.map(event => (
                                        <WorkRunEventRow key={event.id} event={event} onCopySql={copySql} onManualExecute={openSqlInConsole} />
                                    ))
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
                                <p className="mt-1 text-sm text-muted-foreground">Build findings from SQL workspaces and Agent analysis.</p>
                            </div>
                            <div className="flex w-full gap-2 sm:w-auto">
                                <Input
                                    value={investigationTitle}
                                    onChange={event => setInvestigationTitle(event.target.value)}
                                    placeholder="Analysis title"
                                    className="sm:w-64"
                                />
                                <Button
                                    onClick={() => createInvestigationMutation.mutate(investigationTitle.trim())}
                                    disabled={!investigationTitle.trim() || createInvestigationMutation.isPending}
                                >
                                    {createInvestigationMutation.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
                                    New
                                </Button>
                            </div>
                        </div>

                        {investigations.length ? (
                            <div className="grid gap-3 md:grid-cols-2">
                                {investigations.map(investigation => (
                                    <div key={investigation.id} className="flex min-h-56 flex-col rounded-lg border bg-background p-4">
                                        <div className="min-w-0">
                                            <div className="mb-1 text-[11px] font-medium uppercase tracking-normal text-muted-foreground">Title</div>
                                            <h3 className="truncate text-sm font-semibold">{investigation.title}</h3>
                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                                <Badge variant="outline" className={statusClassName(investigation.status)}>
                                                    {statusLabel(investigation.status)}
                                                </Badge>
                                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                                    <Clock className="size-3" />
                                                    Last query {formatRelativeTime(investigation.lastQueryAt)}
                                                </span>
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
                                            <Button size="sm" variant="secondary" onClick={() => openInvestigation(investigation)} disabled={openingInvestigationId === investigation.id}>
                                                {openingInvestigationId === investigation.id ? <Loader2 className="animate-spin" /> : <ArrowUpRight />}
                                                Open Workspace
                                            </Button>
                                        </div>
                                    </div>
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
                        <div className="mb-4 flex items-center justify-between">
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
                                        disabled={updateConclusionMutation.isPending}
                                    >
                                        {updateConclusionMutation.isPending && <Loader2 className="animate-spin" />}
                                        Save
                                    </Button>
                                </div>
                            ) : (
                                <Button size="sm" variant="secondary" onClick={() => setIsEditingConclusion(true)}>
                                    Edit
                                </Button>
                            )}
                        </div>
                        {isEditingConclusion ? (
                            <Textarea
                                value={conclusion}
                                onChange={event => setConclusion(event.target.value)}
                                placeholder="Summarize the final reasoning and recommended next steps."
                                className="min-h-36 resize-none text-sm"
                            />
                        ) : work.conclusion ? (
                            <div className="min-h-36 rounded-lg border bg-background p-4 text-sm">
                                <MessageResponse>{work.conclusion}</MessageResponse>
                            </div>
                        ) : (
                            <div className="min-h-36 rounded-lg border border-dashed bg-background p-6 text-sm text-muted-foreground">No conclusion yet.</div>
                        )}
                    </section>
                </main>
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
        <div className={isError ? 'rounded-lg border border-red-200 bg-red-50/70 p-4 text-red-900 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-200' : 'rounded-lg border bg-background p-4'}>
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

function getSqlResultFromEvent(event: WorkRunEvent): SqlResultPart | null {
    const payload = event.payload;
    if (!payload || typeof payload !== 'object') return null;
    if (event.type === 'sql_executed') {
        return getSqlResultFromQueryPayload(payload.query);
    }
    if (payload.toolName !== 'sqlRunner') return null;

    const output = payload.output;
    if (!output || typeof output !== 'object') return null;
    const candidate = output as Record<string, any>;
    if (candidate.type !== 'sql-result') return null;

    return {
        type: 'sql-result',
        ok: Boolean(candidate.ok),
        sql: String(candidate.sql ?? ''),
        database: candidate.database ?? null,
        manualExecution:
            candidate.ok === false && candidate.manualExecution?.required
                ? {
                      required: true,
                      reason: 'non-readonly-query',
                  }
                : undefined,
        previewRows: Array.isArray(candidate.previewRows) ? candidate.previewRows : [],
        columns: Array.isArray(candidate.columns)
            ? candidate.columns.map((column: any) => ({
                  name: String(column?.name ?? ''),
                  type: column?.type != null ? String(column.type) : null,
              }))
            : [],
        rowCount: typeof candidate.rowCount === 'number' ? candidate.rowCount : undefined,
        truncated: Boolean(candidate.truncated),
        durationMs: typeof candidate.durationMs === 'number' ? candidate.durationMs : undefined,
        error:
            candidate.ok === false && candidate.error
                ? {
                      message: String(candidate.error?.message ?? 'SQL execution failed'),
                  }
                : undefined,
        timestamp: typeof candidate.timestamp === 'string' ? candidate.timestamp : undefined,
    };
}

function getSqlResultFromQueryPayload(query: unknown): SqlResultPart | null {
    if (!query || typeof query !== 'object') return null;
    const record = query as Record<string, any>;
    const firstSet = Array.isArray(record.queryResultSets) ? (record.queryResultSets[0] as Record<string, any> | undefined) : undefined;
    if (!firstSet) return null;
    const rows = Array.isArray(record.results?.[0]) ? record.results[0] : [];
    const session = record.session && typeof record.session === 'object' ? record.session : {};

    return {
        type: 'sql-result',
        ok: firstSet.status !== 'error',
        sql: String(firstSet.sqlText ?? session.sqlText ?? ''),
        database: typeof session.database === 'string' ? session.database : null,
        previewRows: rows,
        columns: Array.isArray(firstSet.columns)
            ? firstSet.columns.map((column: any) => ({
                  name: String(column?.name ?? ''),
                  type: column?.type != null ? String(column.type) : null,
              }))
            : [],
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

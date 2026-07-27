'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Clock3, History, Loader2, Pencil, Play, ShieldAlert, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import type { ConnectionListItem } from '@dory/shared/types/connections';

import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { useConnections } from '@/app/(app)/[organization]/connections/hooks/use-connections';
import { DataSourceCell, type DataSourceCellInfo } from '@/components/data-source/data-source-cell';
import type { ComparisonClient, ComparisonMutationClient, ComparisonRunClient } from '@/lib/comparison/client-types';
import { executeActionClient } from '@/lib/actions/client';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/registry/new-york-v4/ui/alert-dialog';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { AiReviewCard } from '../components/ai-review-card';
import { ComparisonHighlights } from '../components/comparison-highlights';
import { ComparisonRunStatus, dialectFamilyLabel } from '../components/comparison-status';
import { ComparisonSummary } from '../components/comparison-summary';

type RunListOutput = { rows: ComparisonRunClient[]; total: number };
type AiReviewOutput = { run: ComparisonRunClient };

function endpointLabel(endpoint: ComparisonClient['sourceEndpoint']) {
    return endpoint.database;
}

function endpointDataSource(endpoint: ComparisonClient['sourceEndpoint'], connectionsById: Map<string, ConnectionListItem>): DataSourceCellInfo {
    const connectionItem = connectionsById.get(endpoint.connectionId);
    const connection = connectionItem?.connection;
    const identity =
        connectionItem?.identities.find(item => item.id === endpoint.identityId) ?? (endpoint.identityId ? undefined : connectionItem?.identities.find(item => item.isDefault));

    return {
        connectionId: endpoint.connectionId,
        connectionName: connection?.name ?? endpoint.connectionId,
        connectionType: connection?.type,
        connectionHost: connection?.host,
        connectionPort: connection?.port,
        connectionHttpPort: connection?.httpPort,
        connectionEndpoint: connection?.path,
        databaseName: endpoint.database,
        identityName: identity?.name,
        identityUsername: identity?.username,
        identityRole: identity?.role,
    };
}

export function ComparisonDetailClient({ organization, comparisonId }: { organization: string; comparisonId: string }) {
    const t = useTranslations('SchemaCompare');
    const queryClient = useQueryClient();
    const organizationId = useOrganizationId();
    const autoReviewRunId = useRef<string | null>(null);
    const comparisonKey = ['comparison', organizationId, comparisonId] as const;
    const runsKey = ['comparison-runs', organizationId, comparisonId] as const;
    const comparisonQuery = useQuery({
        queryKey: comparisonKey,
        queryFn: () => executeActionClient<ComparisonClient>('comparison.get', { comparisonId }, { organizationId }),
        refetchInterval: query => {
            const run = query.state.data?.latestRun;
            return run?.status === 'running' || run?.aiReviewStatus === 'running' ? 1500 : false;
        },
    });
    const connectionsQuery = useConnections(organizationId);
    const connectionsById = useMemo(() => new Map((connectionsQuery.data ?? []).map(item => [item.connection.id, item])), [connectionsQuery.data]);
    const runsQuery = useQuery({
        queryKey: runsKey,
        queryFn: () => executeActionClient<RunListOutput>('comparison.run.list', { comparisonId, limit: 50 }, { organizationId }),
        refetchInterval: query => (query.state.data?.rows[0]?.status === 'running' ? 1500 : false),
    });
    const runMutation = useMutation({
        mutationFn: () => executeActionClient<ComparisonMutationClient>('comparison.run.create', { comparisonId }, { organizationId }),
        onSuccess: async () => {
            await Promise.all([queryClient.invalidateQueries({ queryKey: comparisonKey }), queryClient.invalidateQueries({ queryKey: runsKey })]);
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.RunFailed')),
    });
    const reviewMutation = useMutation({
        mutationFn: (runId: string) => executeActionClient<AiReviewOutput>('comparison.run.aiReview', { comparisonId, runId }, { organizationId }),
        onSuccess: async output => {
            queryClient.setQueryData<ComparisonClient>(comparisonKey, current => {
                if (!current) return current;
                return {
                    ...current,
                    latestRun: current.latestRun?.id === output.run.id ? output.run : current.latestRun,
                    latestSuccessfulRun: current.latestSuccessfulRun?.id === output.run.id ? output.run : current.latestSuccessfulRun,
                };
            });
            await queryClient.invalidateQueries({ queryKey: runsKey });
        },
        onError: () => {
            void comparisonQuery.refetch();
            void runsQuery.refetch();
        },
    });
    const deleteMutation = useMutation({
        mutationFn: () =>
            executeActionClient<{ deleted: string[] }>(
                'comparison.delete',
                { comparisonId },
                {
                    organizationId,
                    confirmationToken: 'user-confirmed',
                    reason: 'Delete Comparison and immutable run history',
                },
            ),
        onSuccess: () => {
            window.location.assign(`/${encodeURIComponent(organization)}/comparisons`);
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.DeleteFailed')),
    });

    useEffect(() => {
        const run = comparisonQuery.data?.latestRun;
        if (!run || run.status !== 'success' || run.aiReviewStatus !== 'pending' || autoReviewRunId.current === run.id) return;
        autoReviewRunId.current = run.id;
        reviewMutation.mutate(run.id);
    }, [comparisonQuery.data?.latestRun, reviewMutation]);

    if (comparisonQuery.isLoading || !comparisonQuery.data) {
        return (
            <div className="flex h-screen items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 animate-spin" />
                {t('Loading')}
            </div>
        );
    }

    const comparison = comparisonQuery.data;
    const latestRun = comparison.latestRun;
    const successfulRun = comparison.latestSuccessfulRun;
    const active = latestRun?.status === 'running';
    const objectTypesLabel = comparison.objectTypes.map(type => t(`Object.${type}`)).join(' · ');

    return (
        <div className="bg-n8 h-screen overflow-auto">
            <main className="container mx-auto flex flex-col gap-4 px-12 pt-8 pb-12 lg:px-12 xl:px-8 2xl:px-4">
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2">
                            <Link href={`/${encodeURIComponent(organization)}/comparisons`}>
                                <ArrowLeft />
                                {t('Back')}
                            </Link>
                        </Button>
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-2xl font-semibold">{comparison.name}</h1>
                            <ComparisonRunStatus run={latestRun} />
                        </div>
                        {latestRun ? (
                            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Clock3 className="h-3.5 w-3.5" />
                                {t('Detail.LastChecked', { date: new Date(latestRun.startedAt).toLocaleString() })}
                            </div>
                        ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => runMutation.mutate()} disabled={active || runMutation.isPending}>
                            {runMutation.isPending ? <Loader2 className="animate-spin" /> : <Play />}
                            {t('Detail.RunNow')}
                        </Button>
                        <Button asChild variant="outline" aria-disabled={active}>
                            <Link
                                href={`/${encodeURIComponent(organization)}/comparisons/${encodeURIComponent(comparisonId)}/edit`}
                                className={active ? 'pointer-events-none opacity-50' : undefined}
                            >
                                <Pencil />
                                {t('Edit.Action')}
                            </Link>
                        </Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="outline" className="text-destructive hover:text-destructive" disabled={active}>
                                    <Trash2 />
                                    {t('Delete')}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>{t('DeleteDialog.Title')}</AlertDialogTitle>
                                    <AlertDialogDescription>{t('DeleteDialog.Description')}</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteMutation.mutate()}>{t('Delete')}</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </header>

                <Card className="gap-0 py-0">
                    <CardHeader className="px-4 pt-4 pb-3">
                        <CardTitle className="text-base">{t('Detail.Configuration')}</CardTitle>
                        <CardDescription>
                            {t('Detail.ConfigurationVersion', { version: comparison.configurationVersion })} · {dialectFamilyLabel(comparison.dialectFamily)}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 px-4 pb-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,1fr)] lg:items-center">
                        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-lg bg-muted/35 px-3 py-2.5">
                            <div className="min-w-0">
                                <span className="sr-only">{t('Current')}</span>
                                <DataSourceCell dataSource={endpointDataSource(comparison.sourceEndpoint, connectionsById)} className="max-w-full" />
                                <div className="mt-0.5 truncate px-1 font-mono text-xs text-muted-foreground" title={endpointLabel(comparison.sourceEndpoint)}>
                                    {endpointLabel(comparison.sourceEndpoint)}
                                </div>
                            </div>
                            <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <div className="min-w-0">
                                <span className="sr-only">{t('Desired')}</span>
                                <DataSourceCell dataSource={endpointDataSource(comparison.targetEndpoint, connectionsById)} className="max-w-full" />
                                <div className="mt-0.5 truncate px-1 font-mono text-xs text-muted-foreground" title={endpointLabel(comparison.targetEndpoint)}>
                                    {endpointLabel(comparison.targetEndpoint)}
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-2 text-sm">
                            <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3">
                                <span className="text-muted-foreground">{t('Create.Schemas')}</span>
                                <span className="truncate font-medium" title={comparison.schemaFilter.join(', ') || t('Detail.AllSchemas')}>
                                    {comparison.schemaFilter.join(', ') || t('Detail.AllSchemas')}
                                </span>
                            </div>
                            <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3">
                                <span className="text-muted-foreground">{t('Create.CompareObjects')}</span>
                                <span className="truncate font-medium" title={objectTypesLabel}>
                                    {objectTypesLabel}
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {latestRun?.status === 'running' ? (
                    <Card>
                        <CardContent className="flex h-32 items-center justify-center text-muted-foreground">
                            <Loader2 className="mr-2 animate-spin" />
                            {t('Detail.Capturing')}
                        </CardContent>
                    </Card>
                ) : latestRun?.status === 'failed' ? (
                    <Card className="border-destructive/30">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-destructive">
                                <ShieldAlert />
                                {t('Detail.Failed')}
                            </CardTitle>
                            <CardDescription>{latestRun.failureMessage ?? t('Errors.RunFailed')}</CardDescription>
                        </CardHeader>
                    </Card>
                ) : successfulRun?.summary ? (
                    <>
                        <ComparisonSummary summary={successfulRun.summary} coverage={successfulRun.coverage} />
                        <AiReviewCard
                            run={successfulRun}
                            retrying={reviewMutation.isPending && reviewMutation.variables === successfulRun.id}
                            onRetry={() => reviewMutation.mutate(successfulRun.id)}
                        />
                        {successfulRun.resultSetId ? (
                            <ComparisonHighlights organization={organization} comparisonId={comparisonId} runId={successfulRun.id} resultSetId={successfulRun.resultSetId} />
                        ) : null}
                    </>
                ) : null}

                <Card className="gap-0 py-0">
                    <CardHeader className="px-4 pt-4 pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <History className="h-4 w-4" />
                            {t('Runs.Title')}
                        </CardTitle>
                        <CardDescription>{t('Runs.Description')}</CardDescription>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                        <div className="divide-y">
                            {(runsQuery.data?.rows ?? []).map(run => (
                                <Link
                                    key={run.id}
                                    href={`/${encodeURIComponent(organization)}/comparisons/${encodeURIComponent(comparisonId)}/runs/${encodeURIComponent(run.id)}`}
                                    className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0 hover:text-foreground"
                                >
                                    <div>
                                        <div className="text-sm font-medium">{new Date(run.startedAt).toLocaleString()}</div>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                            {t('Runs.ConfigurationVersion', { version: run.configurationSnapshot.configurationVersion })}
                                            {run.summary ? ` · ${t('Status.ChangeCount', { count: run.summary.totalChanges })}` : ''}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <ComparisonRunStatus run={run} />
                                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                </Link>
                            ))}
                            {!runsQuery.isLoading && !runsQuery.data?.rows.length ? <p className="text-sm text-muted-foreground">{t('Runs.Empty')}</p> : null}
                        </div>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}

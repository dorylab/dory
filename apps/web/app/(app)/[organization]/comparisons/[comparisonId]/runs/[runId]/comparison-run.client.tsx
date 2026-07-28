'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, ChevronRight, Clock3, Copy, GitCommitHorizontal, Loader2, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { CopyButton } from '@/components/@dory/ui/copy-button';
import { SchemaDiffViewer } from '@/components/result-set-artifact/schema-diff-viewer';
import type { ComparisonClient, ComparisonRunClient } from '@/lib/comparison/client-types';
import { executeActionClient } from '@/lib/actions/client';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/registry/new-york-v4/ui/collapsible';
import { AiReviewCard } from '../../../components/ai-review-card';
import { ComparisonRunStatus } from '../../../components/comparison-status';
import { ComparisonSummary } from '../../../components/comparison-summary';

export function ComparisonRunClientPage({ organization, comparisonId, runId }: { organization: string; comparisonId: string; runId: string }) {
    const t = useTranslations('SchemaCompare');
    const queryClient = useQueryClient();
    const organizationId = useOrganizationId();
    const autoReviewStarted = useRef(false);
    const runKey = ['comparison-run', organizationId, comparisonId, runId] as const;
    const comparisonQuery = useQuery({
        queryKey: ['comparison', organizationId, comparisonId],
        queryFn: () => executeActionClient<ComparisonClient>('comparison.get', { comparisonId }, { organizationId }),
    });
    const runQuery = useQuery({
        queryKey: runKey,
        queryFn: () => executeActionClient<ComparisonRunClient>('comparison.run.get', { comparisonId, runId }, { organizationId }),
        refetchInterval: query => {
            const run = query.state.data;
            return run?.status === 'running' || run?.aiReviewStatus === 'running' ? 1500 : false;
        },
    });
    const reviewMutation = useMutation({
        mutationFn: () => executeActionClient<{ run: ComparisonRunClient }>('comparison.run.aiReview', { comparisonId, runId }, { organizationId }),
        onSuccess: output => queryClient.setQueryData(runKey, output.run),
        onError: () => void runQuery.refetch(),
    });

    useEffect(() => {
        const run = runQuery.data;
        if (!run || run.status !== 'success' || run.aiReviewStatus !== 'pending' || autoReviewStarted.current) return;
        autoReviewStarted.current = true;
        reviewMutation.mutate();
    }, [reviewMutation, runQuery.data]);

    if (comparisonQuery.isLoading || runQuery.isLoading || !comparisonQuery.data || !runQuery.data) {
        return (
            <div className="flex h-screen items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 animate-spin" />
                {t('Loading')}
            </div>
        );
    }

    const comparison = comparisonQuery.data;
    const run = runQuery.data;
    const configuration = run.configurationSnapshot;
    const startedAt = new Date(run.startedAt).toLocaleString();
    const schemaScope = configuration.schemaFilter.length ? configuration.schemaFilter.join(', ') : t('Detail.AllSchemas');
    const objectScope = configuration.objectTypes.length ? configuration.objectTypes.map(type => t(`Object.${type}`)).join(' · ') : t('Object.all');
    const hasNoChanges = run.summary?.totalChanges === 0;
    const hasIncompleteCoverage = hasNoChanges && run.summary?.readiness === 'unknown';

    return (
        <div className="bg-n8 h-screen overflow-auto">
            <main className="container mx-auto flex flex-col gap-5 px-12 pt-8 pb-12 lg:px-12 xl:px-8 2xl:px-4">
                <header>
                    <Button asChild variant="ghost" size="sm" className="-ml-3 mb-3">
                        <Link href={`/${encodeURIComponent(organization)}/comparisons/${encodeURIComponent(comparisonId)}`}>
                            <ArrowLeft />
                            {comparison.name}
                        </Link>
                    </Button>
                    <div className="flex flex-wrap items-center gap-2">
                        <GitCommitHorizontal className="h-5 w-5 text-muted-foreground" />
                        <h1 className="text-2xl font-semibold">{t('Run.Title')}</h1>
                        <ComparisonRunStatus run={run} />
                    </div>
                </header>

                <Collapsible className="group overflow-hidden rounded-xl border bg-card shadow-xs">
                    <CollapsibleTrigger className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                        <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium">{t('Run.Context')}</div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                <span>{t('Runs.ConfigurationVersion', { version: configuration.configurationVersion })}</span>
                                <span aria-hidden="true">·</span>
                                <span className="flex items-center gap-1">
                                    <Clock3 className="size-3.5" />
                                    {startedAt}
                                </span>
                            </div>
                        </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="border-t">
                        <div className="grid gap-4 p-4">
                            <div className="grid gap-4 rounded-lg bg-muted/40 p-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
                                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                                    <div className="min-w-0">
                                        <div className="text-xs text-muted-foreground">{t('Source')}</div>
                                        <div className="mt-1 truncate font-mono text-sm" title={configuration.source.database}>
                                            {configuration.source.database}
                                        </div>
                                    </div>
                                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                                    <div className="min-w-0">
                                        <div className="text-xs text-muted-foreground">{t('Target')}</div>
                                        <div className="mt-1 truncate font-mono text-sm" title={configuration.target.database}>
                                            {configuration.target.database}
                                        </div>
                                    </div>
                                </div>
                                <dl className="grid gap-3 sm:grid-cols-2">
                                    <div className="min-w-0">
                                        <dt className="text-xs text-muted-foreground">{t('Create.Schemas')}</dt>
                                        <dd className="mt-1 truncate text-sm" title={schemaScope}>
                                            {schemaScope}
                                        </dd>
                                    </div>
                                    <div className="min-w-0">
                                        <dt className="text-xs text-muted-foreground">{t('Create.CompareObjects')}</dt>
                                        <dd className="mt-1 truncate text-sm" title={objectScope}>
                                            {objectScope}
                                        </dd>
                                    </div>
                                </dl>
                            </div>
                            <div className="flex flex-col gap-3 px-1 lg:flex-row lg:items-center lg:justify-between">
                                <p className="text-xs text-muted-foreground">{t('Run.ImmutableDescription')}</p>
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className="shrink-0 text-xs text-muted-foreground">{t('Run.RunId')}</span>
                                    <code className="min-w-0 select-all break-all text-xs text-foreground">{run.id}</code>
                                    <CopyButton
                                        text={run.id}
                                        variant="ghost"
                                        size="icon-xs"
                                        className="shrink-0"
                                        aria-label={t('Run.CopyRunId')}
                                        label={<Copy />}
                                        copiedLabel={<Check />}
                                    />
                                </div>
                            </div>
                            {run.status === 'success' && run.summary ? <ComparisonSummary summary={run.summary} coverage={run.coverage} /> : null}
                            {run.status === 'success' ? <AiReviewCard run={run} retrying={reviewMutation.isPending} onRetry={() => reviewMutation.mutate()} /> : null}
                        </div>
                    </CollapsibleContent>
                </Collapsible>

                {run.status === 'running' ? (
                    <Card>
                        <CardContent className="flex h-32 items-center justify-center text-muted-foreground">
                            <Loader2 className="mr-2 animate-spin" />
                            {t('Detail.Capturing')}
                        </CardContent>
                    </Card>
                ) : run.status === 'failed' ? (
                    <Card className="border-destructive/30">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-destructive">
                                <ShieldAlert />
                                {t('Detail.Failed')}
                            </CardTitle>
                            <CardDescription>{run.failureMessage ?? t('Errors.RunFailed')}</CardDescription>
                        </CardHeader>
                    </Card>
                ) : (
                    <section>
                        <div className="mb-3">
                            <h2 className="text-lg font-semibold">{t('Run.Changes')}</h2>
                            <p className="text-sm text-muted-foreground">{t('Run.ChangesDescription')}</p>
                        </div>
                        {hasNoChanges || !run.resultSetId ? (
                            <Card>
                                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                                    {t(hasIncompleteCoverage ? 'Status.NoChangesIncompleteDescription' : 'Status.NoChanges')}
                                </CardContent>
                            </Card>
                        ) : (
                            <SchemaDiffViewer resultSetId={run.resultSetId} organization={organizationId} />
                        )}
                    </section>
                )}
            </main>
        </div>
    );
}

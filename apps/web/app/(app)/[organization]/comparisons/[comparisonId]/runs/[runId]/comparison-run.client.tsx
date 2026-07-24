'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Clock3, GitCommitHorizontal, Loader2, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { SchemaDiffViewer } from '@/components/result-set-artifact/schema-diff-viewer';
import type { ComparisonClient, ComparisonRunClient } from '@/lib/comparison/client-types';
import { executeActionClient } from '@/lib/actions/client';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
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

    return (
        <div className="bg-n8 h-screen overflow-auto">
            <main className="container mx-auto flex flex-col gap-6 px-12 pt-8 pb-12 lg:px-12 xl:px-8 2xl:px-4">
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
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="font-mono">{run.id}</span>
                        <span className="flex items-center gap-1">
                            <Clock3 className="h-3.5 w-3.5" />
                            {new Date(run.startedAt).toLocaleString()}
                        </span>
                        <span>{t('Runs.ConfigurationVersion', { version: configuration.configurationVersion })}</span>
                    </div>
                </header>

                <Card>
                    <CardHeader>
                        <CardTitle>{t('Run.SnapshotConfiguration')}</CardTitle>
                        <CardDescription>{t('Run.ImmutableDescription')}</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-5 md:grid-cols-2">
                        <div className="rounded-lg bg-muted/50 p-4">
                            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('Source')}</div>
                            <div className="mt-2 font-mono text-sm">{configuration.source.database}</div>
                        </div>
                        <div className="rounded-lg bg-muted/50 p-4">
                            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('Target')}</div>
                            <div className="mt-2 font-mono text-sm">{configuration.target.database}</div>
                        </div>
                        <div className="md:col-span-2">
                            <div className="flex min-w-0 items-center gap-2 font-mono text-sm">
                                <span className="truncate">{configuration.source.database}</span>
                                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <span className="truncate">{configuration.target.database}</span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {configuration.objectTypes.map(type => (
                                    <Badge key={type} variant="secondary">
                                        {t(`Object.${type}`)}
                                    </Badge>
                                ))}
                                {configuration.schemaFilter.map(schema => (
                                    <Badge key={schema} variant="outline">
                                        {schema}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>

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
                ) : run.summary ? (
                    <>
                        <ComparisonSummary summary={run.summary} coverage={run.coverage} />
                        <AiReviewCard run={run} retrying={reviewMutation.isPending} onRetry={() => reviewMutation.mutate()} />
                        <section>
                            <div className="mb-3">
                                <h2 className="text-lg font-semibold">{t('Run.Changes')}</h2>
                                <p className="text-sm text-muted-foreground">{t('Run.ChangesDescription')}</p>
                            </div>
                            {run.resultSetId ? (
                                <SchemaDiffViewer resultSetId={run.resultSetId} organization={organizationId} />
                            ) : (
                                <Card>
                                    <CardContent className="py-10 text-center text-sm text-muted-foreground">{t('Status.NoChanges')}</CardContent>
                                </Card>
                            )}
                        </section>
                    </>
                ) : null}
            </main>
        </div>
    );
}

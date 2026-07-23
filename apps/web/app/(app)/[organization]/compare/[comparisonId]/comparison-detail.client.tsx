'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Clock3, Copy, Loader2, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import type { ComparisonEndpoint, SchemaComparisonSummary, SchemaSnapshotCoverage } from '@dory/schema-compare';

import { AISparkIcon } from '@/components/@dory/ui/ai-spark-icon';
import { SchemaDiffViewer } from '@/components/result-set-artifact/schema-diff-viewer';
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
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { useConnections } from '../../connections/hooks/use-connections';

type AiReview = {
    summary: string;
    deploymentNotes: string[];
    risks: Array<{ changeId: string; explanation: string }>;
    recommendations: string[];
    limitations: string[];
    generatedAt: string;
};

type ComparisonJob = {
    id: string;
    status: 'running' | 'success' | 'failed';
    currentEndpoint: ComparisonEndpoint;
    desiredEndpoint: ComparisonEndpoint;
    dialectFamily: string;
    coverage: SchemaSnapshotCoverage | null;
    summary: SchemaComparisonSummary | null;
    resultSetId: string | null;
    workId: string | null;
    aiReviewStatus: 'pending' | 'running' | 'success' | 'failed' | 'unavailable';
    aiReview: AiReview | null;
    aiReviewError: string | null;
    failureMessage: string | null;
    createdAt: string | Date;
    completedAt: string | Date | null;
};

type CreateOutput = { job: ComparisonJob };

function endpointLabel(endpoint: ComparisonEndpoint, connectionName?: string | null) {
    const scope = endpoint.schemas?.length ? ` · ${endpoint.schemas.join(', ')}` : '';
    return `${connectionName ? `${connectionName} / ` : ''}${endpoint.database}${scope}`;
}

function readinessClass(readiness: string) {
    if (readiness === 'unsafe') return 'border-destructive/30 bg-destructive/10 text-destructive';
    if (readiness === 'review_required') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    if (readiness === 'compatible') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    return 'border-muted-foreground/30 bg-muted text-muted-foreground';
}

function MetricCard({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
    return (
        <Card>
            <CardContent className="pt-5">
                <div className="text-sm text-muted-foreground">{label}</div>
                <div className={`mt-1 text-2xl font-semibold ${tone ?? ''}`}>{value}</div>
            </CardContent>
        </Card>
    );
}

export function ComparisonDetailClient({ organization, comparisonId }: { organization: string; comparisonId: string }) {
    const t = useTranslations('SchemaCompare');
    const router = useRouter();
    const queryClient = useQueryClient();
    const autoReviewStarted = useRef(false);
    const connectionsQuery = useConnections();
    const comparisonQuery = useQuery({
        queryKey: ['schema-comparison', organization, comparisonId],
        queryFn: () => executeActionClient<ComparisonJob>('comparison.get', { comparisonId }, { organizationId: organization }),
        refetchInterval: query => (query.state.data?.status === 'running' ? 1500 : false),
    });
    const reviewMutation = useMutation({
        mutationFn: () =>
            executeActionClient<{ job: ComparisonJob; review: AiReview }>(
                'comparison.aiReview',
                {
                    comparisonId,
                    workId: comparisonQuery.data?.workId ?? undefined,
                },
                { organizationId: organization },
            ),
        onSuccess: output => {
            queryClient.setQueryData(['schema-comparison', organization, comparisonId], output.job);
        },
        onError: () => {
            void comparisonQuery.refetch();
        },
    });
    const compareAgainMutation = useMutation({
        mutationFn: (job: ComparisonJob) =>
            executeActionClient<CreateOutput>(
                'comparison.schema.create',
                {
                    current: job.currentEndpoint,
                    desired: job.desiredEndpoint,
                    previousComparisonId: job.id,
                },
                { organizationId: organization },
            ),
        onSuccess: output => router.push(`/${encodeURIComponent(organization)}/compare/${output.job.id}`),
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.CreateFailed')),
    });
    const deleteMutation = useMutation({
        mutationFn: () =>
            executeActionClient(
                'comparison.delete',
                { comparisonId },
                {
                    organizationId: organization,
                    confirmationToken: 'user-confirmed',
                    reason: 'Delete schema comparison artifacts',
                },
            ),
        onSuccess: () => router.push(`/${encodeURIComponent(organization)}/compare`),
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.DeleteFailed')),
    });

    useEffect(() => {
        const job = comparisonQuery.data;
        if (!job || job.status !== 'success' || job.aiReviewStatus !== 'pending' || autoReviewStarted.current) return;
        autoReviewStarted.current = true;
        reviewMutation.mutate();
    }, [comparisonQuery.data, reviewMutation]);

    const job = comparisonQuery.data;
    if (comparisonQuery.isLoading || !job) {
        return (
            <div className="flex h-screen items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 animate-spin" />
                {t('Loading')}
            </div>
        );
    }
    const summary = job.summary;
    const connectionNames = new Map((connectionsQuery.data ?? []).map(item => [item.connection.id, item.connection.name]));

    return (
        <div className="bg-n8 h-screen overflow-auto">
            <main className="container mx-auto flex flex-col gap-6 px-12 pt-8 pb-12 lg:px-12 xl:px-8 2xl:px-4">
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <Button asChild variant="ghost" size="sm" className="-ml-3 mb-3">
                            <Link href={`/${encodeURIComponent(organization)}/compare`}>
                                <ArrowLeft />
                                {t('Back')}
                            </Link>
                        </Button>
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-2xl font-semibold">{endpointLabel(job.currentEndpoint, connectionNames.get(job.currentEndpoint.connectionId))}</h1>
                            <ArrowRight className="h-5 w-5 text-muted-foreground" />
                            <h1 className="text-2xl font-semibold">{endpointLabel(job.desiredEndpoint, connectionNames.get(job.desiredEndpoint.connectionId))}</h1>
                            <Badge variant="outline">{job.dialectFamily}</Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                                <Clock3 className="h-3.5 w-3.5" />
                                {new Date(job.createdAt).toLocaleString()}
                            </span>
                            {job.coverage ? (
                                <span>
                                    {t('Detail.Coverage')}:{' '}
                                    {Object.entries(job.coverage)
                                        .map(([kind, status]) => `${kind}:${status}`)
                                        .join(' · ')}
                                </span>
                            ) : null}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => compareAgainMutation.mutate(job)} disabled={compareAgainMutation.isPending || job.status !== 'success'}>
                            {compareAgainMutation.isPending ? <Loader2 className="animate-spin" /> : <Copy />}
                            {t('Detail.CompareAgain')}
                        </Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="outline" className="text-destructive hover:text-destructive">
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

                {job.status === 'failed' ? (
                    <Card className="border-destructive/30">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-destructive">
                                <ShieldAlert />
                                {t('Detail.Failed')}
                            </CardTitle>
                            <CardDescription>{job.failureMessage ?? t('Errors.CreateFailed')}</CardDescription>
                        </CardHeader>
                    </Card>
                ) : summary ? (
                    <>
                        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                            <MetricCard label={t('Summary.Changes')} value={summary.totalChanges} />
                            <MetricCard label={t('Summary.Breaking')} value={summary.breakingChanges} tone="text-destructive" />
                            <MetricCard label={t('Summary.High')} value={summary.highRisk} tone="text-destructive" />
                            <MetricCard label={t('Summary.Medium')} value={summary.mediumRisk} tone="text-amber-600 dark:text-amber-300" />
                            <MetricCard label={t('Summary.Low')} value={summary.lowRisk} tone="text-emerald-600 dark:text-emerald-300" />
                            <Card>
                                <CardContent className="pt-5">
                                    <div className="text-sm text-muted-foreground">{t('Summary.Readiness')}</div>
                                    <Badge variant="outline" className={`mt-2 ${readinessClass(summary.readiness)}`}>
                                        {summary.readiness}
                                    </Badge>
                                </CardContent>
                            </Card>
                        </section>
                        {job.resultSetId ? <SchemaDiffViewer resultSetId={job.resultSetId} organization={organization} /> : null}
                    </>
                ) : (
                    <Card>
                        <CardContent className="flex h-32 items-center justify-center text-muted-foreground">
                            <Loader2 className="mr-2 animate-spin" />
                            {t('Detail.Capturing')}
                        </CardContent>
                    </Card>
                )}

                {job.status === 'success' ? (
                    <Card>
                        <CardHeader className="flex-row items-start justify-between gap-4">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <AISparkIcon
                                        className="h-5 w-5"
                                        loading={reviewMutation.isPending || job.aiReviewStatus === 'running' || job.aiReviewStatus === 'pending'}
                                        data-testid="ai-review-icon"
                                    />
                                    {t('AI.Title')}
                                </CardTitle>
                                <CardDescription>{t('AI.Description')}</CardDescription>
                            </div>
                            {job.aiReviewStatus === 'failed' || job.aiReviewStatus === 'unavailable' ? (
                                <Button variant="outline" onClick={() => reviewMutation.mutate()} disabled={reviewMutation.isPending}>
                                    <RefreshCw className={reviewMutation.isPending ? 'animate-spin' : ''} />
                                    {t('AI.Retry')}
                                </Button>
                            ) : null}
                        </CardHeader>
                        <CardContent>
                            {reviewMutation.isPending || job.aiReviewStatus === 'running' || job.aiReviewStatus === 'pending' ? (
                                <div className="flex items-center text-sm text-muted-foreground">
                                    <Loader2 className="mr-2 animate-spin" />
                                    {t('AI.Generating')}
                                </div>
                            ) : job.aiReview ? (
                                <div className="grid gap-5">
                                    <p className="text-sm leading-6">{job.aiReview.summary}</p>
                                    {job.aiReview.risks.length ? (
                                        <div>
                                            <h3 className="mb-2 text-sm font-medium">{t('AI.Risks')}</h3>
                                            <ul className="grid gap-2">
                                                {job.aiReview.risks.map(risk => (
                                                    <li key={`${risk.changeId}-${risk.explanation}`} className="rounded-md border p-3 text-sm">
                                                        <span className="font-mono text-xs text-muted-foreground">{risk.changeId}</span>
                                                        <p className="mt-1">{risk.explanation}</p>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ) : null}
                                    {job.aiReview.recommendations.length ? (
                                        <div>
                                            <h3 className="mb-2 text-sm font-medium">{t('AI.Recommendations')}</h3>
                                            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                                                {job.aiReview.recommendations.map(item => (
                                                    <li key={item}>{item}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    ) : null}
                                    {job.aiReview.limitations.length ? (
                                        <div>
                                            <h3 className="mb-2 text-sm font-medium">{t('AI.Limitations')}</h3>
                                            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                                                {job.aiReview.limitations.map(item => (
                                                    <li key={item}>{item}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
                                    <p>{job.aiReviewStatus === 'failed' ? t('AI.Failed') : t('AI.Unavailable')}</p>
                                    <p className="mt-1">{t('AI.DiffUnaffected')}</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ) : null}
            </main>
        </div>
    );
}

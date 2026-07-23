'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Database, GitCompareArrows, Loader2, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ComparisonClient } from '@/lib/comparison/client-types';
import { executeActionClient } from '@/lib/actions/client';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { ComparisonRunStatus, dialectFamilyLabel } from './components/comparison-status';

function endpointLabel(endpoint: ComparisonClient['sourceEndpoint']) {
    return endpoint.database;
}

export function ComparisonsPageClient({ organization }: { organization: string }) {
    const t = useTranslations('SchemaCompare');
    const comparisonsQuery = useQuery({
        queryKey: ['comparisons', organization],
        queryFn: () => executeActionClient<{ rows: ComparisonClient[]; total: number }>('comparison.list', { limit: 100 }, { organizationId: organization }),
        refetchInterval: query => (query.state.data?.rows.some(comparison => comparison.latestRun?.status === 'running') ? 1500 : false),
    });

    return (
        <div className="bg-n8 h-screen overflow-auto">
            <main className="container mx-auto flex flex-col gap-6 px-12 pt-8 pb-12 lg:px-12 xl:px-8 2xl:px-4">
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <GitCompareArrows className="h-4 w-4" />
                            {t('List.Eyebrow')}
                        </div>
                        <h1 className="mt-2 text-2xl font-semibold">{t('List.Title')}</h1>
                        <p className="mt-1 text-sm text-muted-foreground">{t('List.Description')}</p>
                    </div>
                    <Button asChild>
                        <Link href={`/${encodeURIComponent(organization)}/comparisons/new`}>
                            <Plus />
                            {t('List.New')}
                        </Link>
                    </Button>
                </header>

                {comparisonsQuery.isLoading ? (
                    <div className="flex h-48 items-center justify-center text-muted-foreground">
                        <Loader2 className="mr-2 animate-spin" />
                        {t('Loading')}
                    </div>
                ) : comparisonsQuery.data?.rows.length ? (
                    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {comparisonsQuery.data.rows.map(comparison => {
                            const run = comparison.latestRun;
                            const summary = run?.summary;
                            return (
                                <Link
                                    key={comparison.id}
                                    href={`/${encodeURIComponent(organization)}/comparisons/${encodeURIComponent(comparison.id)}`}
                                    className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <Card className="h-full transition-colors group-hover:border-foreground/20">
                                        <CardHeader>
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <CardTitle className="truncate">{comparison.name}</CardTitle>
                                                    <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                                                        <Database className="h-4 w-4" />
                                                        <span>{dialectFamilyLabel(comparison.dialectFamily)}</span>
                                                    </div>
                                                </div>
                                                <ComparisonRunStatus run={run} />
                                            </div>
                                        </CardHeader>
                                        <CardContent className="grid gap-4">
                                            <div className="flex min-w-0 items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 font-mono text-sm">
                                                <span className="truncate">{endpointLabel(comparison.sourceEndpoint)}</span>
                                                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                <span className="truncate">{endpointLabel(comparison.targetEndpoint)}</span>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {comparison.objectTypes.map(type => (
                                                    <Badge key={type} variant="secondary">
                                                        {t(`Object.${type}`)}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </CardContent>
                                        <CardFooter className="mt-auto flex items-center justify-between border-t pt-4 text-xs text-muted-foreground">
                                            <span>{run ? t('List.LastChecked', { date: new Date(run.startedAt).toLocaleString() }) : t('List.NeverChecked')}</span>
                                            {summary?.totalChanges ? <span>{t('List.Risks', { count: summary.highRisk + summary.mediumRisk })}</span> : null}
                                        </CardFooter>
                                    </Card>
                                </Link>
                            );
                        })}
                    </section>
                ) : (
                    <Card className="border-dashed">
                        <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
                            <GitCompareArrows className="mb-4 h-9 w-9 text-muted-foreground" />
                            <h2 className="font-medium">{t('List.Empty')}</h2>
                            <p className="mt-1 max-w-md text-sm text-muted-foreground">{t('List.EmptyDescription')}</p>
                            <Button asChild className="mt-5">
                                <Link href={`/${encodeURIComponent(organization)}/comparisons/new`}>
                                    <Plus />
                                    {t('List.New')}
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                )}
            </main>
        </div>
    );
}

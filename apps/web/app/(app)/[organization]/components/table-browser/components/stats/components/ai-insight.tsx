'use client';

import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/registry/new-york-v4/ui/alert';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { CheckCircle2, Loader2, RotateCw } from 'lucide-react';
import type { TableStats } from '@dory/shared/types/table-info';
import { tableQueryKeys } from '../../table-queries';
import { executeActionClient } from '@/lib/actions/client';
import { useTranslations } from 'next-intl';

type TableHealthReportCardProps = {
    tableStats: TableStats | null;
    databaseName?: string;
    tableName?: string;
    connectionId?: string;
};

type InsightsPayload = {
    insights: string[];
    suggestion?: string;
};

export function TableHealthReportCard({ tableStats, databaseName, tableName, connectionId }: TableHealthReportCardProps) {
    const hasStats = !!tableStats;
    const t = useTranslations('TableStats');
    const fallbackInsights = [
        t('Fallback insight 1'),
        t('Fallback insight 2'),
        t('Fallback insight 3'),
        t('Fallback insight 4'),
    ];
    const fallbackSuggestion = t('Fallback suggestion');

    const insightsQuery = useQuery({
        queryKey: tableQueryKeys.aiStatsInsights(connectionId, databaseName, tableName),
        enabled: hasStats,
        staleTime: 1000 * 60 * 10,
        gcTime: 1000 * 60 * 30,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            const data = await executeActionClient<InsightsPayload>(
                'ai.tableStatsInsights',
                {
                    stats: tableStats,
                    database: databaseName,
                    table: tableName,
                },
                { currentConnectionId: connectionId },
            );
            const newInsights = data?.insights?.length ? data.insights : fallbackInsights;
            const newSuggestion = data?.suggestion || fallbackSuggestion;
            return {
                insights: newInsights,
                suggestion: newSuggestion,
                updatedAt: new Date(),
            };
        },
    });

    const insights = insightsQuery.data?.insights ?? fallbackInsights;
    const suggestion = insightsQuery.data?.suggestion ?? fallbackSuggestion;
    const lastUpdated = insightsQuery.data?.updatedAt ?? null;
    const loading = insightsQuery.isFetching || !tableStats;
    const error = insightsQuery.error ? (insightsQuery.error as Error).message : null;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h3 className="text-sm font-medium">{t('Stats insights')}</h3>
                    <span className="text-xs text-muted-foreground">
                        {lastUpdated ? t('Last updated', { time: lastUpdated.toLocaleTimeString() }) : ''}
                    </span>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() => insightsQuery.refetch()}
                    disabled={!hasStats || loading}
                    title={t('Reanalyze')}
                >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                </Button>
            </div>
            <Card>
            <CardContent className="space-y-3">
                {error ? (
                    <Alert variant="destructive">
                        <AlertTitle>{t('Insights failed')}</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}

                {loading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-11/12" />
                        <Skeleton className="h-4 w-10/12" />
                        <Skeleton className="h-4 w-9/12" />
                    </div>
                ) : (
                    <div className="space-y-2 text-sm leading-relaxed">
                        {insights.map(item => (
                            <div key={item} className="flex items-start gap-2 rounded-md border px-3 py-2">
                                <CheckCircle2 className="mt-[2px] h-4 w-4 text-emerald-500" />
                                <div className="text-muted-foreground">{item}</div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="rounded-md border bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                    {loading ? <Skeleton className="h-4 w-9/12" /> : suggestion}
                </div>
            </CardContent>
            </Card>
        </div>
    );
}

'use client';

import { ArrowUpRight, AlertCircle } from 'lucide-react';
import type { QueryInsightsRow } from '@/types/monitoring';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { cn } from '@/lib/utils';
import { formatBytes, formatNumber } from '../../utils';
import { useLocale, useTranslations } from 'next-intl';

type RecentQueriesCardProps = {
    queries: QueryInsightsRow[];
    loading: boolean;
    error?: string | null;
    onViewAll?: () => void;
};

export function RecentQueriesCard({ queries, loading, error, onViewAll }: RecentQueriesCardProps) {
    const t = useTranslations('Monitoring');
    const locale = useLocale();
    const items = queries ?? [];
    const hasData = items.length > 0;

    return (
        <Card className="mt-6">
            <CardHeader className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <CardTitle>{t('RecentQueries.Title')}</CardTitle>
                    <CardDescription>{t('RecentQueries.Description')}</CardDescription>
                </div>

                {onViewAll && (
                    <Button variant="ghost" size="sm" onClick={onViewAll} className="gap-1 text-xs">
                        {t('RecentQueries.ViewAll')}
                        <ArrowUpRight className="h-4 w-4" />
                    </Button>
                )}
            </CardHeader>
            <CardContent>
                {error && (
                    <div className="mb-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>{error}</span>
                    </div>
                )}

                {loading ? (
                    <div className="flex flex-col gap-3">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <div key={index} className="space-y-2 rounded-xl border border-dashed border-muted-foreground/40 p-3">
                                <Skeleton className="h-3 w-48" />
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="h-3 w-32" />
                            </div>
                        ))}
                    </div>
                ) : hasData ? (
                    <div className="flex flex-col divide-y divide-border/60">
                        {items.map(row => (
                            <RecentQueryRow key={`${row.queryId}-${row.eventTime}`} row={row} locale={locale} />
                        ))}
                    </div>
                ) : (
                    <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">{t('Empty.NoQueries')}</div>
                )}
            </CardContent>
        </Card>
    );
}

function RecentQueryRow({ row, locale }: { row: QueryInsightsRow; locale: string }) {
    const t = useTranslations('Monitoring');
    return (
        <div className="flex flex-col gap-2 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-mono text-muted-foreground">
                    <span className="max-w-90 truncate">{row.queryId}</span>
                    {row.exception && (
                        <Badge variant="destructive" className="rounded-full px-2 py-0 text-[10px]">
                            {t('Common.Error')}
                        </Badge>
                    )}
                </div>
                <p className="line-clamp-2 text-xs text-foreground/90">{row.query}</p>
            </div>

            <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:w-60">
                <span>{row.eventTime}</span>
                <div className="flex flex-wrap items-center gap-2">
                    <span>{row.user}</span>
                    <span>{t('Common.DbPrefix', { value: row.database ?? t('Common.EmptyValue') })}</span>
                    <span>{t('Common.ReadRows', { value: formatNumber(row.readRows, locale) })}</span>
                </div>
            </div>

            <div className="flex flex-col items-start gap-1 text-right sm:w-30 sm:items-end">
                <span className={cn('text-sm font-semibold tabular-nums', getDurationTone(row.durationMs))}>
                    {t('Common.DurationMs', { value: row.durationMs.toFixed(0) })}
                </span>
                <span className="text-xs text-muted-foreground">{formatBytes(row.readBytes)}</span>
            </div>
        </div>
    );
}

function getDurationTone(durationMs: number) {
    if (durationMs >= 1000) {
        return 'text-destructive';
    }
    if (durationMs >= 200) {
        return 'text-amber-600 dark:text-amber-300';
    }
    return 'text-muted-foreground';
}

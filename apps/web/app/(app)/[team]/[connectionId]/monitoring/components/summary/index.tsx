'use client';

import React from 'react';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { cn } from '@/lib/utils';
import type { QueryInsightsFilters, QueryInsightsSummary } from '@/types/monitoring';
import { useLocale, useTranslations } from 'next-intl';
import { formatNumber } from '../../utils';

interface QueryInsightsSummaryCardsProps {
    filters: QueryInsightsFilters;
    summary: QueryInsightsSummary | null;
    loading?: boolean;
    onNavigate?: (target: 'total' | 'slow' | 'error' | 'activeUsers') => void;
}

export function QueryInsightsSummaryCards({ filters, summary, loading, onNavigate }: QueryInsightsSummaryCardsProps) {
    const t = useTranslations('Monitoring');
    const locale = useLocale();
    const data: QueryInsightsSummary = summary ?? {
        totalQueries: 0,
        slowQueries: 0,
        errorQueries: 0,
        activeUsers: 0,
        p95DurationMs: 0,
    };

    const timeRangeLabel = t(`TimeRange.${filters.timeRange}`);
    const slowThreshold = filters.minDurationMs || 500;

    return (
        <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card mt-4 grid grid-cols-1 gap-4 px-0 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs md:grid-cols-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
            <SummaryCard label={t('Summary.TotalQueries')} value={data.totalQueries} description={timeRangeLabel} loading={loading} onClick={() => onNavigate?.('total')} locale={locale} />
            <SummaryCard
                label={t('Summary.SlowQueries')}
                value={data.slowQueries}
                description={t('Summary.SlowThreshold', { threshold: formatNumber(slowThreshold, locale) })}
                tone="warning"
                loading={loading}
                onClick={() => onNavigate?.('slow')}
                locale={locale}
            />
            <SummaryCard
                label={t('Summary.ErrorQueries')}
                value={data.errorQueries}
                description={t('Summary.ErrorQueriesDescription')}
                tone="danger"
                loading={loading}
                onClick={() => onNavigate?.('error')}
                locale={locale}
            />
            <SummaryCard label={t('Summary.ActiveUsers')} value={data.activeUsers} description={timeRangeLabel} loading={loading} onClick={() => onNavigate?.('activeUsers')} locale={locale} />
        </div>
    );
}

type Tone = 'default' | 'warning' | 'danger';

interface SummaryCardProps {
    label: string;
    value: number;
    description?: string;
    tone?: Tone;
    loading?: boolean;
    onClick?: () => void;
    locale: string;
}

function SummaryCard({ label, value, description, loading, onClick, locale }: SummaryCardProps) {
    const isInteractive = !!onClick;

    return (
        <Card
            data-slot="card"
            onClick={onClick}
            className={cn(
                '@container/card group', 
                isInteractive && 'cursor-pointer transition-colors hover:bg-muted/60 hover:shadow-sm',
            )}
        >
            <CardHeader>
                <CardDescription>{label}</CardDescription>

                
                <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    <span
                        className={cn(
                            'inline-flex items-center gap-1 border-b border-transparent transition-all duration-150',
                            isInteractive && 'group-hover:border-muted-foreground/40 group-active:border-muted-foreground/60',
                        )}
                    >
                        <span
                            className={cn(
                                'inline-flex items-center gap-1 transition-transform duration-150',
                                isInteractive && 'group-hover:-translate-y-0.5 group-active:scale-95',
                            )}
                        >
                            {formatNumber(value ?? 0, locale)}

                            {/* {isInteractive && (
                                <IconTrendingUp className="h-4 w-4 opacity-0 translate-y-1 transition-all duration-150 group-hover:opacity-70 group-hover:translate-y-0" />
                            )} */}
                        </span>
                    </span>
                </CardTitle>
            </CardHeader>

            <CardFooter className="flex-col items-start gap-1.5 text-sm">
                <div className="text-muted-foreground">{description}</div>
            </CardFooter>
        </Card>
    );
}

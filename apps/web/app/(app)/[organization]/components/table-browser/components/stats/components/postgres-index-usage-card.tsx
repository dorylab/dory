'use client';

import * as React from 'react';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import type { PostgresIndexUsageStat } from '@dory/shared/types/table-info';
import MetricItem from './metric-item';
import { formatBytes, formatNumber } from './formatters';
import { useTranslations } from 'next-intl';
import { ArrowUp, ArrowDown, ArrowUpDown, Info, KeyRound } from 'lucide-react';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { cn } from '@dory/web-utils';

type Props = {
    indexUsage: PostgresIndexUsageStat[] | null | undefined;
    loading: boolean;
};

type SortKey = 'indexScans' | 'sizeBytes';
type SortDir = 'asc' | 'desc';
type Filter = 'all' | 'used' | 'unused';

function isPrimaryKey(name: string) {
    return name.endsWith('_pkey') || name.endsWith('_pk') || name === 'primary';
}

type InsightVariant = 'active' | 'warning' | 'muted';

function getInsight(idx: PostgresIndexUsageStat, t: ReturnType<typeof useTranslations>): { text: string; variant: InsightVariant } {
    if (isPrimaryKey(idx.indexName)) return { text: t('Constraint index'), variant: 'muted' };
    if (idx.indexScans === 0) return { text: t('No usage recorded insight'), variant: 'warning' };
    if (idx.indexScans < 10) return { text: t('Rarely used'), variant: 'warning' };
    return { text: t('Actively used'), variant: 'active' };
}

const statusDot: Record<InsightVariant, string> = {
    active: 'bg-emerald-500',
    warning: 'bg-amber-400',
    muted: 'bg-blue-400',
};

const insightTextClass: Record<InsightVariant, string> = {
    active: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    muted: 'text-muted-foreground',
};

export default function PostgresIndexUsageCard({ indexUsage, loading }: Props) {
    const t = useTranslations('PostgresTableStats');
    const indexes = indexUsage ?? [];

    const [filter, setFilter] = React.useState<Filter>('all');
    const [sortKey, setSortKey] = React.useState<SortKey>('indexScans');
    const [sortDir, setSortDir] = React.useState<SortDir>('desc');

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    };

    const totalCount = indexes.length;
    const usedCount = indexes.filter(i => i.indexScans > 0).length;
    const unusedCount = totalCount - usedCount;
    const totalSizeBytes = indexes.reduce((sum, i) => sum + (i.sizeBytes ?? 0), 0);
    const maxScans = Math.max(...indexes.map(i => i.indexScans), 1);

    const filtered = indexes.filter(idx => {
        if (filter === 'used') return idx.indexScans > 0;
        if (filter === 'unused') return idx.indexScans === 0;
        return true;
    });

    const sorted = [...filtered].sort((a, b) => {
        const aVal = sortKey === 'sizeBytes' ? (a.sizeBytes ?? 0) : a.indexScans;
        const bVal = sortKey === 'sizeBytes' ? (b.sizeBytes ?? 0) : b.indexScans;
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });

    const SortIcon = ({ col }: { col: SortKey }) => {
        if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
        return sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
    };

    const ColHeader = ({
        label,
        tooltip,
        sortable,
        col,
        align = 'left',
    }: {
        label: string;
        tooltip?: string;
        sortable?: boolean;
        col?: SortKey;
        align?: 'left' | 'right';
    }) => (
        <th
            className={cn(
                'px-3 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap',
                align === 'right' ? 'text-right' : 'text-left',
                sortable && 'cursor-pointer select-none hover:text-foreground'
            )}
            onClick={sortable && col ? () => handleSort(col) : undefined}
        >
            <div className={cn('flex items-center gap-1', align === 'right' && 'justify-end')}>
                {label}
                {tooltip && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Info className="h-3 w-3 opacity-40 cursor-help shrink-0" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs leading-snug">{tooltip}</TooltipContent>
                    </Tooltip>
                )}
                {sortable && col && <SortIcon col={col} />}
            </div>
        </th>
    );

    return (
        <TooltipProvider delayDuration={200}>
            <div className="space-y-3">
                <h3 className="text-sm font-medium">{t('Index usage')}</h3>

                {/* Summary stats */}
                <Card>
                    <CardContent className="grid gap-4 sm:grid-cols-4">
                        {loading ? (
                            <>
                                <Skeleton className="h-10" />
                                <Skeleton className="h-10" />
                                <Skeleton className="h-10" />
                                <Skeleton className="h-10" />
                            </>
                        ) : (
                            <>
                                <MetricItem label={t('Total indexes')} value={formatNumber(totalCount)} />
                                <MetricItem label={t('Used indexes')} value={formatNumber(usedCount)} />
                                <MetricItem label={t('Unused indexes')} value={formatNumber(unusedCount)} />
                                <MetricItem label={t('Total index size')} value={formatBytes(totalSizeBytes || null)} />
                            </>
                        )}
                    </CardContent>
                </Card>

                {/* Filter tabs */}
                {!loading && totalCount > 0 && (
                    <div className="flex items-center gap-1">
                        {(['all', 'used', 'unused'] as Filter[]).map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={cn(
                                    'px-2.5 py-1 text-xs rounded-md transition-colors',
                                    filter === f
                                        ? 'bg-secondary text-foreground font-medium'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                                )}
                            >
                                {f === 'all' ? t('All') : f === 'used' ? t('Used indexes') : t('Unused indexes')}
                                <span className="ml-1 opacity-50">
                                    {f === 'all' ? totalCount : f === 'used' ? usedCount : unusedCount}
                                </span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Table */}
                {loading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-8 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                ) : indexes.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{t('No indexes')}</div>
                ) : (
                    <div className="rounded-md border overflow-hidden">
                        <table className="w-full">
                            <thead className="border-b bg-muted/40">
                                <tr>
                                    {/* Index + Insight (tier 1) */}
                                    <ColHeader label={t('Index')} />
                                    {/* Kind (tier 1 supporting) */}
                                    <ColHeader label={t('Kind')} />
                                    {/* Scans (tier 1) */}
                                    <ColHeader
                                        label={t('Index scans')}
                                        tooltip={t('Scans tooltip')}
                                        sortable
                                        col="indexScans"
                                        align="right"
                                    />
                                    {/* Size (tier 1) */}
                                    <ColHeader
                                        label={t('Index size')}
                                        sortable
                                        col="sizeBytes"
                                        align="right"
                                    />
                                    {/* Tuples (tier 2 — right-aligned, smaller) */}
                                    <ColHeader
                                        label={t('Tuple reads')}
                                        tooltip={t('Tuple reads tooltip')}
                                        align="right"
                                    />
                                    <ColHeader
                                        label={t('Tuple fetches')}
                                        tooltip={t('Tuple fetches tooltip')}
                                        align="right"
                                    />
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {sorted.map(idx => {
                                    const isPrimary = isPrimaryKey(idx.indexName);
                                    const insight = getInsight(idx, t);
                                    const hasScans = idx.indexScans > 0;
                                    const scanPct = hasScans ? Math.round((idx.indexScans / maxScans) * 100) : 0;

                                    return (
                                        <tr key={idx.indexName} className="hover:bg-muted/30 transition-colors">
                                            {/* Index name + Insight subtitle */}
                                            <td className="px-3 py-2.5 max-w-55">
                                                <div className="flex items-start gap-2">
                                                    {/* Status dot */}
                                                    <span
                                                        className={cn(
                                                            'mt-1.25 h-1.5 w-1.5 rounded-full shrink-0',
                                                            statusDot[insight.variant]
                                                        )}
                                                    />
                                                    <div className="min-w-0">
                                                        <div
                                                            className="font-mono text-xs font-medium truncate leading-5"
                                                            title={idx.indexName}
                                                        >
                                                            {idx.indexName}
                                                        </div>
                                                        {/* Insight as subtitle — the visual anchor */}
                                                        <div className={cn('text-[11px] leading-4 mt-0.5', insightTextClass[insight.variant])}>
                                                            {insight.text}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Kind */}
                                            <td className="px-3 py-2.5 whitespace-nowrap">
                                                {isPrimary ? (
                                                    <Badge variant="default">
                                                        <KeyRound />
                                                        {t('Primary key')}
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline">{t('Secondary')}</Badge>
                                                )}
                                            </td>

                                            {/* Scans — state-first: 0 = muted dash, >0 = number + bar */}
                                            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                                {hasScans ? (
                                                    <div className="flex flex-col items-end gap-1">
                                                        <span className="text-sm font-medium tabular-nums">
                                                            {formatNumber(idx.indexScans)}
                                                        </span>
                                                        <div className="h-1 w-16 rounded-full bg-muted overflow-hidden">
                                                            <div
                                                                className="h-full rounded-full bg-primary/50 transition-all"
                                                                style={{ width: `${scanPct}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-muted-foreground/40 tabular-nums select-none">—</span>
                                                )}
                                            </td>

                                            {/* Size — tier 1, prominent */}
                                            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                                <span className="text-sm font-medium tabular-nums">
                                                    {formatBytes(idx.sizeBytes)}
                                                </span>
                                            </td>

                                            {/* Tuple reads — tier 2, muted */}
                                            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                                <span className="text-xs text-muted-foreground tabular-nums">
                                                    {idx.tupleReads > 0 ? formatNumber(idx.tupleReads) : '—'}
                                                </span>
                                            </td>

                                            {/* Tuple fetches — tier 2, muted */}
                                            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                                <span className="text-xs text-muted-foreground tabular-nums">
                                                    {idx.tupleFetches > 0 ? formatNumber(idx.tupleFetches) : '—'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <div className="px-3 py-1.5 text-[11px] text-muted-foreground/60 border-t bg-muted/20">
                            {t('Stats reset notice')}
                        </div>
                    </div>
                )}
            </div>
        </TooltipProvider>
    );
}

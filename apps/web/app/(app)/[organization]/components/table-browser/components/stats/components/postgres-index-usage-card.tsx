'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import type { PostgresIndexUsageStat } from '@/types/table-info';
import MetricItem from './metric-item';
import { formatBytes, formatNumber } from './formatters';
import { useTranslations } from 'next-intl';

type Props = {
    indexUsage: PostgresIndexUsageStat[] | null | undefined;
    loading: boolean;
};

export default function PostgresIndexUsageCard({ indexUsage, loading }: Props) {
    const t = useTranslations('PostgresTableStats');
    const indexes = indexUsage ?? [];

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('Index usage')}</CardTitle>
                <CardDescription>{t('Index usage description')}</CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-10" />
                        <Skeleton className="h-10" />
                        <Skeleton className="h-10" />
                    </div>
                ) : indexes.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{t('No indexes')}</div>
                ) : (
                    <div className="space-y-4">
                        {indexes.map(idx => (
                            <div key={idx.indexName} className="rounded-md border px-4 py-3">
                                <div className="mb-2 text-sm font-medium">{idx.indexName}</div>
                                <div className="grid gap-3 sm:grid-cols-4">
                                    <MetricItem label={t('Index scans')} value={formatNumber(idx.indexScans)} />
                                    <MetricItem label={t('Tuple reads')} value={formatNumber(idx.tupleReads)} />
                                    <MetricItem label={t('Tuple fetches')} value={formatNumber(idx.tupleFetches)} />
                                    <MetricItem label={t('Index size')} value={formatBytes(idx.sizeBytes)} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

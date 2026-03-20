'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { TableStats } from '@/types/table-info';
import MetricItem from './metric-item';
import { formatBytes, formatNumber, formatRatio } from './formatters';
import { useTranslations } from 'next-intl';

type SizeAndRowsCardProps = {
    stats: TableStats | null;
    loading: boolean;
};

export default function SizeAndRowsCard({ stats, loading }: SizeAndRowsCardProps) {
    const t = useTranslations('TableStats');
    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('Size and rows')}</CardTitle>
                <CardDescription>{t('Size and rows description')}</CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="grid gap-4 sm:grid-cols-3">
                        <Skeleton className="h-16" />
                        <Skeleton className="h-16" />
                        <Skeleton className="h-16" />
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-3">
                        <MetricItem label={t('Row count')} value={formatNumber(stats?.rowCount)} />
                        <MetricItem
                            label={t('Data size')}
                            value={`${formatBytes(stats?.compressedBytes)} / ${formatBytes(stats?.uncompressedBytes)}`}
                            hint={t('Compressed / Uncompressed')}
                        />
                        <MetricItem label={t('Compression ratio')} value={formatRatio(stats?.compressionRatio)} />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

'use client';

import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import type { TableStats } from '@dory/shared/types/table-info';
import MetricItem from './metric-item';
import { formatBytes, formatNumber } from './formatters';
import { useTranslations } from 'next-intl';

type Props = {
    stats: TableStats | null;
    loading: boolean;
};

export default function PostgresSizeCard({ stats, loading }: Props) {
    const t = useTranslations('PostgresTableStats');
    return (
        <div className="space-y-3">
            <h3 className="text-sm font-medium">{t('Size')}</h3>
            <Card>
                <CardContent>
                    {loading ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Skeleton className="h-16" />
                            <Skeleton className="h-16" />
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2">
                            <MetricItem label={t('Total size')} value={formatBytes(stats?.totalBytes)} />
                            <MetricItem label={t('Row estimate')} value={formatNumber(stats?.rowEstimate)} />
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

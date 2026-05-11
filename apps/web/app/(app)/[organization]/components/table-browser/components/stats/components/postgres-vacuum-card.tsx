'use client';

import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import type { PostgresVacuumHealth } from '@dory/shared/types/table-info';
import MetricItem from './metric-item';
import { formatNumber } from './formatters';
import { useTranslations } from 'next-intl';

type Props = {
    vacuumHealth: PostgresVacuumHealth | null | undefined;
    loading: boolean;
};

function formatTimestamp(value: string | null | undefined): string {
    if (!value) return '-';
    try {
        return new Date(value).toLocaleString();
    } catch {
        return value;
    }
}

export default function PostgresVacuumCard({ vacuumHealth, loading }: Props) {
    const t = useTranslations('PostgresTableStats');

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-medium">{t('Vacuum health')}</h3>
            <Card>
                <CardContent>
                    {loading ? (
                        <div className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Skeleton className="h-16" />
                                <Skeleton className="h-16" />
                                <Skeleton className="h-16" />
                                <Skeleton className="h-16" />
                            </div>
                            <div className="grid gap-4 sm:grid-cols-3">
                                <Skeleton className="h-16" />
                                <Skeleton className="h-16" />
                                <Skeleton className="h-16" />
                            </div>
                        </div>
                    ) : !vacuumHealth ? (
                        <div className="text-sm text-muted-foreground">{t('No vacuum data')}</div>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <MetricItem label={t('Last vacuum')} value={formatTimestamp(vacuumHealth.lastVacuum)} />
                                <MetricItem label={t('Last autovacuum')} value={formatTimestamp(vacuumHealth.lastAutovacuum)} />
                                <MetricItem label={t('Last analyze')} value={formatTimestamp(vacuumHealth.lastAnalyze)} />
                                <MetricItem label={t('Last autoanalyze')} value={formatTimestamp(vacuumHealth.lastAutoanalyze)} />
                            </div>
                            <div className="grid gap-4 sm:grid-cols-3">
                                <MetricItem label={t('Live tuples')} value={formatNumber(vacuumHealth.liveTuples)} />
                                <MetricItem label={t('Dead tuples')} value={formatNumber(vacuumHealth.deadTuples)} />
                                <MetricItem label={t('Mods since analyze')} value={formatNumber(vacuumHealth.modsSinceAnalyze)} />
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

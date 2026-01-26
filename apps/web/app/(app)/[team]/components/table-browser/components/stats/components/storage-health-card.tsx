'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { TableMutationInfo, TableStats } from '@/types/table-info';
import MetricItem from './metric-item';
import { formatBytes, formatNumber } from './formatters';
import { useTranslations } from 'next-intl';

type StorageHealthCardProps = {
    stats: TableStats | null;
    loading: boolean;
};

export default function StorageHealthCard({ stats, loading }: StorageHealthCardProps) {
    const activeMutations = stats?.activeMutations ?? [];
    const t = useTranslations('TableStats');

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('Storage health')}</CardTitle>
                <CardDescription>{t('Storage health description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {loading ? (
                    <div className="grid gap-4 sm:grid-cols-3">
                        <Skeleton className="h-16" />
                        <Skeleton className="h-16" />
                        <Skeleton className="h-16" />
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-3">
                        <MetricItem label={t('Part count')} value={formatNumber(stats?.partCount ?? 0)} />
                        <MetricItem label={t('Avg part size')} value={formatBytes(stats?.avgPartSize ?? null)} />
                        <MetricItem label={t('Max part size')} value={formatBytes(stats?.maxPartSize ?? null)} />
                    </div>
                )}

                <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('Active mutations')}</div>
                    {loading ? (
                        <div className="space-y-2">
                            <Skeleton className="h-10" />
                            <Skeleton className="h-10" />
                        </div>
                    ) : activeMutations.length === 0 ? (
                        <div className="text-sm text-muted-foreground">{t('No active mutations')}</div>
                    ) : (
                        <div className="space-y-3">
                            {activeMutations.map((mutation: TableMutationInfo) => (
                                <div key={mutation.id} className="rounded-md border p-3">
                                    <div className="flex flex-col gap-1">
                                        <div className="text-sm font-medium leading-tight">{t('Mutation', { id: mutation.id })}</div>
                                        {mutation.command ? (
                                            <div className="text-xs text-muted-foreground line-clamp-2 break-all">{mutation.command}</div>
                                        ) : null}
                                        <div className="text-xs text-muted-foreground">
                                            {mutation.progress != null
                                                ? t('Progress percent', { percent: Math.round((mutation.progress as number) * 100) })
                                                : t('Progress unknown')}
                                            {mutation.partsDone != null || mutation.partsToDo != null
                                                ? ` ${t('Parts progress', {
                                                      done: formatNumber(mutation.partsDone ?? 0),
                                                      total: formatNumber(mutation.partsToDo ?? 0),
                                                  })}`
                                                : ''}
                                        </div>
                                        {mutation.createTime ? (
                                            <div className="text-[11px] text-muted-foreground">{t('Created at', { time: mutation.createTime })}</div>
                                        ) : null}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

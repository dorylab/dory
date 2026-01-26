'use client';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/registry/new-york-v4/ui/accordion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { TablePartitionStat, TableStats } from '@/types/table-info';
import MetricItem from './metric-item';
import { calcRatio, formatBytes, formatNumber } from './formatters';
import { useTranslations } from 'next-intl';

type PartitionsCardProps = {
    stats: TableStats | null;
    loading: boolean;
};

function PartitionItem({ partition, t }: { partition: TablePartitionStat; t: ReturnType<typeof useTranslations> }) {
    const ratio = calcRatio(partition.compressedBytes, partition.uncompressedBytes);
    return (
        <div className="space-y-2">
            <div className="grid gap-3 sm:grid-cols-3">
                <MetricItem label={t('Rows')} value={formatNumber(partition.rowCount)} />
                <MetricItem label={t('Compressed')} value={formatBytes(partition.compressedBytes)} />
                <MetricItem label={t('Uncompressed')} value={formatBytes(partition.uncompressedBytes)} hint={t('Ratio', { ratio })} />
            </div>
        </div>
    );
}

export default function PartitionsCard({ stats, loading }: PartitionsCardProps) {
    const partitions = stats?.partitions ?? [];
    const t = useTranslations('TableStats');

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('Partitions')}</CardTitle>
                <CardDescription>{t('Partitions description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <MetricItem label={t('Partition count')} value={formatNumber(stats?.partitionCount ?? 0)} />
                </div>

                {loading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-10" />
                        <Skeleton className="h-10" />
                        <Skeleton className="h-10" />
                    </div>
                ) : partitions.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{t('No active partitions')}</div>
                ) : (
                    <Accordion type="multiple" className="rounded-md border px-4">
                        {partitions.map(partition => (
                            <AccordionItem key={partition.name} value={partition.name}>
                                <AccordionTrigger>
                                    <div className="flex flex-col gap-1 text-left">
                                        <div className="font-medium">{partition.name}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {t('Rows count', { count: formatNumber(partition.rowCount) })} · {formatBytes(partition.compressedBytes)}
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <PartitionItem partition={partition} t={t} />
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                )}
            </CardContent>
        </Card>
    );
}

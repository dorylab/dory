'use client';

import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { Separator } from '@/registry/new-york-v4/ui/separator';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { Sparkles } from 'lucide-react';
import { TableStats } from '@/types/table-info';
import { TableProperties } from '../../structure/properties-section';
import { AISparkIcon } from '@/components/@dory/ui/ai-spark-icon';
import { useTranslations } from 'next-intl';

type SchemaOverviewSectionProps = {
    columnCount: number;
    properties: TableProperties | null;
    stats: TableStats | null;
    loadingStructure: boolean;
    loadingProperties: boolean;
    loadingStats: boolean;
};

function formatBytes(bytes?: number | null) {
    if (!Number.isFinite(bytes ?? NaN)) return '-';
    const value = Number(bytes);
    if (value === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(value) / Math.log(1024));
    const normalized = value / Math.pow(1024, i);
    return `${normalized.toFixed(normalized >= 100 ? 0 : normalized >= 10 ? 1 : 2)} ${units[i]}`;
}

function formatNumber(value?: number | null) {
    if (!Number.isFinite(value ?? NaN)) return '-';
    return Number(value).toLocaleString();
}

export function SchemaOverviewSection({
    columnCount,
    properties,
    stats,
    loadingStructure,
    loadingProperties,
    loadingStats,
}: SchemaOverviewSectionProps) {
    const t = useTranslations('TableBrowser');
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
                <AISparkIcon />
                {t('Schema overview')}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
                <Card>
                    <CardContent className="p-4 space-y-3">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">{t('Structure')}</div>
                        <Separator />
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">{t('Columns')}</span>
                                <span className="font-medium">
                                    {loadingStructure ? <Skeleton className="h-4 w-10" /> : columnCount || '—'}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">{t('Primary key')}</span>
                                <span className="font-medium">
                                    {loadingProperties ? (
                                        <Skeleton className="h-4 w-24" />
                                    ) : (
                                        properties?.primaryKey || '—'
                                    )}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">{t('Partition key')}</span>
                                <span className="font-medium">
                                    {loadingProperties ? (
                                        <Skeleton className="h-4 w-24" />
                                    ) : (
                                        properties?.partitionKey || '—'
                                    )}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">{t('Sorting key')}</span>
                                <span className="font-medium">
                                    {loadingProperties ? (
                                        <Skeleton className="h-4 w-24" />
                                    ) : (
                                        properties?.sortingKey || '—'
                                    )}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">{t('Engine')}</span>
                                <span className="font-medium">
                                    {loadingProperties ? <Skeleton className="h-4 w-24" /> : properties?.engine || '—'}
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4 space-y-3">
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">{t('Data')}</div>
                        <Separator />
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">{t('Row count')}</span>
                                <span className="font-medium">
                                    {loadingStats ? <Skeleton className="h-4 w-20" /> : formatNumber(stats?.rowCount)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">{t('Compressed size')}</span>
                                <span className="font-medium">
                                    {loadingStats ? (
                                        <Skeleton className="h-4 w-24" />
                                    ) : (
                                        formatBytes(stats?.compressedBytes)
                                    )}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">{t('Uncompressed size')}</span>
                                <span className="font-medium">
                                    {loadingStats ? (
                                        <Skeleton className="h-4 w-24" />
                                    ) : (
                                        formatBytes(stats?.uncompressedBytes)
                                    )}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">{t('Partitions')}</span>
                                <span className="font-medium">
                                    {loadingStats ? (
                                        <Skeleton className="h-4 w-16" />
                                    ) : (
                                        formatNumber(stats?.partitionCount)
                                    )}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">{t('Compression ratio')}</span>
                                <span className="font-medium">
                                    {loadingStats ? (
                                        <Skeleton className="h-4 w-16" />
                                    ) : stats?.compressionRatio ? (
                                        stats.compressionRatio.toFixed(2)
                                    ) : (
                                        '—'
                                    )}
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

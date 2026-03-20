'use client';

import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { TablePropertiesRow } from '@/types/table-info';
import { useTranslations } from 'next-intl';

export type TableProperties = TablePropertiesRow;

type PropertiesSectionProps = {
    properties: TableProperties | null;
    loading?: boolean;
};

const displayOrder = [
    'engine',
    'comment',
    'primaryKey',
    'sortingKey',
    'partitionKey',
    'samplingKey',
    'storagePolicy',
    'totalRows',
    'totalBytes',
] as (keyof TableProperties)[];


function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes)) return '-';
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[i]}`;
}

function formatRows(value: TableProperties[keyof TableProperties]) {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return '-';
    return Math.trunc(num).toLocaleString();
}

function formatValue(value: TableProperties[keyof TableProperties]) {
    if (value === null || value === undefined) return '-';

    if (typeof value === 'number') {
        return Number.isInteger(value) ? value.toLocaleString() : value.toString();
    }

    const str = String(value).trim();
    return str.length ? str : '-';
}

export function PropertiesSection({ properties, loading }: PropertiesSectionProps) {
    const t = useTranslations('TableBrowser');
    const labelMap: Partial<Record<keyof TableProperties, string>> = {
        engine: t('Engine'),
        comment: t('Comment'),
        primaryKey: t('Primary key'),
        sortingKey: t('Sorting key'),
        partitionKey: t('Partition key'),
        samplingKey: t('Sampling key'),
        storagePolicy: t('Storage policy'),
    };
    const keysToRender = displayOrder.filter(key => labelMap[key]);

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-medium">{t('Properties')}</h3>
            <Card>
                <CardContent className="space-y-4 py-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        {keysToRender.map(key => {
                            const rawValue = properties?.[key];
                            const displayValue = loading ? (
                                <Skeleton className="h-4 w-28" />
                            ) : key === 'totalBytes' ? (
                                formatBytes(Number(rawValue))
                            ) : key === 'totalRows' ? (
                                formatRows(rawValue)
                            ) : (
                                formatValue(rawValue as any)
                            );

                            return (
                                <div key={key} className="flex flex-col gap-1">
                                    <div className="text-xs text-muted-foreground">{labelMap[key] ?? key}</div>
                                    <div className="text-sm font-medium min-h-[1.25rem]">{displayValue}</div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

'use client';

import * as React from 'react';
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { useAtomValue } from 'jotai';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { StickyDataTable } from '@/components/@dory/ui/sticky-data-table';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/registry/new-york-v4/ui/tooltip';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import type { ResponseObject } from '@/types';
import { authFetch } from '@/lib/client/auth-fetch';
import { isSuccess } from '@/lib/result';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { formatBytes, formatNumber } from '@/app/(app)/[team]/components/table-browser/components/stats/components/formatters';

type DatabaseMaterializedViewRow = {
    name: string;
    engine?: string | null;
    sizeBytes?: number | null;
    rowCount?: number | null;
    lastModified?: string | null;
    comment?: string | null;
    frequentNote?: string | null;
    recentQueries?: string | null;
};

type DatabaseMaterializedViewApiRow = {
    name: string;
    engine?: string | null;
    totalBytes?: number | null;
    totalRows?: number | null;
    comment?: string | null;
    lastModified?: string | null;
};


const resolveParam = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

const toNumberOrNull = (value?: number | string | null) => {
    if (value === null || value === undefined) return null;
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num : null;
};

const formatTimestampWithLocale = (value: string | null | undefined, locale: string) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date);
};


export default function DatabaseMaterializedViews() {
    const [searchValue, setSearchValue] = React.useState('');
    const [rows, setRows] = React.useState<DatabaseMaterializedViewRow[]>([]);
    const [loading, setLoading] = React.useState(false);
    const currentConnection = useAtomValue(currentConnectionAtom);
    const t = useTranslations('Catalog');
    const locale = useLocale();
    const params = useParams<{ database?: string | string[] }>();
    const databaseParam = resolveParam(params?.database);
    const databaseName = React.useMemo(() => {
        if (!databaseParam) return '';
        try {
            return decodeURIComponent(databaseParam);
        } catch {
            return databaseParam;
        }
    }, [databaseParam]);

    const loadViews = React.useCallback(async () => {
        const connectionId = currentConnection?.connection.id;
        if (!connectionId || !databaseName) return;
        setLoading(true);
        try {
            const encodedDb = encodeURIComponent(databaseName);
            const response = await authFetch(`/api/connection/${connectionId}/databases/${encodedDb}/materialized-views`, {
                method: 'GET',
                headers: {
                    'X-Connection-ID': connectionId,
                },
            });
            const res = (await response.json()) as ResponseObject<DatabaseMaterializedViewApiRow[]>;
            if (!isSuccess(res)) {
                throw new Error(res.message || t('Failed to fetch materialized views'));
            }
            const nextRows = (res.data ?? []).map(item => ({
                name: item.name,
                engine: item.engine ?? null,
                sizeBytes: toNumberOrNull(item.totalBytes ?? null),
                rowCount: toNumberOrNull(item.totalRows ?? null),
                lastModified: item.lastModified ?? null,
                comment: item.comment ?? null,
                recentQueries: null,
            }));
            setRows(nextRows);
        } catch (error) {
            console.error('Failed to fetch database materialized views:', error);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [currentConnection?.connection.id, databaseName]);

    React.useEffect(() => {
        loadViews();
    }, [loadViews]);

    React.useEffect(() => {
        setSearchValue('');
    }, [databaseName]);

    const columnDefs = React.useMemo<ColumnDef<DatabaseMaterializedViewRow>[]>(() => {
        return [
            {
                accessorKey: 'name',
                header: t('Name'),
                meta: { className: 'w-[300px] text-left', cellClassName: 'text-left' },
                cell: ({ row }) => (
                    <div>
                        <div className="flex items-center gap-2">
                            <OverflowTooltip text={row.original.name} className="block max-w-[300px] truncate font-medium text-foreground" />
                            {row.original.recentQueries ? (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span className="inline-flex size-2 rounded-full bg-sky-300/60" />
                                    </TooltipTrigger>
                                    <TooltipContent className="text-xs">{row.original.recentQueries}</TooltipContent>
                                </Tooltip>
                            ) : null}
                        </div>
                        {row.original.comment ? (
                            <OverflowTooltip text={row.original.comment} className="block max-w-[300px] truncate text-[11px] text-muted-foreground">
                                {row.original.comment}
                            </OverflowTooltip>
                        ) : null}
                    </div>
                ),
            },
            {
                accessorKey: 'engine',
                header: t('Engine'),
                meta: { className: 'w-[180px] text-left', cellClassName: 'text-left text-muted-foreground' },
                cell: ({ row }) => (
                    <OverflowTooltip text={row.original.engine} className="block max-w-[180] truncate text-muted-foreground">
                        {row.original.engine ?? '-'}
                    </OverflowTooltip>
                ),
            },
            {
                accessorKey: 'sizeBytes',
                header: t('Data size'),
                meta: { className: 'w-[140px] text-left', cellClassName: 'text-left text-muted-foreground' },
                cell: ({ row }) => formatBytes(row.original.sizeBytes ?? null),
            },
            {
                accessorKey: 'rowCount',
                header: t('Row count'),
                meta: { className: 'w-[140px] text-left', cellClassName: 'text-left text-muted-foreground' },
                cell: ({ row }) => formatNumber(row.original.rowCount ?? null),
            },
            {
                accessorKey: 'lastModified',
                header: t('Last updated'),
                meta: { className: 'text-left', cellClassName: 'text-left text-muted-foreground' },
                cell: ({ row }) => formatTimestampWithLocale(row.original.lastModified ?? null, locale),
            },
        ];
    }, [locale, t]);

    const filteredRows = React.useMemo(() => {
        const keyword = searchValue.trim().toLowerCase();
        if (!keyword) return rows;

        return rows.filter(row => {
            const nameHit = row.name.toLowerCase().includes(keyword);
            const commentHit = (row.comment ?? '').toLowerCase().includes(keyword);
            return nameHit || commentHit;
        });
    }, [rows, searchValue]);

    const table = useReactTable({
        data: filteredRows,
        columns: columnDefs,
        getCoreRowModel: getCoreRowModel(),
    });

    return (
        <TooltipProvider delayDuration={200}>
            <div className="space-y-3 pt-1">
                <div className="flex w-full flex-row gap-3 sm:w-auto sm:justify-between sm:items-center sm:gap-4">
                    <div className="relative w-full sm:w-56">
                        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchValue}
                            onChange={event => setSearchValue(event.target.value)}
                            placeholder={t('Search materialized views placeholder')}
                            className="h-8 pl-8 text-xs"
                        />
                    </div>
                </div>

                <div className="border rounded-lg overflow-hidden">
                    <StickyDataTable<DatabaseMaterializedViewRow>
                        table={table}
                        loading={loading}
                        emptyText={searchValue.trim().length ? t('No matching materialized views') : t('No materialized views')}
                        containerClassName="h-[calc(100vh-200px)]"
                        tableClassName="text-sm whitespace-nowrap"
                        minBodyHeight="100px"
                        maxBodyHeight="800px"
                    />
                </div>
            </div>
        </TooltipProvider>
    );
}

'use client';

import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { ColumnDef, ColumnFiltersState, SortingState, VisibilityState, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table';

import { cn } from '@/lib/utils';
import type { QueryInsightsRow } from '@/types/monitoring';
import { formatBytes, formatNumber } from '../utils';
import { useQueryInsightsErrorQueriesHook } from '../hooks/use-monitoring';
import { useQueryInsightsFiltersValue, useSetQueryInsightsLoading } from '../state';
import { useQueryInsightsPagination } from '../hooks/use-monitoring-pagination';
import { PAGE_SIZE_OPTIONS } from '../constants';
import { StickyDataTable } from '@/components/@dory/ui/sticky-data-table';
import QuerySqlCell from '../components/query-sql-cell';
import { DataTablePagination } from '@/components/@dory/ui/data-table-pagination';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import { useLocale, useTranslations } from 'next-intl';

const TABLE_MAX_HEIGHT = 'calc(100vh - 290px)';

export default function QueryInsightsErrorQueriesPage() {
    const t = useTranslations('Monitoring');
    const locale = useLocale();
    const filters = useQueryInsightsFiltersValue();
    const [pagination, setPagination] = useQueryInsightsPagination('errors');

    const rowsResult = useQueryInsightsErrorQueriesHook(filters, pagination);
    const rows = rowsResult.rows ?? [];
    const total = rowsResult.total ?? 0;

    const [sorting, setSorting] = React.useState<SortingState>([{ id: 'eventTime', desc: true }]);
    const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
    const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);

    const columns = React.useMemo<ColumnDef<QueryInsightsRow>[]>(() => {
        return [
            {
                accessorKey: 'queryId',
                header: t('Columns.QueryId'),
                meta: { className: 'w-[250px] text-center' },
                cell: ({ row }) => <QuerySqlCell row={row.original} />,
            },
            {
                accessorKey: 'eventTime',
                header: t('Columns.Time'),
                meta: { className: 'w-[180px] text-center whitespace-nowrap' },
                sortingFn: (a, b) => {
                    const aTime = Date.parse(a.original.eventTime);
                    const bTime = Date.parse(b.original.eventTime);
                    return aTime - bTime;
                },
                cell: ({ row }) => (
                    <div className="flex flex-col items-center text-center text-xs w-[160px]">
                        <span className="font-medium text-foreground">{row.original.eventTime}</span>
                    </div>
                ),
            },
            {
                accessorKey: 'durationMs',
                header: t('Columns.Duration'),
                meta: { className: 'w-[100px] text-center' },
                cell: ({ row }) => (
                    <div className="text-center tabular-nums">
                        <span className={cn(getDurationTone(row.original.durationMs))}>{t('Common.DurationMs', { value: row.original.durationMs.toFixed(0) })}</span>
                    </div>
                ),
            },
            {
                accessorKey: 'user',
                header: t('Columns.User'),
                meta: { className: 'w-[120px] text-center' },
                cell: ({ row }) => <span className="font-mono text-[11px] w-[80px]">{row.original.user}</span>,
            },
            {
                accessorKey: 'database',
                header: t('Columns.Database'),
                meta: { className: 'w-[80px] text-center' },
                cell: ({ row }) => <span>{row.original.database ?? t('Common.EmptyValue')}</span>,
            },
            {
                accessorKey: 'readRows',
                header: t('Columns.ReadRowsBytes'),
                meta: { className: 'w-[110px] text-center' },
                cell: ({ row }) => (
                    <div className="flex flex-col items-center">
                        <span className="tabular-nums">{t('Common.ReadRows', { value: formatNumber(row.original.readRows, locale) })}</span>
                        <span className="tabular-nums text-[11px] text-muted-foreground">{formatBytes(row.original.readBytes)}</span>
                    </div>
                ),
            },
            {
                accessorKey: 'writtenBytes',
                header: t('Columns.WrittenBytes'),
                meta: { className: 'w-[80px] text-center' },
                cell: ({ row }) => <div className="text-center tabular-nums">{row.original.writtenBytes ? formatBytes(row.original.writtenBytes) : t('Common.EmptyValue')}</div>,
            },
            {
                accessorKey: 'memoryUsage',
                header: t('Columns.MemoryUsage'),
                meta: { className: 'w-[80px] text-center' },
                cell: ({ row }) => <div className="text-center tabular-nums">{row.original.memoryUsage ? formatBytes(row.original.memoryUsage) : t('Common.EmptyValue')}</div>,
            },
            {
                accessorKey: 'exception',
                header: t('Columns.ErrorMessage'),
                meta: { className: 'min-w-[260px] max-w-0 w-full text-left', cellClassName: 'text-left align-middle' },
                cell: ({ row }) => {
                    const message = row.original.exception ?? t('Common.EmptyValue');
                    return (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="text-xs text-destructive line-clamp-1 break-all">{message}</span>
                            </TooltipTrigger>
                            {message !== t('Common.EmptyValue') && <TooltipContent className="max-w-[420px] whitespace-pre-wrap break-words text-xs">{message}</TooltipContent>}
                        </Tooltip>
                    );
                },
            },
            {
                accessorKey: 'query',
                header: t('Columns.Sql'),
                meta: { className: 'min-w-[360px] text-xs max-w-0 w-full text-left', cellClassName: 'text-left align-middle' },
                cell: ({ row }) => <div className="line-clamp-1 break-all">{row.original.query}</div>,
            },
        ];
    }, [locale, t]);

    const table = useReactTable({
        data: rows,
        columns,
        getRowId: row => row.queryId,
        state: {
            sorting,
            columnVisibility,
            columnFilters,
        },
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: setColumnVisibility,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    const setLoading = useSetQueryInsightsLoading();
    React.useEffect(() => {
        setLoading(rowsResult.loading);
    }, [rowsResult.loading, setLoading]);

    return (
        <TooltipProvider delayDuration={200}>
            <section className="flex flex-col gap-4 rounded-2xl text-sm">
                {rowsResult.error && (
                    <div className="flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>{rowsResult.error}</span>
                    </div>
                )}

                <div className="w-full rounded-xl border bg-card overflow-hidden">
                    <StickyDataTable<QueryInsightsRow>
                        table={table}
                        loading={rowsResult.loading}
                        emptyText={t('Empty.NoErrorQueries')}
                        minBodyHeight="360px"
                        maxBodyHeight={TABLE_MAX_HEIGHT}
                        getRowClassName={row =>
                            cn('transition-colors hover:bg-muted/60', (row.original as QueryInsightsRow).exception && 'bg-destructive/5')
                        }
                    />
                </div>

                <DataTablePagination
                    total={total}
                    pageIndex={pagination.pageIndex}
                    pageSize={pagination.pageSize}
                    pageSizeOptions={PAGE_SIZE_OPTIONS}
                    onPageChange={pageIndex =>
                        setPagination(prev => ({
                            ...prev,
                            pageIndex,
                        }))
                    }
                    onPageSizeChange={pageSize =>
                        setPagination(prev => ({
                            ...prev,
                            pageSize,
                            pageIndex: 0,
                        }))
                    }
                />
            </section>
        </TooltipProvider>
    );
}

function getDurationTone(durationMs: number) {
    if (durationMs >= 1000) {
        return 'font-semibold text-destructive';
    }
    if (durationMs >= 200) {
        return 'font-medium text-amber-600';
    }
    return 'text-muted-foreground';
}

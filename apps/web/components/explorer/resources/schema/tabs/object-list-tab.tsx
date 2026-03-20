'use client';

import * as React from 'react';
import Link from 'next/link';
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { StickyDataTable } from '@/components/@dory/ui/sticky-data-table';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { authFetch } from '@/lib/client/auth-fetch';
import { buildExplorerObjectPath } from '@/lib/explorer/build-path';
import type { ExplorerBaseParams, ExplorerObjectKind } from '@/lib/explorer/types';
import { isSuccess } from '@/lib/result';
import { Input } from '@/registry/new-york-v4/ui/input';
import { TooltipProvider } from '@/registry/new-york-v4/ui/tooltip';
import type { ResponseObject } from '@/types';
import { formatBytes, formatNumber } from '@/app/(app)/[organization]/components/table-browser/components/stats/components/formatters';
import type { DatabaseObjectRow } from '@/lib/connection/base/types';
import { splitQualifiedName, useExplorerConnectionContext } from '@/components/explorer/core/explorer-store';

type ObjectListTabProps = {
    baseParams: ExplorerBaseParams;
    database: string;
    endpoint: 'tables' | 'views' | 'sequences';
    objectKind: Extract<ExplorerObjectKind, 'table' | 'view' | 'sequence'>;
    schema?: string;
    searchPlaceholder: string;
    emptyText: string;
    filteredEmptyText: string;
};

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

export function ObjectListTab(props: ObjectListTabProps) {
    const { baseParams, database, endpoint, objectKind, schema, searchPlaceholder, emptyText, filteredEmptyText } = props;
    const { connectionId } = useExplorerConnectionContext();
    const tCatalog = useTranslations('Catalog');
    const locale = useLocale();
    const [searchValue, setSearchValue] = React.useState('');
    const [rows, setRows] = React.useState<DatabaseObjectRow[]>([]);
    const [loading, setLoading] = React.useState(false);

    const loadRows = React.useCallback(async () => {
        if (!connectionId || !database) return;
        setLoading(true);
        try {
            const response = await authFetch(`/api/connection/${connectionId}/databases/${encodeURIComponent(database)}/${endpoint}`, {
                method: 'GET',
                headers: {
                    'X-Connection-ID': connectionId,
                },
            });
            const res = (await response.json()) as ResponseObject<DatabaseObjectRow[]>;
            if (!isSuccess(res)) {
                throw new Error(res.message || `Failed to fetch ${endpoint}`);
            }
            setRows(res.data ?? []);
        } catch (error) {
            console.error(`Failed to fetch postgres ${endpoint}:`, error);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [connectionId, database, endpoint]);

    React.useEffect(() => {
        loadRows();
    }, [loadRows]);

    React.useEffect(() => {
        setSearchValue('');
    }, [database, schema, endpoint]);

    const visibleRows = React.useMemo(() => {
        const scopedRows = schema
            ? rows.filter(row => {
                  const qualified = splitQualifiedName(row.name);
                  // Rows without a schema qualifier are treated as belonging to the current schema
                  // because postgres normalizes 'public' schema names by stripping the prefix
                  return (qualified.schema ?? schema) === schema;
              })
            : rows;

        const keyword = searchValue.trim().toLowerCase();
        if (!keyword) return scopedRows;

        return scopedRows.filter(row => row.name.toLowerCase().includes(keyword) || (row.comment ?? '').toLowerCase().includes(keyword));
    }, [rows, schema, searchValue]);

    const columnDefs = React.useMemo<ColumnDef<DatabaseObjectRow>[]>(() => {
        return [
            {
                accessorKey: 'name',
                header: tCatalog('Name'),
                meta: { className: 'w-[320px] text-left', cellClassName: 'text-left' },
                cell: ({ row }) => {
                    const qualified = splitQualifiedName(row.original.name);
                    const href = buildExplorerObjectPath(baseParams, {
                        database,
                        schema: qualified.schema,
                        objectKind,
                        name: qualified.name,
                    });

                    return (
                        <div>
                            <Link href={href} className="block max-w-[320px] truncate font-medium text-foreground hover:underline">
                                <OverflowTooltip text={row.original.name} className="block max-w-[320px] truncate font-medium" />
                            </Link>
                            {row.original.comment ? (
                                <OverflowTooltip text={row.original.comment} className="block max-w-[320px] truncate text-[11px] text-muted-foreground">
                                    {row.original.comment}
                                </OverflowTooltip>
                            ) : null}
                        </div>
                    );
                },
            },
            {
                accessorKey: 'engine',
                header: tCatalog('Engine'),
                meta: { className: 'w-[160px] text-left', cellClassName: 'text-left text-muted-foreground' },
                cell: ({ row }) => row.original.engine ?? '-',
            },
            {
                accessorKey: 'totalBytes',
                header: tCatalog('Data size'),
                meta: { className: 'w-[140px] text-left', cellClassName: 'text-left text-muted-foreground' },
                cell: ({ row }) => formatBytes(toNumberOrNull(row.original.totalBytes)),
            },
            {
                accessorKey: 'totalRows',
                header: tCatalog('Row count'),
                meta: { className: 'w-[140px] text-left', cellClassName: 'text-left text-muted-foreground' },
                cell: ({ row }) => formatNumber(toNumberOrNull(row.original.totalRows)),
            },
            {
                accessorKey: 'lastModified',
                header: tCatalog('Last updated'),
                meta: { className: 'text-left', cellClassName: 'text-left text-muted-foreground' },
                cell: ({ row }) => formatTimestampWithLocale(row.original.lastModified ?? null, locale),
            },
        ];
    }, [baseParams, database, locale, objectKind, tCatalog]);

    const table = useReactTable({
        data: visibleRows,
        columns: columnDefs,
        getCoreRowModel: getCoreRowModel(),
    });

    return (
        <TooltipProvider delayDuration={200}>
            <div className="space-y-3 pt-1">
                <div className="relative w-full sm:w-56">
                    <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={searchValue} onChange={event => setSearchValue(event.target.value)} placeholder={searchPlaceholder} className="h-8 pl-8 text-xs" />
                </div>

                <div className="border rounded-lg overflow-hidden">
                    <StickyDataTable<DatabaseObjectRow>
                        table={table}
                        loading={loading}
                        emptyText={searchValue.trim() ? filteredEmptyText : emptyText}
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

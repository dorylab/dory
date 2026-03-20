'use client';

import * as React from 'react';
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { StickyDataTable } from '@/components/@dory/ui/sticky-data-table';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { authFetch } from '@/lib/client/auth-fetch';
import { isSuccess } from '@/lib/result';
import { TooltipProvider } from '@/registry/new-york-v4/ui/tooltip';
import type { ResponseObject } from '@/types';
import type { TableIndexInfo } from '@/types/table-info';
import { formatBytes } from '../stats/components/formatters';

type TableIndexesTabProps = {
    connectionId?: string;
    database: string;
    table: string;
    emptyText: string;
};

export function TableIndexesTab({ connectionId, database, table, emptyText }: TableIndexesTabProps) {
    const [rows, setRows] = React.useState<TableIndexInfo[]>([]);
    const [loading, setLoading] = React.useState(false);

    const loadRows = React.useCallback(async () => {
        if (!connectionId || !database || !table) return;

        setLoading(true);

        try {
            const response = await authFetch(`/api/connection/${connectionId}/databases/${encodeURIComponent(database)}/tables/${encodeURIComponent(table)}/indexes`, {
                method: 'GET',
                headers: {
                    'X-Connection-ID': connectionId,
                },
            });
            const res = (await response.json()) as ResponseObject<TableIndexInfo[]>;

            if (!isSuccess(res)) {
                throw new Error(res.message || 'Failed to fetch indexes');
            }

            setRows(res.data ?? []);
        } catch (error) {
            console.error('Failed to fetch table indexes:', error);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [connectionId, database, table]);

    React.useEffect(() => {
        loadRows();
    }, [loadRows]);

    const columns = React.useMemo<ColumnDef<TableIndexInfo>[]>(
        () => [
            {
                accessorKey: 'name',
                header: 'Index',
                meta: { className: 'w-[220px] text-left', cellClassName: 'text-left' },
                cell: ({ row }) => <OverflowTooltip text={row.original.name} className="block max-w-[220px] truncate font-medium text-foreground" />,
            },
            {
                accessorKey: 'method',
                header: 'Method',
                meta: { className: 'w-[120px] text-left', cellClassName: 'text-left text-muted-foreground' },
                cell: ({ row }) => row.original.method ?? '-',
            },
            {
                accessorKey: 'isPrimary',
                header: 'Primary',
                meta: { className: 'w-[100px] text-left', cellClassName: 'text-left text-muted-foreground' },
                cell: ({ row }) => (row.original.isPrimary ? 'Yes' : 'No'),
            },
            {
                accessorKey: 'isUnique',
                header: 'Unique',
                meta: { className: 'w-[100px] text-left', cellClassName: 'text-left text-muted-foreground' },
                cell: ({ row }) => (row.original.isUnique ? 'Yes' : 'No'),
            },
            {
                accessorKey: 'sizeBytes',
                header: 'Size',
                meta: { className: 'w-[120px] text-left', cellClassName: 'text-left text-muted-foreground' },
                cell: ({ row }) => formatBytes(row.original.sizeBytes ?? null),
            },
            {
                accessorKey: 'definition',
                header: 'Definition',
                meta: { className: 'text-left', cellClassName: 'text-left text-muted-foreground' },
                cell: ({ row }) =>
                    row.original.definition ? <OverflowTooltip text={row.original.definition} className="block max-w-[520px] truncate text-muted-foreground" /> : '-',
            },
        ],
        [],
    );

    const tableInstance = useReactTable({
        data: rows,
        columns,
        getCoreRowModel: getCoreRowModel(),
    });

    return (
        <TooltipProvider delayDuration={200}>
            <div className="space-y-3 pt-1">
                <div className="border rounded-lg overflow-hidden">
                    <StickyDataTable<TableIndexInfo>
                        table={tableInstance}
                        loading={loading}
                        emptyText={emptyText}
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

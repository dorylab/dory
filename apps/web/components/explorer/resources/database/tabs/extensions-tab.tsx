'use client';

import * as React from 'react';
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { StickyDataTable } from '@/components/@dory/ui/sticky-data-table';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { authFetch } from '@/lib/client/auth-fetch';
import type { DatabaseExtensionMeta } from '@dory/drivers/types';
import { isSuccess } from '@/lib/result';
import { Input } from '@/registry/new-york-v4/ui/input';
import { TooltipProvider } from '@/registry/new-york-v4/ui/tooltip';
import type { ResponseObject } from '@/types';
import { useExplorerConnectionContext } from '@/components/explorer/core/explorer-store';

type ExtensionsTabProps = {
    database: string;
    searchPlaceholder: string;
    emptyText: string;
    filteredEmptyText: string;
};

export function ExtensionsTab(props: ExtensionsTabProps) {
    const { database, searchPlaceholder, emptyText, filteredEmptyText } = props;
    const { connectionId } = useExplorerConnectionContext();
    const [searchValue, setSearchValue] = React.useState('');
    const [rows, setRows] = React.useState<DatabaseExtensionMeta[]>([]);
    const [loading, setLoading] = React.useState(false);

    const loadRows = React.useCallback(async () => {
        if (!connectionId || !database) return;
        setLoading(true);
        try {
            const response = await authFetch(`/api/connection/${connectionId}/databases/${encodeURIComponent(database)}/extensions`, {
                method: 'GET',
                headers: { 'X-Connection-ID': connectionId },
            });
            const res = (await response.json()) as ResponseObject<DatabaseExtensionMeta[]>;
            if (!isSuccess(res)) throw new Error(res.message || 'Failed to fetch extensions');
            setRows(res.data ?? []);
        } catch (error) {
            console.error('Failed to fetch extensions:', error);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [connectionId, database]);

    React.useEffect(() => {
        loadRows();
    }, [loadRows]);

    const visibleRows = React.useMemo(() => {
        const keyword = searchValue.trim().toLowerCase();
        if (!keyword) return rows;
        return rows.filter(row => [row.name, row.schema, row.version, row.comment].some(v => (v ?? '').toLowerCase().includes(keyword)));
    }, [rows, searchValue]);

    const columns = React.useMemo<ColumnDef<DatabaseExtensionMeta>[]>(
        () => [
            {
                accessorKey: 'name',
                header: 'Extension',
                meta: { className: 'w-[220px] text-left', cellClassName: 'text-left' },
                cell: ({ row }) => <OverflowTooltip text={row.original.name} className="block max-w-55 truncate font-medium text-foreground" />,
            },
            {
                accessorKey: 'version',
                header: 'Version',
                meta: { className: 'w-[120px] text-left', cellClassName: 'text-left text-muted-foreground' },
                cell: ({ row }) => row.original.version ?? '-',
            },
            {
                accessorKey: 'schema',
                header: 'Schema',
                meta: { className: 'w-[140px] text-left', cellClassName: 'text-left text-muted-foreground' },
                cell: ({ row }) => row.original.schema ?? '-',
            },
            {
                accessorKey: 'relocatable',
                header: 'Relocatable',
                meta: { className: 'w-[120px] text-left', cellClassName: 'text-left text-muted-foreground' },
                cell: ({ row }) => (row.original.relocatable ? 'Yes' : 'No'),
            },
            {
                accessorKey: 'comment',
                header: 'Comment',
                meta: { className: 'text-left', cellClassName: 'text-left text-muted-foreground' },
                cell: ({ row }) => (row.original.comment ? <OverflowTooltip text={row.original.comment} className="block max-w-90 truncate text-muted-foreground" /> : '-'),
            },
        ],
        [],
    );

    const table = useReactTable({ data: visibleRows, columns, getCoreRowModel: getCoreRowModel() });

    return (
        <TooltipProvider delayDuration={200}>
            <div className="space-y-3 pt-1">
                <div className="relative w-full sm:w-56">
                    <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={searchValue} onChange={e => setSearchValue(e.target.value)} placeholder={searchPlaceholder} className="h-8 pl-8 text-xs" />
                </div>
                <div className="border rounded-lg overflow-hidden">
                    <StickyDataTable<DatabaseExtensionMeta>
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

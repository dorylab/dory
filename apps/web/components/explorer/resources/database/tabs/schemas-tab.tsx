'use client';

import * as React from 'react';
import Link from 'next/link';
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { StickyDataTable } from '@/components/@dory/ui/sticky-data-table';
import { executeActionClient } from '@/lib/actions/client';
import { buildExplorerSchemaPath } from '@/lib/explorer/build-path';
import type { ExplorerBaseParams } from '@/lib/explorer/types';
import { Input } from '@/registry/new-york-v4/ui/input';
import { TooltipProvider } from '@/registry/new-york-v4/ui/tooltip';
import type { DatabaseMeta } from '@dory/drivers/types';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { useExplorerConnectionContext } from '@/components/explorer/core/explorer-store';

type SchemasTabProps = {
    baseParams: ExplorerBaseParams;
    database: string;
    searchPlaceholder: string;
    emptyText: string;
    filteredEmptyText: string;
};

export function SchemasTab(props: SchemasTabProps) {
    const { baseParams, database, searchPlaceholder, emptyText, filteredEmptyText } = props;
    const { connectionId } = useExplorerConnectionContext();
    const [searchValue, setSearchValue] = React.useState('');
    const [rows, setRows] = React.useState<DatabaseMeta[]>([]);
    const [loading, setLoading] = React.useState(false);

    const loadRows = React.useCallback(async () => {
        if (!connectionId || !database) return;
        setLoading(true);
        try {
            const res = await executeActionClient<DatabaseMeta[]>('schema.listSchemas', { connectionId, database }, { currentConnectionId: connectionId });
            setRows(res ?? []);
        } catch (error) {
            console.error('Failed to fetch schemas:', error);
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
        return rows.filter(row => row.label.toLowerCase().includes(keyword) || row.value.toLowerCase().includes(keyword));
    }, [rows, searchValue]);

    const columns = React.useMemo<ColumnDef<DatabaseMeta>[]>(
        () => [
            {
                accessorKey: 'label',
                header: 'Schema',
                meta: { className: 'text-left', cellClassName: 'text-left' },
                cell: ({ row }) => (
                    <Link
                        href={buildExplorerSchemaPath(baseParams, database, row.original.value)}
                        className="block max-w-[420px] truncate font-medium text-foreground hover:underline"
                    >
                        <OverflowTooltip text={row.original.label} className="block max-w-[420px] truncate font-medium" />
                    </Link>
                ),
            },
        ],
        [baseParams, database],
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
                    <StickyDataTable<DatabaseMeta>
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

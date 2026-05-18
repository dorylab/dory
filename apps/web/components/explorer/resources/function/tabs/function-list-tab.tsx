'use client';

import * as React from 'react';
import Link from 'next/link';
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { StickyDataTable } from '@/components/@dory/ui/sticky-data-table';
import { authFetch } from '@/lib/client/auth-fetch';
import { buildExplorerObjectPath } from '@/lib/explorer/build-path';
import type { ExplorerBaseParams } from '@/lib/explorer/types';
import { isSuccess } from '@/lib/result';
import { Input } from '@/registry/new-york-v4/ui/input';
import { TooltipProvider } from '@/registry/new-york-v4/ui/tooltip';
import type { ResponseObject } from '@dory/shared';
import type { DatabaseFunctionMeta } from '@dory/drivers/types';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { splitQualifiedName, useExplorerConnectionContext } from '@/components/explorer/core/explorer-store';

type FunctionListResourceTabProps = {
    baseParams: ExplorerBaseParams;
    database: string;
    schema?: string;
    searchPlaceholder: string;
    emptyText: string;
    filteredEmptyText: string;
};

export function FunctionListResourceTab(props: FunctionListResourceTabProps) {
    const { baseParams, database, schema, searchPlaceholder, emptyText, filteredEmptyText } = props;
    const { connectionId } = useExplorerConnectionContext();
    const [searchValue, setSearchValue] = React.useState('');
    const [rows, setRows] = React.useState<DatabaseFunctionMeta[]>([]);
    const [loading, setLoading] = React.useState(false);

    const loadRows = React.useCallback(async () => {
        if (!connectionId || !database) return;
        setLoading(true);
        try {
            const response = await authFetch(`/api/connection/${connectionId}/databases/${encodeURIComponent(database)}/functions`, {
                method: 'GET',
                headers: {
                    'X-Connection-ID': connectionId,
                },
            });
            const res = (await response.json()) as ResponseObject<DatabaseFunctionMeta[]>;
            if (!isSuccess(res)) {
                throw new Error(res.message || 'Failed to fetch functions');
            }
            setRows(res.data ?? []);
        } catch (error) {
            console.error('Failed to fetch functions:', error);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [connectionId, database]);

    React.useEffect(() => {
        loadRows();
    }, [loadRows]);

    const visibleRows = React.useMemo(() => {
        const scopedRows = schema
            ? rows.filter(row => {
                  const qualified = splitQualifiedName(row.value);
                  return (qualified.schema ?? schema) === schema;
              })
            : rows;

        const keyword = searchValue.trim().toLowerCase();
        if (!keyword) return scopedRows;

        return scopedRows.filter(row => row.label.toLowerCase().includes(keyword));
    }, [rows, schema, searchValue]);

    const columns = React.useMemo<ColumnDef<DatabaseFunctionMeta>[]>(
        () => [
            {
                accessorKey: 'label',
                header: 'Function',
                meta: { className: 'text-left', cellClassName: 'text-left' },
                cell: ({ row }) => {
                    const qualified = splitQualifiedName(row.original.value);
                    const href = buildExplorerObjectPath(baseParams, {
                        database,
                        schema: qualified.schema ?? schema,
                        objectKind: 'function',
                        name: qualified.name,
                    });

                    return (
                        <Link href={href} className="block max-w-[520px] truncate font-medium text-foreground hover:underline">
                            <OverflowTooltip text={row.original.label} className="block max-w-[520px] truncate font-medium" />
                        </Link>
                    );
                },
            },
        ],
        [baseParams, database, schema],
    );

    const table = useReactTable({
        data: visibleRows,
        columns,
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
                    <StickyDataTable<DatabaseFunctionMeta>
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

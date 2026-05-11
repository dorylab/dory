'use client';

import * as React from 'react';
import Link from 'next/link';
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { StickyDataTable } from '@/components/@dory/ui/sticky-data-table';
import { authFetch } from '@/lib/client/auth-fetch';
import { buildExplorerObjectPath, buildExplorerSchemaPath } from '@/lib/explorer/build-path';
import type { ExplorerBaseParams } from '@/lib/explorer/types';
import type { DatabaseFunctionMeta, DatabaseMeta, DatabaseObjectRow } from '@dory/drivers/types';
import { isSuccess } from '@/lib/result';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { TooltipProvider } from '@/registry/new-york-v4/ui/tooltip';
import type { ResponseObject } from '@dory/shared';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { splitQualifiedName, useExplorerConnectionContext } from '@/components/explorer/core/explorer-store';

type SearchEntry = {
    kind: 'schema' | 'table' | 'view' | 'function' | 'sequence';
    label: string;
    href: string;
};

type SearchResourceTabProps = {
    baseParams: ExplorerBaseParams;
    database: string;
    placeholder: string;
    emptyText: string;
};

function toSearchEntries(
    baseParams: ExplorerBaseParams,
    database: string,
    schemas: DatabaseMeta[],
    tables: DatabaseObjectRow[],
    views: DatabaseObjectRow[],
    functions: DatabaseFunctionMeta[],
    sequences: DatabaseObjectRow[],
): SearchEntry[] {
    return [
        ...schemas.map(schema => ({
            kind: 'schema' as const,
            label: schema.value,
            href: buildExplorerSchemaPath(baseParams, database, schema.value),
        })),
        ...tables.map(row => {
            const qualified = splitQualifiedName(row.name);
            return {
                kind: 'table' as const,
                label: row.name,
                href: buildExplorerObjectPath(baseParams, {
                    database,
                    schema: qualified.schema,
                    objectKind: 'table',
                    name: qualified.name,
                }),
            };
        }),
        ...views.map(row => {
            const qualified = splitQualifiedName(row.name);
            return {
                kind: 'view' as const,
                label: row.name,
                href: buildExplorerObjectPath(baseParams, {
                    database,
                    schema: qualified.schema,
                    objectKind: 'view',
                    name: qualified.name,
                }),
            };
        }),
        ...functions.map(row => ({
            kind: 'function' as const,
            label: row.value,
            href: '#',
        })),
        ...sequences.map(row => {
            const qualified = splitQualifiedName(row.name);
            return {
                kind: 'sequence' as const,
                label: row.name,
                href: buildExplorerObjectPath(baseParams, {
                    database,
                    schema: qualified.schema,
                    objectKind: 'sequence',
                    name: qualified.name,
                }),
            };
        }),
    ];
}

export function SearchResourceTab({ baseParams, database, placeholder, emptyText }: SearchResourceTabProps) {
    const { connectionId } = useExplorerConnectionContext();
    const [query, setQuery] = React.useState('');
    const [rows, setRows] = React.useState<SearchEntry[]>([]);
    const [loading, setLoading] = React.useState(false);

    const loadRows = React.useCallback(async () => {
        if (!connectionId || !database) return;
        setLoading(true);
        try {
            const headers = {
                'X-Connection-ID': connectionId,
            };
            const encodedDatabase = encodeURIComponent(database);

            const [schemasResponse, tablesResponse, viewsResponse, functionsResponse, sequencesResponse] = await Promise.all([
                authFetch(`/api/connection/${connectionId}/databases/${encodedDatabase}/schemas`, { method: 'GET', headers }),
                authFetch(`/api/connection/${connectionId}/databases/${encodedDatabase}/tables`, { method: 'GET', headers }),
                authFetch(`/api/connection/${connectionId}/databases/${encodedDatabase}/views`, { method: 'GET', headers }),
                authFetch(`/api/connection/${connectionId}/databases/${encodedDatabase}/functions`, { method: 'GET', headers }),
                authFetch(`/api/connection/${connectionId}/databases/${encodedDatabase}/sequences`, { method: 'GET', headers }),
            ]);

            const [schemas, tables, views, functions, sequences] = (await Promise.all([
                schemasResponse.json(),
                tablesResponse.json(),
                viewsResponse.json(),
                functionsResponse.json(),
                sequencesResponse.json(),
            ])) as [
                ResponseObject<DatabaseMeta[]>,
                ResponseObject<DatabaseObjectRow[]>,
                ResponseObject<DatabaseObjectRow[]>,
                ResponseObject<DatabaseFunctionMeta[]>,
                ResponseObject<DatabaseObjectRow[]>,
            ];

            setRows(
                toSearchEntries(
                    baseParams,
                    database,
                    isSuccess(schemas) ? (schemas.data ?? []) : [],
                    isSuccess(tables) ? (tables.data ?? []) : [],
                    isSuccess(views) ? (views.data ?? []) : [],
                    isSuccess(functions) ? (functions.data ?? []) : [],
                    isSuccess(sequences) ? (sequences.data ?? []) : [],
                ),
            );
        } catch (error) {
            console.error('Failed to fetch search data:', error);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [baseParams, connectionId, database]);

    React.useEffect(() => {
        loadRows();
    }, [loadRows]);

    const visibleRows = React.useMemo(() => {
        const keyword = query.trim().toLowerCase();
        if (!keyword) return rows;
        return rows.filter(row => row.label.toLowerCase().includes(keyword) || row.kind.toLowerCase().includes(keyword));
    }, [query, rows]);

    const columns = React.useMemo<ColumnDef<SearchEntry>[]>(
        () => [
            {
                accessorKey: 'label',
                header: 'Name',
                meta: { className: 'text-left', cellClassName: 'text-left' },
                cell: ({ row }) => (
                    <div className="flex items-center gap-3">
                        <Badge variant="outline" className="min-w-[84px] justify-center text-[11px] capitalize">
                            {row.original.kind}
                        </Badge>
                        {row.original.href === '#' ? (
                            <OverflowTooltip text={row.original.label} className="block max-w-[420px] truncate font-medium text-foreground" />
                        ) : (
                            <Link href={row.original.href} className="block max-w-[420px] truncate font-medium text-foreground hover:underline">
                                <OverflowTooltip text={row.original.label} className="block max-w-[420px] truncate font-medium" />
                            </Link>
                        )}
                    </div>
                ),
            },
        ],
        [],
    );

    const table = useReactTable({
        data: visibleRows,
        columns,
        getCoreRowModel: getCoreRowModel(),
    });

    return (
        <TooltipProvider delayDuration={200}>
            <div className="space-y-3 pt-1">
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={placeholder} className="h-8 pl-8 text-xs" />
                </div>

                <div className="border rounded-lg overflow-hidden">
                    <StickyDataTable<SearchEntry>
                        table={table}
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

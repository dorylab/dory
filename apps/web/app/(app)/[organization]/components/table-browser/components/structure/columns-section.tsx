'use client';

import * as React from 'react';
import { ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { AISparkIcon } from '@/components/@dory/ui/ai-spark-icon';
import { OverflowTooltip } from '@/components/overflow-tooltip';
import { StickyDataTable } from '@/components/@dory/ui/sticky-data-table';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/registry/new-york-v4/ui/tooltip';
import { Search } from 'lucide-react';
import { ColumnsSectionProps, ColumnInfo } from '../../type';
import { useTranslations } from 'next-intl';

export function ColumnsSection({ tableName, loading, columns }: ColumnsSectionProps) {
    const [query, setQuery] = React.useState('');
    const t = useTranslations('TableBrowser');

    const placeholderRows = React.useMemo<ColumnInfo[]>(() => {
        return Array.from({ length: 4 }).map((_, idx) => ({
            name: `placeholder-${idx}`,
            type: '',
            nullable: true,
            defaultValue: '',
            comment: '',
            semanticTags: [],
            semanticSummary: null,
        }));
    }, []);

    const columnDefs = React.useMemo<ColumnDef<ColumnInfo>[]>(() => {
        return [
            {
                accessorKey: 'name',
                header: t('Column name'),
                meta: { className: 'w-[200px] text-left', cellClassName: 'text-left' },
                cell: ({ row }) => {
                    if (loading) return <Skeleton className="h-4 w-24" />;

                    const summary = row.original.semanticSummary;
                    const hasDetails = Boolean(summary);

                    const content = (
                        <div className="flex max-w-50 items-center gap-1.5">
                            <OverflowTooltip text={row.original.name} className="block min-w-0 flex-1 truncate font-medium" disableTooltip>
                                {row.original.name}
                            </OverflowTooltip>
                            {hasDetails ? (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            aria-label={t('Field details')}
                                            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#9460FF]/14 text-[10px] font-semibold leading-none text-[#9460FF] shadow-[inset_0_0_0_1px_rgba(148,96,255,0.24)] transition-colors hover:bg-[#9460FF]/22"
                                        >
                                            !
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs space-y-3 px-3 py-2 text-xs leading-snug">
                                        <div className="flex items-start gap-1.5">
                                            <AISparkIcon />
                                            <div className="min-w-0">
                                                <div className="mb-1 text-[11px] font-medium text-background/70">{t('AI explanation')}</div>
                                                <div>{summary}</div>
                                            </div>
                                        </div>
                                    </TooltipContent>
                                </Tooltip>
                            ) : null}
                        </div>
                    );

                    return content;
                },
            },
            {
                accessorKey: 'type',
                header: t('Column type'),
                meta: { className: 'w-[160px] text-left', cellClassName: 'text-left text-muted-foreground' },
                cell: ({ row }) =>
                    loading ? (
                        <Skeleton className="h-4 w-28" />
                    ) : (
                        <OverflowTooltip text={row.original.type} className="block max-w-40 truncate text-sm">
                            {row.original.type}
                        </OverflowTooltip>
                    ),
            },
            {
                accessorKey: 'nullable',
                header: t('Nullable'),
                meta: { className: 'w-[110px] text-center' },
                cell: ({ row }) =>
                    loading ? (
                        <Skeleton className="h-4 w-12 mx-auto" />
                    ) : (
                        <Badge variant={row.original.nullable ? 'outline' : 'default'} className="text-[11px]">
                            {row.original.nullable ? t('Yes') : t('No')}
                        </Badge>
                    ),
            },
            {
                accessorKey: 'defaultValue',
                header: t('Default'),
                meta: { className: 'w-[80px] text-left', cellClassName: 'text-left text-muted-foreground' },
                cell: ({ row }) =>
                    loading ? (
                        <Skeleton className="h-4 w-20" />
                    ) : (
                        <OverflowTooltip text={row.original.defaultValue ?? undefined} className="block max-w-35 truncate text-sm">
                            {row.original.defaultValue ?? '—'}
                        </OverflowTooltip>
                    ),
            },
            {
                accessorKey: 'comment',
                header: t('Comment'),
                meta: { className: 'min-w-[180px] text-left', cellClassName: 'text-left align-middle' },
                cell: ({ row }) =>
                    loading ? (
                        <Skeleton className="h-4 w-32" />
                    ) : (
                        <OverflowTooltip text={row.original.comment?.length ? row.original.comment : undefined} className="block max-w-full truncate text-sm text-muted-foreground">
                            {row.original.comment?.length ? row.original.comment : '—'}
                        </OverflowTooltip>
                    ),
            },
        ] as ColumnDef<ColumnInfo>[];
    }, [loading, t]);

    const filteredColumns = React.useMemo(() => {
        const keyword = query.trim().toLowerCase();
        if (!keyword) return columns;

        return columns.filter(col => {
            const nameHit = col.name.toLowerCase().includes(keyword);
            const typeHit = col.type.toLowerCase().includes(keyword);
            const commentHit = (col.comment ?? '').toLowerCase().includes(keyword);
            const tagsHit = (col.semanticTags ?? []).some(tag => tag.toLowerCase().includes(keyword));

            return nameHit || typeHit || commentHit || tagsHit;
        });
    }, [columns, query]);

    React.useEffect(() => {
        setQuery('');
    }, [tableName]);

    const table = useReactTable({
        data: loading ? placeholderRows : filteredColumns,
        columns: columnDefs,
        getCoreRowModel: getCoreRowModel(),
    });

    return (
        <TooltipProvider delayDuration={200}>
            <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">{t('Columns')}</h3>
                    <div className="relative w-56">
                        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('Search columns')} className="h-8 pl-8 text-xs" disabled={!tableName} />
                    </div>
                </div>

                <div className="border rounded-lg overflow-hidden">
                    <StickyDataTable<ColumnInfo>
                        table={table}
                        loading={loading}
                        emptyText={tableName ? (query.trim().length ? t('No matching columns') : t('No columns found')) : t('Select table to view columns')}
                        containerClassName="h-80"
                        tableClassName="text-sm whitespace-nowrap"
                        minBodyHeight="100px"
                        maxBodyHeight="560px"
                    />
                </div>
            </div>
        </TooltipProvider>
    );
}

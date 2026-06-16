'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { useColumns } from '@/hooks/use-columns';
import { executeActionClient } from '@/lib/actions/client';
import { generateColumnInsights } from '@/lib/schema/column-insights';
import type { ColumnInsights } from '@/lib/schema/column-insights';
import type { TableStats, TablePropertiesRow } from '@dory/shared/types/table-info';
import type { TableProperties } from './structure/properties-section';
import type { ColumnInfo } from '../type';

const STALE_TIME = 1000 * 60 * 5;
const GC_TIME = STALE_TIME * 2;

export const tableQueryKeys = {
    columns: (connectionId?: string, databaseName?: string, tableName?: string, locale?: string) => ['table-columns', connectionId, databaseName, tableName, locale] as const,
    structureColumns: (connectionId?: string, databaseName?: string, tableName?: string) => ['table-structure-columns', connectionId, databaseName, tableName] as const,
    columnInsights: (connectionId?: string, databaseName?: string, tableName?: string, locale?: string) =>
        ['table-column-insights', connectionId, databaseName, tableName, locale] as const,
    properties: (connectionId?: string, databaseName?: string, tableName?: string) => ['table-properties', connectionId, databaseName, tableName] as const,
    stats: (connectionId?: string, databaseName?: string, tableName?: string) => ['table-stats', connectionId, databaseName, tableName] as const,
    ddl: (connectionId?: string, databaseName?: string, tableName?: string) => ['table-ddl', connectionId, databaseName, tableName] as const,
    aiOverview: (connectionId?: string, databaseName?: string, tableName?: string) => ['table-ai-overview', connectionId, databaseName, tableName] as const,
    aiStatsInsights: (connectionId?: string, databaseName?: string, tableName?: string) => ['table-stats-insights', connectionId, databaseName, tableName] as const,
};

function normalizeColumns(raw: any[]): ColumnInfo[] {
    const normalized = (raw ?? []).map((col: any) => ({
        name: col.columnName ?? col.name ?? '',
        type: col.columnType ?? col.type ?? '',
        nullable: col.isNullable ?? col.nullable ?? true,
        defaultValue: col.defaultValue ?? col.default ?? null,
        comment: col.comment ?? null,
    }));
    return normalized.filter(col => col.name);
}

async function fetchBaseColumns({
    databaseName,
    tableName,
    fetchColumns,
}: {
    databaseName: string;
    tableName: string;
    fetchColumns: (database: string, table: string) => Promise<any[] | undefined>;
}) {
    const raw = await fetchColumns(databaseName, tableName);
    return normalizeColumns(raw ?? []);
}

function getRuleColumnInsights({ columns, locale }: { columns: ColumnInfo[]; locale?: string }) {
    return generateColumnInsights(columns, locale) satisfies ColumnInsights;
}

function getRuleTagsOnlyColumnInsights({ columns, locale }: { columns: ColumnInfo[]; locale?: string }) {
    const insights = getRuleColumnInsights({ columns, locale });
    const summaries: Record<string, string | null> = {};

    insights.columns.forEach(column => {
        summaries[column.name.toLowerCase()] = null;
    });

    return {
        ...insights,
        summaries,
        columns: insights.columns.map(column => ({
            ...column,
            semanticSummary: null,
        })),
    } satisfies ColumnInsights;
}

async function fetchColumnInsights({
    columns,
    databaseName,
    tableName,
    connectionId,
    dbType,
    signal,
    locale,
}: {
    columns: ColumnInfo[];
    databaseName: string;
    tableName: string;
    connectionId?: string;
    dbType?: string;
    signal?: AbortSignal;
    locale?: string;
}) {
    const insights = getRuleTagsOnlyColumnInsights({ columns, locale });

    if (!connectionId) {
        return insights;
    }

    try {
        const explanationsRes = await executeActionClient<{ columns?: { name: string; semanticSummary?: string | null }[] }>(
            'ai.schemaExplanations',
            {
                database: databaseName,
                table: tableName,
                columns,
                connectionId,
                dbType,
            },
            {
                currentConnectionId: connectionId,
                signal,
            },
        );

        const summaries = { ...insights.summaries };
        (explanationsRes?.columns ?? []).forEach(col => {
            if (!col?.name) return;
            summaries[col.name.toLowerCase()] = col.semanticSummary?.trim() || null;
        });

        return {
            ...insights,
            summaries,
            columns: insights.columns.map(col => ({
                ...col,
                semanticSummary: summaries[col.name.toLowerCase()] ?? col.semanticSummary ?? null,
            })),
        } satisfies ColumnInsights;
    } catch (error) {
        console.error('Failed to load schema explanations', error);
        return insights;
    }
}

function applySemanticColumns(columns: ColumnInfo[], insights: ColumnInsights) {
    return columns.map(col => {
        const key = col.name.toLowerCase();
        const tags = insights.tags[key] ?? [];
        const summary = insights.summaries[key] ?? col.comment ?? null;

        return {
            ...col,
            semanticTags: tags,
            semanticSummary: summary,
        };
    });
}

export function useTableColumnsQuery({ databaseName, tableName, connectionId, dbType }: { databaseName?: string; tableName?: string; connectionId?: string; dbType?: string }) {
    const { refresh: fetchColumns } = useColumns();
    const locale = useLocale();

    return useQuery({
        queryKey: tableQueryKeys.columns(connectionId, databaseName, tableName, locale),
        enabled: Boolean(connectionId && databaseName && tableName),
        staleTime: STALE_TIME,
        gcTime: GC_TIME,
        refetchOnWindowFocus: false,
        queryFn: async ({ signal }) => {
            const normalized = await fetchBaseColumns({
                databaseName: databaseName as string,
                tableName: tableName as string,
                fetchColumns,
            });
            if (!normalized.length) return { columns: [] as ColumnInfo[] };

            const insights = await fetchColumnInsights({
                columns: normalized,
                databaseName: databaseName as string,
                tableName: tableName as string,
                connectionId,
                dbType,
                signal,
                locale,
            });

            return { columns: applySemanticColumns(normalized, insights) };
        },
    });
}

export function useTableStructureColumnsQuery({ databaseName, tableName, connectionId }: { databaseName?: string; tableName?: string; connectionId?: string }) {
    const { refresh: fetchColumns } = useColumns();

    return useQuery({
        queryKey: tableQueryKeys.structureColumns(connectionId, databaseName, tableName),
        enabled: Boolean(connectionId && databaseName && tableName),
        staleTime: STALE_TIME,
        gcTime: GC_TIME,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            const normalized = await fetchBaseColumns({
                databaseName: databaseName as string,
                tableName: tableName as string,
                fetchColumns,
            });

            return { columns: normalized };
        },
    });
}

export function useTableColumnInsightsQuery({
    databaseName,
    tableName,
    connectionId,
    dbType,
    columns,
}: {
    databaseName?: string;
    tableName?: string;
    connectionId?: string;
    dbType?: string;
    columns: ColumnInfo[];
}) {
    const locale = useLocale();

    return useQuery({
        queryKey: tableQueryKeys.columnInsights(connectionId, databaseName, tableName, locale),
        enabled: Boolean(connectionId && databaseName && tableName && columns.length),
        staleTime: STALE_TIME,
        gcTime: GC_TIME,
        refetchOnWindowFocus: false,
        placeholderData: getRuleTagsOnlyColumnInsights({
            columns,
            locale,
        }),
        queryFn: async ({ signal }) => {
            return fetchColumnInsights({
                columns,
                databaseName: databaseName as string,
                tableName: tableName as string,
                connectionId,
                dbType,
                signal,
                locale,
            });
        },
    });
}

export function useTablePropertiesQuery({ databaseName, tableName, connectionId }: { databaseName?: string; tableName?: string; connectionId?: string }) {
    return useQuery({
        queryKey: tableQueryKeys.properties(connectionId, databaseName, tableName),
        enabled: Boolean(connectionId && databaseName && tableName),
        staleTime: STALE_TIME,
        gcTime: GC_TIME,
        refetchOnWindowFocus: false,
        queryFn: async ({ signal }) => {
            if (!connectionId) {
                throw new Error('Missing connection');
            }
            const res = await executeActionClient<{ properties: TablePropertiesRow | null }>(
                'table.getProperties',
                {
                    connectionId,
                    database: databaseName as string,
                    table: tableName as string,
                },
                {
                    currentConnectionId: connectionId,
                    signal,
                },
            );

            return res.properties ? ({ ...res.properties } as TableProperties) : null;
        },
    });
}

export function useTableStatsQuery({ databaseName, tableName, connectionId }: { databaseName?: string; tableName?: string; connectionId?: string }) {
    return useQuery({
        queryKey: tableQueryKeys.stats(connectionId, databaseName, tableName),
        enabled: Boolean(connectionId && databaseName && tableName),
        staleTime: STALE_TIME,
        gcTime: GC_TIME,
        refetchOnWindowFocus: false,
        queryFn: async ({ signal }) => {
            if (!connectionId) {
                throw new Error('Missing connection');
            }
            const res = await executeActionClient<{ stats: TableStats | null }>(
                'table.getStats',
                {
                    connectionId,
                    database: databaseName as string,
                    table: tableName as string,
                },
                {
                    currentConnectionId: connectionId,
                    signal,
                },
            );

            if (res.stats) {
                return res.stats;
            }
            throw new Error('Failed to load table stats');
        },
    });
}

export function useTableDdlQuery({ databaseName, tableName, connectionId }: { databaseName?: string; tableName?: string; connectionId?: string }) {
    return useQuery({
        queryKey: tableQueryKeys.ddl(connectionId, databaseName, tableName),
        enabled: Boolean(connectionId && databaseName && tableName),
        staleTime: STALE_TIME,
        gcTime: GC_TIME,
        refetchOnWindowFocus: false,
        queryFn: async ({ signal }) => {
            if (!connectionId) {
                throw new Error('Missing connection');
            }
            const res = await executeActionClient<{ ddl: string | null }>(
                'table.getDdl',
                {
                    connectionId,
                    database: databaseName as string,
                    table: tableName as string,
                },
                {
                    currentConnectionId: connectionId,
                    signal,
                },
            );

            return typeof res.ddl === 'string' ? res.ddl : null;
        },
    });
}

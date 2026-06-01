'use client';

import { useQuery } from '@tanstack/react-query';
import { useColumns } from '@/hooks/use-columns';
import { executeActionClient } from '@/lib/actions/client';
import type { TableStats, TablePropertiesRow } from '@dory/shared/types/table-info';
import type { TableProperties } from './structure/properties-section';
import type { ColumnInfo } from '../type';

const STALE_TIME = 1000 * 60 * 5;
const GC_TIME = STALE_TIME * 2;

export const tableQueryKeys = {
    columns: (connectionId?: string, databaseName?: string, tableName?: string) =>
        ['table-columns', connectionId, databaseName, tableName] as const,
    structureColumns: (connectionId?: string, databaseName?: string, tableName?: string) =>
        ['table-structure-columns', connectionId, databaseName, tableName] as const,
    columnInsights: (connectionId?: string, databaseName?: string, tableName?: string) =>
        ['table-column-insights', connectionId, databaseName, tableName] as const,
    properties: (connectionId?: string, databaseName?: string, tableName?: string) =>
        ['table-properties', connectionId, databaseName, tableName] as const,
    stats: (connectionId?: string, databaseName?: string, tableName?: string) =>
        ['table-stats', connectionId, databaseName, tableName] as const,
    ddl: (connectionId?: string, databaseName?: string, tableName?: string) =>
        ['table-ddl', connectionId, databaseName, tableName] as const,
    aiOverview: (connectionId?: string, databaseName?: string, tableName?: string) =>
        ['table-ai-overview', connectionId, databaseName, tableName] as const,
    aiStatsInsights: (connectionId?: string, databaseName?: string, tableName?: string) =>
        ['table-stats-insights', connectionId, databaseName, tableName] as const,
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

type ColumnInsights = {
    tags: Record<string, string[]>;
    summaries: Record<string, string | null>;
};

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

async function fetchSemanticColumns({
    columns,
    databaseName,
    tableName,
    connectionId,
    dbType,
    signal,
}: {
    columns: ColumnInfo[];
    databaseName: string;
    tableName: string;
    connectionId?: string;
    dbType?: string;
    signal?: AbortSignal;
}) {
    const tagMap: Record<string, string[]> = {};
    const summaryMap: Record<string, string | null> = {};

    if (!connectionId) {
        return {
            tags: tagMap,
            summaries: summaryMap,
        } satisfies ColumnInsights;
    }

    try {
        const tagsRes = await executeActionClient<{ columns?: { name: string; semanticTags?: string[] }[] }>(
            'ai.schemaTags',
            {
                connectionId,
                database: databaseName,
                table: tableName,
                columns,
                dbType,
            },
            {
                currentConnectionId: connectionId,
                signal,
            },
        );

        const tagColumns = tagsRes?.columns;
        (tagColumns ?? []).forEach((col: { name?: string; semanticTags?: string[] }) => {
            if (!col?.name) return;
            const key = col.name.toLowerCase();
            tagMap[key] = Array.isArray(col.semanticTags) ? col.semanticTags : [];
        });

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

        const explanationColumns = explanationsRes?.columns;
        (explanationColumns ?? []).forEach((col: { name?: string; semanticSummary?: string | null }) => {
            if (!col?.name) return;
            const key = col.name.toLowerCase();
            summaryMap[key] = col.semanticSummary ?? null;
        });
    } catch (error) {
        console.error('Failed to load schema tags/explanations', error);
    }

    return {
        tags: tagMap,
        summaries: summaryMap,
    } satisfies ColumnInsights;
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

export function useTableColumnsQuery({
    databaseName,
    tableName,
    connectionId,
    dbType,
}: {
    databaseName?: string;
    tableName?: string;
    connectionId?: string;
    dbType?: string;
}) {
    const { refresh: fetchColumns } = useColumns();

    return useQuery({
        queryKey: tableQueryKeys.columns(connectionId, databaseName, tableName),
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

            const insights = await fetchSemanticColumns({
                columns: normalized,
                databaseName: databaseName as string,
                tableName: tableName as string,
                connectionId,
                dbType,
                signal,
            });

            return { columns: applySemanticColumns(normalized, insights) };
        },
    });
}

export function useTableStructureColumnsQuery({
    databaseName,
    tableName,
    connectionId,
}: {
    databaseName?: string;
    tableName?: string;
    connectionId?: string;
}) {
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
    return useQuery({
        queryKey: tableQueryKeys.columnInsights(connectionId, databaseName, tableName),
        enabled: Boolean(connectionId && databaseName && tableName && columns.length),
        staleTime: STALE_TIME,
        gcTime: GC_TIME,
        refetchOnWindowFocus: false,
        queryFn: async ({ signal }) => {
            return fetchSemanticColumns({
                columns,
                databaseName: databaseName as string,
                tableName: tableName as string,
                connectionId,
                dbType,
                signal,
            });
        },
    });
}

export function useTablePropertiesQuery({
    databaseName,
    tableName,
    connectionId,
}: {
    databaseName?: string;
    tableName?: string;
    connectionId?: string;
}) {
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

            if (res.properties) {
                return { ...res.properties } as TableProperties;
            }
            throw new Error('Failed to load table properties');
        },
    });
}

export function useTableStatsQuery({
    databaseName,
    tableName,
    connectionId,
}: {
    databaseName?: string;
    tableName?: string;
    connectionId?: string;
}) {
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

export function useTableDdlQuery({
    databaseName,
    tableName,
    connectionId,
}: {
    databaseName?: string;
    tableName?: string;
    connectionId?: string;
}) {
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


'use client';

import { useQuery } from '@tanstack/react-query';
import { useColumns } from '@/hooks/use-columns';
import type { ResponseObject } from '@/types';
import { authFetch } from '@/lib/client/auth-fetch';
import { isSuccess } from '@/lib/result';
import type { TableStats, TablePropertiesRow } from '@/types/table-info';
import type { TableProperties } from './structure/properties-section';
import type { ColumnInfo } from '../type';

const STALE_TIME = 1000 * 60 * 5;
const GC_TIME = STALE_TIME * 2;

export const tableQueryKeys = {
    columns: (connectionId?: string, databaseName?: string, tableName?: string) =>
        ['table-columns', connectionId, databaseName, tableName] as const,
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

    if (!connectionId) return columns;

    try {
        const tagsResponse = await authFetch('/api/ai/schema-tags', {
            method: 'POST',
            signal,
            headers: {
                'Content-Type': 'application/json',
                'X-Connection-ID': connectionId,
            },
            body: JSON.stringify({
                database: databaseName,
                table: tableName,
                columns,
                dbType,
            }),
        });
        const tagsRes = (await tagsResponse.json()) as ResponseObject<{ columns?: { name: string; semanticTags?: string[] }[] }>;

        const tagColumns = (tagsRes as any)?.columns ?? tagsRes?.data?.columns;
        (tagColumns ?? []).forEach((col: { name?: string; semanticTags?: string[] }) => {
            if (!col?.name) return;
            const key = col.name.toLowerCase();
            tagMap[key] = Array.isArray(col.semanticTags) ? col.semanticTags : [];
        });

        const explanationsResponse = await authFetch('/api/ai/schema-explanations', {
            method: 'POST',
            signal,
            headers: {
                'Content-Type': 'application/json',
                'X-Connection-ID': connectionId,
            },
            body: JSON.stringify({
                database: databaseName,
                table: tableName,
                columns,
                connectionId,
                dbType,
            }),
        });
        const explanationsRes = (await explanationsResponse.json()) as ResponseObject<{
            columns?: { name: string; semanticSummary?: string | null }[];
        }>;

        const explanationColumns = (explanationsRes as any)?.columns ?? explanationsRes?.data?.columns;
        (explanationColumns ?? []).forEach((col: { name?: string; semanticSummary?: string | null }) => {
            if (!col?.name) return;
            const key = col.name.toLowerCase();
            summaryMap[key] = col.semanticSummary ?? null;
        });
    } catch (error) {
        console.error('Failed to load schema tags/explanations', error);
    }

    return columns.map(col => {
        const key = col.name.toLowerCase();
        const tags = tagMap[key] ?? [];
        const summary = summaryMap[key] ?? col.comment ?? null;
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
            const raw = await fetchColumns(databaseName as string, tableName as string);
            const normalized = normalizeColumns(raw ?? []);
            if (!normalized.length) return { columns: [] as ColumnInfo[] };

            const enriched = await fetchSemanticColumns({
                columns: normalized,
                databaseName: databaseName as string,
                tableName: tableName as string,
                connectionId,
                dbType,
                signal,
            });

            return { columns: enriched };
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
            const encodedDb = encodeURIComponent(databaseName as string);
            const encodedTable = encodeURIComponent(tableName as string);
            const response = await authFetch(`/api/connection/${connectionId}/databases/${encodedDb}/tables/${encodedTable}/properties`, {
                method: 'GET',
                signal,
                headers: {
                    'X-Connection-ID': connectionId,
                },
            });
            const res = (await response.json()) as ResponseObject<TablePropertiesRow>;

            if (isSuccess(res) && res.data) {
                return { ...res.data } as TableProperties;
            }
            throw new Error(res.message || 'Failed to load table properties');
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
            const encodedDb = encodeURIComponent(databaseName as string);
            const encodedTable = encodeURIComponent(tableName as string);
            const response = await authFetch(`/api/connection/${connectionId}/databases/${encodedDb}/tables/${encodedTable}/stats`, {
                method: 'GET',
                signal,
                headers: {
                    'X-Connection-ID': connectionId,
                },
            });
            const res = (await response.json()) as ResponseObject<TableStats>;

            if (isSuccess(res) && res.data) {
                return res.data;
            }
            throw new Error(res.message || 'Failed to load table stats');
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
            const encodedDb = encodeURIComponent(databaseName as string);
            const encodedTable = encodeURIComponent(tableName as string);
            const response = await authFetch(`/api/connection/${connectionId}/databases/${encodedDb}/tables/${encodedTable}/ddl`, {
                method: 'GET',
                signal,
                headers: {
                    'X-Connection-ID': connectionId,
                },
            });
            const res = (await response.json()) as ResponseObject<string>;

            if (isSuccess(res)) {
                return typeof res.data === 'string' ? res.data : null;
            }

            throw new Error(res.message || 'Failed to load table DDL');
        },
    });
}

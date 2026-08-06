import { randomUUID } from 'node:crypto';
import { collectSerializableDataPage } from '@dory/data-plane';
import type { BaseConnection } from '@dory/drivers/core';
import type { TablePreviewFilter, TablePreviewSort } from '@dory/drivers/types';
import { DEFAULT_TABLE_PREVIEW_LIMIT } from '@/shared/data/app.data';

type BuildTablePreviewPayloadParams = {
    connection: BaseConnection;
    connectionId: string;
    database: string;
    table: string;
    limit?: number;
    offset?: number;
    countMode?: 'none' | 'exact';
    sort?: TablePreviewSort | null;
    filters?: TablePreviewFilter[];
    search?: string | null;
    searchColumns?: string[];
    sessionId?: string | null;
    tabId?: string | null;
    userId?: string | null;
    source?: string | null;
};

function normalizePreviewLimit(limit?: number): number {
    if (!Number.isFinite(limit) || !limit || limit <= 0) {
        return DEFAULT_TABLE_PREVIEW_LIMIT;
    }
    return Math.floor(limit);
}

function normalizePreviewOffset(offset?: number): number {
    if (!Number.isFinite(offset) || !offset || offset < 0) {
        return 0;
    }
    return Math.floor(offset);
}

function buildPreviewSqlText(database: string, table: string, options: { sort?: TablePreviewSort | null; filters?: TablePreviewFilter[]; search?: string | null }): string {
    const parts = [`TABLE PREVIEW ${database}.${table}`];
    if (options.search?.trim()) parts.push('SEARCH');
    if (options.filters?.length) parts.push(`FILTERS ${options.filters.length}`);
    if (options.sort) parts.push(`ORDER BY ${options.sort.column} ${options.sort.direction.toUpperCase()}`);
    return parts.join(' ');
}

export async function buildTablePreviewPayload({
    connection,
    connectionId,
    database,
    table,
    limit,
    offset,
    countMode,
    sort,
    filters,
    search,
    searchColumns,
    sessionId,
    tabId,
    userId,
    source,
}: BuildTablePreviewPayloadParams) {
    const normalizedLimit = normalizePreviewLimit(limit);
    const normalizedOffset = normalizePreviewOffset(offset);
    const sqlText = buildPreviewSqlText(database, table, { sort, filters, search });
    const startedAt = new Date();
    const perfStart = performance.now();
    const result = await connection.readTable({
        database,
        table,
        options: {
            limit: normalizedLimit,
            offset: normalizedOffset,
            countMode,
            sort,
            filters,
            search,
            searchColumns,
        },
    });
    const page = await collectSerializableDataPage(result.stream, normalizedLimit);
    const durationMs = Math.round(performance.now() - perfStart);
    const finishedAt = new Date();
    const rows = page.rows;
    const effectiveSessionId = sessionId?.trim() || randomUUID();

    return {
        session: {
            sessionId: effectiveSessionId,
            userId: userId ?? null,
            tabId: tabId ?? null,
            connectionId,
            database,
            sqlText,
            status: 'success' as const,
            errorMessage: null,
            startedAt,
            finishedAt,
            durationMs,
            resultSetCount: 1,
            stopOnError: false,
            source: source ?? 'table-preview',
        },
        queryResultSets: [
            {
                sessionId: effectiveSessionId,
                setIndex: 0,
                sqlText,
                sqlOp: 'SELECT',
                title: `Preview: ${table}`,
                columns: page.columns.map(column => ({
                    name: column.name,
                    type: column.databaseType ?? column.type,
                    displayName: column.displayName,
                })),
                rowCount: page.rowCount ?? rows.length,
                totalRows: result.totalRows ?? null,
                unfilteredTotalRows: result.unfilteredTotalRows ?? result.totalRows ?? null,
                limited: result.limited ?? true,
                limit: result.limit ?? normalizedLimit,
                offset: normalizedOffset,
                affectedRows: null,
                status: 'success' as const,
                errorMessage: null,
                errorCode: null,
                errorSqlState: null,
                errorMeta: null,
                warnings: null,
                startedAt,
                finishedAt,
                durationMs,
            },
        ],
        results: [rows],
        meta: {
            refId: randomUUID(),
            durationMs,
            totalSets: 1,
            stopOnError: false,
        },
    };
}

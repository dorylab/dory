import { randomUUID } from 'node:crypto';
import type { BaseConnection } from '@/lib/connection/base/base-connection';
import { hasTableInfoCapability } from '@/lib/connection/base/types';
import { DEFAULT_TABLE_PREVIEW_LIMIT } from '@/shared/data/app.data';

type BuildTablePreviewPayloadParams = {
    connection: BaseConnection;
    connectionId: string;
    database: string;
    table: string;
    limit?: number;
    offset?: number;
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

function buildPreviewSqlText(database: string, table: string): string {
    return `TABLE PREVIEW ${database}.${table}`;
}

export async function buildTablePreviewPayload({
    connection,
    connectionId,
    database,
    table,
    limit,
    offset,
    sessionId,
    tabId,
    userId,
    source,
}: BuildTablePreviewPayloadParams) {
    const tableInfo = connection.capabilities.tableInfo;
    if (!hasTableInfoCapability(tableInfo, 'preview')) {
        throw new Error('Table preview is not supported for this connection');
    }

    const normalizedLimit = normalizePreviewLimit(limit);
    const normalizedOffset = normalizePreviewOffset(offset);
    const sqlText = buildPreviewSqlText(database, table);
    const startedAt = new Date();
    const perfStart = performance.now();
    const result = await tableInfo.preview(database, table, { limit: normalizedLimit, offset: normalizedOffset });
    const durationMs = Math.round(performance.now() - perfStart);
    const finishedAt = new Date();
    const rows = Array.isArray(result.rows) ? result.rows : [];
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
                columns: result.columns ?? null,
                rowCount: result.rowCount ?? rows.length,
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

import { NextResponse } from 'next/server';

import { withManagedOrganizationHandler } from '@/app/api/utils/with-organization-handler';
import { ResponseUtil } from '@/lib/result';
import type { QuerySource, QueryStatus } from '@dory/shared/types/audit';

export const runtime = 'nodejs';

const QUERY_SOURCES = new Set<QuerySource>([
    'console',
    'chatbot',
    'api',
    'task',
    'user_sql_console',
    'user_table_preview',
    'dory_schema_metadata',
    'dory_monitoring',
    'ai_sql_runner',
    'ai_table_preview',
    'ai_schema_metadata',
    'ai_analysis',
    'automation_sql',
    'automation_ai_sql',
    'automation_schema_metadata',
    'mcp_sql_runner',
    'mcp_table_preview',
    'mcp_schema_metadata',
    'mcp_monitoring',
    'mcp_analysis',
]);

const QUERY_STATUSES = new Set<QueryStatus>(['success', 'error', 'denied', 'canceled']);

export const GET = withManagedOrganizationHandler(async ({ req, db, organizationId }) => {
    const searchParams = req.nextUrl.searchParams;
    const limit = clampLimit(searchParams.get('limit'));
    const offset = normalizeOffset(searchParams.get('offset'));
    const sources = parseCsvFilter(searchParams.get('sources'), QUERY_SOURCES);
    const statuses = parseCsvFilter(searchParams.get('statuses'), QUERY_STATUSES);

    const result = await db.audit.search({
        organizationId,
        from: normalizeDateParam(searchParams.get('from')),
        to: normalizeDateParam(searchParams.get('to')),
        sources,
        statuses,
        userId: normalizeString(searchParams.get('user_id') ?? searchParams.get('userId')),
        connectionId: normalizeString(searchParams.get('connection_id') ?? searchParams.get('datasource_id') ?? searchParams.get('connectionId')),
        databaseName: normalizeString(searchParams.get('database_name') ?? searchParams.get('databaseName')),
        chatId: normalizeString(searchParams.get('chat_id') ?? searchParams.get('chatId')),
        q: normalizeString(searchParams.get('q')),
        cursor: normalizeString(searchParams.get('cursor')),
        limit,
        offset,
    });

    return NextResponse.json(ResponseUtil.success(result));
});

function normalizeString(value?: string | null): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

function normalizeDateParam(value?: string | null): string | undefined {
    const normalized = normalizeString(value);
    if (!normalized) return undefined;
    const timestamp = Date.parse(normalized);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function clampLimit(value?: string | null): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 50;
    return Math.max(1, Math.min(200, Math.floor(parsed)));
}

function normalizeOffset(value?: string | null): number | undefined {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return undefined;
    return Math.max(0, Math.floor(parsed));
}

function parseCsvFilter<T extends string>(value: string | null, allowed: Set<T>): T[] | undefined {
    const items = (value ?? '')
        .split(',')
        .map(item => item.trim())
        .filter((item): item is T => allowed.has(item as T));

    return items.length ? items : undefined;
}

// studio/lib/database/pg/impl/audit/query.ts
import { and, desc, eq, gte, inArray, ilike, lte, sql, SQLWrapper } from 'drizzle-orm';
import { queryAudit } from '../../schemas/audit';
import { getClient } from '../../client';
import type { AuditItem, AuditSearchParams, AuditSearchResult, OverviewFilters, OverviewResponse, QuerySource, QueryStatus } from '@/types/audit';
import type { PostgresDBClient } from '@/types';

// Cursor: order by created_at DESC, id DESC
type Cursor = { created_at_ms: number; id: string };
const enc = (c: Cursor) => Buffer.from(`${c.created_at_ms}|${c.id}`).toString('base64');
const dec = (raw?: string | null): Cursor | null => {
    if (!raw) return null;
    try {
        const [ts, id] = Buffer.from(raw, 'base64').toString('utf8').split('|');
        const n = Number(ts);
        if (!Number.isFinite(n)) return null;
        return { created_at_ms: n, id };
    } catch {
        return null;
    }
};

const msToDate = (ms?: number) => (typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms) : undefined);

export class PgAuditQueryRepository {
    async search(params: AuditSearchParams): Promise<AuditSearchResult> {
        const db = (await getClient()) as PostgresDBClient;
        const limit = Math.min(Math.max(Number(params.limit ?? 50), 1), 200);

        const where: SQLWrapper[] = [];

        // Time range (createdAt: timestamp -> Date)
        if (params.from) {
            const d = msToDate(Date.parse(params.from));
            if (d) where.push(gte(queryAudit.createdAt, d));
        }
        if (params.to) {
            const d = msToDate(Date.parse(params.to));
            if (d) where.push(lte(queryAudit.createdAt, d));
        }

        // Multi-select filters
        if (params.sources?.length) where.push(inArray(queryAudit.source, params.sources as QuerySource[]));
        if (params.statuses?.length) where.push(inArray(queryAudit.status, params.statuses as QueryStatus[]));

        // Exact filters (ID/Name should not use like)
        if (params.userId) where.push(eq(queryAudit.userId, params.userId));
        if (params.connectionId) where.push(eq(queryAudit.connectionId, params.connectionId));
        if (params.databaseName) where.push(eq(queryAudit.databaseName, params.databaseName));

        // chatId from jsonb (extra_json->>'chatId' = ?)
        if (params.chatId) {
            where.push(sql`${queryAudit.extraJson} ->> 'chatId' = ${params.chatId}`);
        }

        // SQL snippet search (ilike with wildcards)
        if (params.q?.trim()) {
            const q = `%${params.q.trim()}%`;
            where.push(ilike(queryAudit.sqlText, q));
        }

        // Cursor: strictly less than cursor position (createdAt DESC, id DESC)
        const cursor = dec(params.cursor);
        if (cursor) {
            const cDate = new Date(cursor.created_at_ms);
            where.push(
                sql`(${queryAudit.createdAt} < ${cDate}
          OR (${queryAudit.createdAt} = ${cDate} AND ${queryAudit.id} < ${cursor.id}))`,
            );
        }

        const rows = await db
            .select()
            .from(queryAudit)
            .where(where.length ? and(...where) : undefined)
            .orderBy(desc(queryAudit.createdAt), desc(queryAudit.id))
            .limit(limit + 1);

        const hasMore = rows.length > limit;
        const slice = hasMore ? rows.slice(0, limit) : rows;

        // Drizzle returns schema field names (camelCase)
        const items: AuditItem[] = slice.map(r => ({
            id: r.id,
            created_at: r.createdAt.toISOString(),

            teamId: r.teamId,
            user_id: r.userId,

            source: r.source as any,
            status: r.status as any,

            duration_ms: r.durationMs ?? null,
            rows_read: r.rowsRead ?? null,
            bytes_read: r.bytesRead ?? null,
            rows_written: r.rowsWritten ?? null,

            connection_id: r.connectionId ?? null,
            database_name: r.databaseName ?? null,

            sql_text: r.sqlText,
            extra_json: (r.extraJson as any) ?? null,
        }));

        const last = slice[slice.length - 1];
        const nextCursor = hasMore && last ? enc({ created_at_ms: last.createdAt.getTime(), id: last.id }) : null;

        return { items, nextCursor };
    }

    async overview(filters: OverviewFilters): Promise<OverviewResponse> {
        const db = (await getClient()) as PostgresDBClient;

        const fromMs = Date.parse(filters.from);
        const toMs = Date.parse(filters.to);
        const spanMs = toMs - fromMs;
        const bucketIsHour = spanMs <= 3 * 24 * 60 * 60 * 1000;

        const bucketExpr = bucketIsHour
            ? sql<string>`to_char(${queryAudit.createdAt}, 'YYYY-MM-DD HH24:00:00')`
            : sql<string>`to_char(${queryAudit.createdAt}, 'YYYY-MM-DD 00:00:00')`;

        const whereClauses: SQLWrapper[] = [];
        const fromDate = msToDate(fromMs);
        const toDate = msToDate(toMs);
        if (fromDate) whereClauses.push(gte(queryAudit.createdAt, fromDate));
        if (toDate) whereClauses.push(lte(queryAudit.createdAt, toDate));

        if (filters.sources?.length) whereClauses.push(inArray(queryAudit.source, filters.sources as QuerySource[]));
        if (filters.statuses?.length) whereClauses.push(inArray(queryAudit.status, filters.statuses as QueryStatus[]));

        // Keep monitor filter naming (user_id / connection_id / database_name)
        if ((filters as any).user_id) whereClauses.push(eq(queryAudit.userId, (filters as any).user_id));
        if ((filters as any).connection_id) whereClauses.push(eq(queryAudit.connectionId, (filters as any).connection_id));
        if ((filters as any).database_name) whereClauses.push(eq(queryAudit.databaseName, (filters as any).database_name));

        const where = whereClauses.length ? and(...whereClauses) : undefined;

        // KPIs
        const [kpiRow] = await db
            .select({
                total: sql<number>`COUNT(*)`,
                success: sql<number>`SUM(CASE WHEN ${queryAudit.status} = 'success' THEN 1 ELSE 0 END)`,
                error: sql<number>`SUM(CASE WHEN ${queryAudit.status} = 'error' THEN 1 ELSE 0 END)`,
                avgDuration: sql<number | null>`AVG(${queryAudit.durationMs})`,
                avgRows: sql<number | null>`AVG(${queryAudit.rowsRead})`,
                avgBytes: sql<number | null>`AVG(${queryAudit.bytesRead})`,
            })
            .from(queryAudit)
            .where(where);

        // Time series
        const tsRows = await db
            .select({
                bucket: bucketExpr.as('bucket'),
                total: sql<number>`COUNT(*)`,
                success: sql<number>`SUM(CASE WHEN ${queryAudit.status} = 'success' THEN 1 ELSE 0 END)`,
                error: sql<number>`SUM(CASE WHEN ${queryAudit.status} = 'error' THEN 1 ELSE 0 END)`,
            })
            .from(queryAudit)
            .where(where)
            .groupBy(sql`bucket`)
            .orderBy(sql`bucket`);

        // Source distribution
        const srcRows = await db
            .select({
                source: queryAudit.source,
                count: sql<number>`COUNT(*)`,
            })
            .from(queryAudit)
            .where(where)
            .groupBy(queryAudit.source)
            .orderBy(sql`COUNT(*) DESC`);

        // Top users
        const topUserRows = await db
            .select({
                user_id: queryAudit.userId,
                count: sql<number>`COUNT(*)`,
                error: sql<number>`SUM(CASE WHEN ${queryAudit.status} = 'error' THEN 1 ELSE 0 END)`,
            })
            .from(queryAudit)
            .where(where)
            .groupBy(queryAudit.userId)
            .orderBy(sql`COUNT(*) DESC`)
            .limit(10);

        // Top connections
        const topConnRows = await db
            .select({
                connection_id: queryAudit.connectionId,
                count: sql<number>`COUNT(*)`,
            })
            .from(queryAudit)
            .where(where)
            .groupBy(queryAudit.connectionId)
            .orderBy(sql`COUNT(*) DESC`)
            .limit(10);

        // Top errors
        const errWhere = whereClauses.slice();
        errWhere.push(eq(queryAudit.status, 'error'));
        const errCondition = and(...errWhere);

        const topErrRows = await db
            .select({
                message: queryAudit.errorMessage,
                count: sql<number>`COUNT(*)`,
            })
            .from(queryAudit)
            .where(errCondition)
            .groupBy(queryAudit.errorMessage)
            .orderBy(sql`COUNT(*) DESC`)
            .limit(10);

        const total = kpiRow?.total ?? 0;
        const success = kpiRow?.success ?? 0;
        const error = kpiRow?.error ?? 0;

        return {
            kpis: {
                total,
                success,
                error,
                successRate: total ? success / total : 0,
                // Kept avg for p50/p95 (can switch to percentile_cont later)
                p50DurationMs: Math.round(kpiRow?.avgDuration ?? 0),
                p95DurationMs: Math.round(kpiRow?.avgDuration ?? 0),
                avgRowsRead: kpiRow?.avgRows ?? null,
                avgBytesRead: kpiRow?.avgBytes ?? null,
            },
            timeseries: tsRows.map(r => ({
                ts: String((r as any).bucket),
                total: r.total ?? 0,
                success: r.success ?? 0,
                error: r.error ?? 0,
            })),
            bySource: srcRows.map(r => ({
                source: r.source as any,
                count: r.count ?? 0,
            })),
            topUsers: topUserRows.map(r => ({
                user_id: r.user_id ?? '',
                count: r.count ?? 0,
                error: r.error ?? 0,
            })),
            topConnection: topConnRows.map(r => ({
                connection_id: r.connection_id ?? '',
                count: r.count ?? 0,
            })),
            topErrors: topErrRows.filter(r => !!r.message).map(r => ({ message: r.message as string, count: r.count ?? 0 })),
        };
    }

    async readById(id: string): Promise<AuditItem | null> {
        const db = (await getClient()) as PostgresDBClient;
        const [r] = await db.select().from(queryAudit).where(eq(queryAudit.id, id)).limit(1);
        if (!r) return null;

        return {
            id: r.id,
            created_at: r.createdAt.toISOString(),

            teamId: r.teamId,
            user_id: r.userId,

            source: r.source as any,
            status: r.status as any,

            duration_ms: r.durationMs ?? null,
            rows_read: r.rowsRead ?? null,
            bytes_read: r.bytesRead ?? null,
            rows_written: r.rowsWritten ?? null,

            connection_id: r.connectionId ?? null,
            database_name: r.databaseName ?? null,

            sql_text: r.sqlText,
            extra_json: (r.extraJson as any) ?? null,
        };
    }
}

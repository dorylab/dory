import { and, desc, eq, gte, inArray, lte, sql, type SQLWrapper } from 'drizzle-orm';

import { getClient } from '@/lib/database/postgres/client';
import { aiUsageEvents, aiUsageTraces, user } from '@/lib/database/postgres/schemas';
import { DatabaseError } from '@/lib/errors/DatabaseError';
import type {
    AiUsageEventsParams,
    AiUsageEventsResponse,
    AiUsageOverviewParams,
    AiUsageOverviewResponse,
    AiUsageRepository,
    PostgresDBClient,
} from '@/types';
import { translateDatabase } from '@/lib/database/i18n';

type Cursor = { createdAtMs: number; id: string };

const encCursor = (cursor: Cursor) =>
    Buffer.from(`${cursor.createdAtMs}|${cursor.id}`).toString('base64');

const decCursor = (raw?: string | null): Cursor | null => {
    if (!raw) return null;
    try {
        const [ts, id] = Buffer.from(raw, 'base64').toString('utf8').split('|');
        const createdAtMs = Number(ts);
        if (!id || !Number.isFinite(createdAtMs)) return null;
        return { createdAtMs, id };
    } catch {
        return null;
    }
};

const parseDate = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

export class PostgresAiUsageRepository implements AiUsageRepository {
    private db!: PostgresDBClient;

    async init() {
        try {
            this.db = (await getClient()) as PostgresDBClient;
            if (!this.db) {
                throw new DatabaseError(translateDatabase('Database.Errors.ConnectionFailed'), 500);
            }
        } catch (e) {
            console.error(translateDatabase('Database.Logs.InitFailed'), e);
            throw new DatabaseError(translateDatabase('Database.Errors.InitFailed'), 500);
        }
    }

    private assertInited() {
        if (!this.db) throw new DatabaseError(translateDatabase('Database.Errors.NotInitialized'), 500);
    }

    private buildBaseWhere(params: AiUsageOverviewParams): SQLWrapper[] {
        const where: SQLWrapper[] = [eq(aiUsageEvents.organizationId, params.organizationId)];
        const fromDate = parseDate(params.from);
        const toDate = parseDate(params.to);
        if (fromDate) where.push(gte(aiUsageEvents.createdAt, fromDate));
        if (toDate) where.push(lte(aiUsageEvents.createdAt, toDate));
        if (params.feature) where.push(eq(aiUsageEvents.feature, params.feature));
        if (params.userId) where.push(eq(aiUsageEvents.userId, params.userId));
        if (params.model) where.push(eq(aiUsageEvents.model, params.model));
        return where;
    }

    async getOverview(params: AiUsageOverviewParams): Promise<AiUsageOverviewResponse> {
        this.assertInited();
        const whereExpr = and(...this.buildBaseWhere(params));

        const [kpi] = await this.db
            .select({
                totalRequests: sql<number>`COUNT(*)`,
                totalTokens: sql<number>`COALESCE(SUM(${aiUsageEvents.totalTokens}), 0)`,
                inputTokens: sql<number>`COALESCE(SUM(${aiUsageEvents.inputTokens}), 0)`,
                outputTokens: sql<number>`COALESCE(SUM(${aiUsageEvents.outputTokens}), 0)`,
                reasoningTokens: sql<number>`COALESCE(SUM(${aiUsageEvents.reasoningTokens}), 0)`,
                cachedInputTokens: sql<number>`COALESCE(SUM(${aiUsageEvents.cachedInputTokens}), 0)`,
                cacheHits: sql<number>`SUM(CASE WHEN ${aiUsageEvents.fromCache} = true THEN 1 ELSE 0 END)`,
                errors: sql<number>`SUM(CASE WHEN ${aiUsageEvents.status} = 'error' THEN 1 ELSE 0 END)`,
                aborted: sql<number>`SUM(CASE WHEN ${aiUsageEvents.status} = 'aborted' THEN 1 ELSE 0 END)`,
                avgLatencyMs: sql<number>`COALESCE(AVG(${aiUsageEvents.latencyMs}), 0)`,
                totalCostMicros: sql<number>`COALESCE(SUM(${aiUsageEvents.costMicros}), 0)`,
            })
            .from(aiUsageEvents)
            .where(whereExpr);

        const byFeatureRows = await this.db
            .select({
                feature: aiUsageEvents.feature,
                requests: sql<number>`COUNT(*)`,
                totalTokens: sql<number>`COALESCE(SUM(${aiUsageEvents.totalTokens}), 0)`,
                errors: sql<number>`SUM(CASE WHEN ${aiUsageEvents.status} = 'error' THEN 1 ELSE 0 END)`,
            })
            .from(aiUsageEvents)
            .where(whereExpr)
            .groupBy(aiUsageEvents.feature)
            .orderBy(sql`COUNT(*) DESC`)
            .limit(50);

        const byUserRows = await this.db
            .select({
                userId: aiUsageEvents.userId,
                userName: sql<string>`COALESCE(${user.name}, ${user.email}, ${aiUsageEvents.userId}, 'unknown')`,
                requests: sql<number>`COUNT(*)`,
                totalTokens: sql<number>`COALESCE(SUM(${aiUsageEvents.totalTokens}), 0)`,
                errors: sql<number>`SUM(CASE WHEN ${aiUsageEvents.status} = 'error' THEN 1 ELSE 0 END)`,
            })
            .from(aiUsageEvents)
            .leftJoin(user, eq(aiUsageEvents.userId, user.id))
            .where(whereExpr)
            .groupBy(aiUsageEvents.userId, user.name, user.email)
            .orderBy(sql`COUNT(*) DESC`)
            .limit(50);

        const fromDate = parseDate(params.from);
        const toDate = parseDate(params.to);
        const spanMs =
            fromDate && toDate
                ? toDate.getTime() - fromDate.getTime()
                : Number.NaN;
        const useHourBucket = Number.isFinite(spanMs) ? spanMs <= 3 * 24 * 60 * 60 * 1000 : false;
        const bucketExpr = useHourBucket
            ? sql<string>`to_char(${aiUsageEvents.createdAt}, 'YYYY-MM-DD HH24:00:00')`
            : sql<string>`to_char(${aiUsageEvents.createdAt}, 'YYYY-MM-DD 00:00:00')`;

        const timeseriesRows = await this.db
            .select({
                ts: bucketExpr.as('ts'),
                requests: sql<number>`COUNT(*)`,
                totalTokens: sql<number>`COALESCE(SUM(${aiUsageEvents.totalTokens}), 0)`,
                errors: sql<number>`SUM(CASE WHEN ${aiUsageEvents.status} = 'error' THEN 1 ELSE 0 END)`,
            })
            .from(aiUsageEvents)
            .where(whereExpr)
            .groupBy(sql`ts`)
            .orderBy(sql`ts`);

        const totalRequests = kpi?.totalRequests ?? 0;
        const cacheHits = kpi?.cacheHits ?? 0;
        const errors = kpi?.errors ?? 0;

        return {
            kpis: {
                totalRequests,
                totalTokens: kpi?.totalTokens ?? 0,
                inputTokens: kpi?.inputTokens ?? 0,
                outputTokens: kpi?.outputTokens ?? 0,
                reasoningTokens: kpi?.reasoningTokens ?? 0,
                cachedInputTokens: kpi?.cachedInputTokens ?? 0,
                cacheHits,
                errors,
                aborted: kpi?.aborted ?? 0,
                avgLatencyMs: Math.round(kpi?.avgLatencyMs ?? 0),
                totalCostMicros: kpi?.totalCostMicros ?? 0,
                cacheHitRate: totalRequests ? cacheHits / totalRequests : 0,
                errorRate: totalRequests ? errors / totalRequests : 0,
            },
            byFeature: byFeatureRows.map(row => ({
                feature: row.feature ?? 'unknown',
                requests: row.requests ?? 0,
                totalTokens: row.totalTokens ?? 0,
                errors: row.errors ?? 0,
            })),
            byUser: byUserRows.map(row => ({
                userId: row.userId ?? 'unknown',
                userName: row.userName ?? row.userId ?? 'unknown',
                requests: row.requests ?? 0,
                totalTokens: row.totalTokens ?? 0,
                errors: row.errors ?? 0,
            })),
            timeseries: timeseriesRows.map(row => ({
                ts: String(row.ts),
                requests: row.requests ?? 0,
                totalTokens: row.totalTokens ?? 0,
                errors: row.errors ?? 0,
            })),
        };
    }

    async listEvents(params: AiUsageEventsParams): Promise<AiUsageEventsResponse> {
        this.assertInited();

        const where = this.buildBaseWhere(params);
        if (params.status && (params.status === 'ok' || params.status === 'error' || params.status === 'aborted')) {
            where.push(eq(aiUsageEvents.status, params.status));
        }
        if (params.fromCache !== null && params.fromCache !== undefined) {
            where.push(eq(aiUsageEvents.fromCache, params.fromCache));
        }

        const cursor = decCursor(params.cursor);
        if (cursor) {
            const cursorDate = new Date(cursor.createdAtMs);
            where.push(sql`(${aiUsageEvents.createdAt} < ${cursorDate}
                OR (${aiUsageEvents.createdAt} = ${cursorDate} AND ${aiUsageEvents.id} < ${cursor.id}))`);
        }

        const rawLimit = params.limit ?? 50;
        const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.floor(rawLimit))) : 50;
        const includeTrace = Boolean(params.includeTrace);

        const rows = await this.db
            .select({
                event: aiUsageEvents,
                userName: sql<string>`COALESCE(${user.name}, ${user.email}, ${aiUsageEvents.userId}, 'unknown')`,
            })
            .from(aiUsageEvents)
            .leftJoin(user, eq(aiUsageEvents.userId, user.id))
            .where(and(...where))
            .orderBy(desc(aiUsageEvents.createdAt), desc(aiUsageEvents.id))
            .limit(limit + 1);

        const hasMore = rows.length > limit;
        const slice = hasMore ? rows.slice(0, limit) : rows;
        const requestIds = slice.map(row => row.event.requestId);

        let traceMap = new Map<string, typeof aiUsageTraces.$inferSelect>();
        if (includeTrace && requestIds.length > 0) {
            const traces = await this.db
                .select()
                .from(aiUsageTraces)
                .where(inArray(aiUsageTraces.requestId, requestIds));
            traceMap = new Map(traces.map(item => [item.requestId, item]));
        }

        const items = slice.map(row => {
            const trace = includeTrace ? traceMap.get(row.event.requestId) : undefined;
            const event = row.event;
            return {
                id: event.id,
                requestId: event.requestId,
                createdAt: event.createdAt.toISOString(),
                organizationId: event.organizationId,
                userId: event.userId,
                userName: row.userName ?? event.userId ?? 'unknown',
                feature: event.feature,
                model: event.model,
                promptVersion: event.promptVersion,
                algoVersion: event.algoVersion,
                status: event.status,
                errorCode: event.errorCode,
                errorMessage: event.errorMessage,
                gateway: event.gateway,
                provider: event.provider,
                costMicros: event.costMicros,
                traceId: event.traceId,
                spanId: event.spanId,
                inputTokens: event.inputTokens,
                outputTokens: event.outputTokens,
                reasoningTokens: event.reasoningTokens,
                cachedInputTokens: event.cachedInputTokens,
                totalTokens: event.totalTokens,
                latencyMs: event.latencyMs,
                fromCache: event.fromCache,
                usageJson: event.usageJson,
                trace: trace
                    ? {
                        inputText: trace.inputText,
                        outputText: trace.outputText,
                        inputJson: trace.inputJson,
                        outputJson: trace.outputJson,
                        redacted: trace.redacted,
                        expiresAt: trace.expiresAt.toISOString(),
                    }
                    : null,
            };
        });

        const last = slice[slice.length - 1];
        const nextCursor = hasMore && last
            ? encCursor({
                createdAtMs: last.event.createdAt.getTime(),
                id: last.event.id,
            })
            : null;

        return { items, nextCursor };
    }
}

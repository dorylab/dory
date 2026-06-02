import { actionAudit } from '../../schemas/audit';
import type { PostgresDBClient } from '@dory/shared';
import { getClient } from '../../client';
import { and, desc, eq, gte, inArray, ilike, lte, sql, SQLWrapper } from 'drizzle-orm';

export type ActionAuditLogPayload = {
    actionRunId: string;
    requestId?: string | null;
    actionId: string;
    version: number;
    status: string;
    risk: string;
    effects?: string[] | null;
    organizationId: string;
    userId: string;
    actorType: string;
    actorId?: string | null;
    projection: string;
    source?: string | null;
    resource?: Record<string, unknown> | null;
    inputHash?: string | null;
    redactedInputSummary?: Record<string, unknown> | null;
    redactedOutputSummary?: Record<string, unknown> | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    durationMs: number;
    createdAt?: string | null;
};

export type ActionAuditSearchParams = {
    organizationId: string;
    actionRunId?: string | null;
    actionIds?: string[];
    statuses?: string[];
    sources?: string[];
    actorTypes?: string[];
    actorId?: string | null;
    from?: string | null;
    to?: string | null;
    q?: string | null;
    cursor?: string | null;
    limit?: number | null;
    offset?: number | null;
};

export type ActionAuditItem = {
    id: string;
    actionRunId: string;
    requestId: string | null;
    actionId: string;
    version: number;
    status: string;
    risk: string;
    effects: string[] | null;
    organizationId: string;
    userId: string;
    actorType: string;
    actorId: string | null;
    projection: string;
    source: string | null;
    resource: Record<string, unknown> | null;
    inputHash: string | null;
    redactedInputSummary: Record<string, unknown> | null;
    redactedOutputSummary: Record<string, unknown> | null;
    errorCode: string | null;
    errorMessage: string | null;
    durationMs: number;
    createdAt: string;
};

export type ActionAuditSearchResult = {
    items: ActionAuditItem[];
    total: number;
    nextCursor: string | null;
    hasMore: boolean;
};

type Cursor = { createdAtMs: number; id: string };
const encodeCursor = (cursor: Cursor) => Buffer.from(`${cursor.createdAtMs}|${cursor.id}`).toString('base64');
const decodeCursor = (raw?: string | null): Cursor | null => {
    if (!raw) return null;
    try {
        const [timestamp, id] = Buffer.from(raw, 'base64').toString('utf8').split('|');
        const createdAtMs = Number(timestamp);
        if (!Number.isFinite(createdAtMs) || !id) return null;
        return { createdAtMs, id };
    } catch {
        return null;
    }
};

function parseDate(value?: string | null) {
    if (!value) return null;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function mapActionAuditItem(row: typeof actionAudit.$inferSelect): ActionAuditItem {
    return {
        id: row.id,
        actionRunId: row.actionRunId,
        requestId: row.requestId ?? null,
        actionId: row.actionId,
        version: row.actionVersion,
        status: row.status,
        risk: row.risk,
        effects: row.effects ?? null,
        organizationId: row.organizationId,
        userId: row.userId,
        actorType: row.actorType,
        actorId: row.actorId ?? null,
        projection: row.projection,
        source: row.source ?? null,
        resource: row.resource ?? null,
        inputHash: row.inputHash ?? null,
        redactedInputSummary: row.redactedInputSummary ?? null,
        redactedOutputSummary: row.redactedOutputSummary ?? null,
        errorCode: row.errorCode ?? null,
        errorMessage: row.errorMessage ?? null,
        durationMs: row.durationMs,
        createdAt: row.createdAt.toISOString(),
    };
}

export class PostgresActionAuditRepository {
    private db!: PostgresDBClient;
    private inited = false;

    constructor(db?: PostgresDBClient) {
        if (db) {
            this.db = db;
            this.inited = true;
        }
    }

    async init(): Promise<void> {
        if (this.inited) return;
        this.db = (await getClient()) as PostgresDBClient;
        this.inited = true;
    }

    async log(payload: ActionAuditLogPayload): Promise<void> {
        try {
            if (!this.inited) await this.init();

            await this.db.insert(actionAudit).values({
                actionRunId: payload.actionRunId,
                requestId: payload.requestId ?? null,
                actionId: payload.actionId,
                actionVersion: payload.version,
                status: payload.status,
                risk: payload.risk,
                effects: payload.effects ?? null,
                organizationId: payload.organizationId,
                userId: payload.userId,
                actorType: payload.actorType,
                actorId: payload.actorId ?? null,
                projection: payload.projection,
                source: payload.source ?? null,
                resource: payload.resource ?? null,
                inputHash: payload.inputHash ?? null,
                redactedInputSummary: payload.redactedInputSummary ?? null,
                redactedOutputSummary: payload.redactedOutputSummary ?? null,
                errorCode: payload.errorCode ?? null,
                errorMessage: payload.errorMessage ?? null,
                durationMs: payload.durationMs,
                createdAt: parseDate(payload.createdAt) ?? undefined,
            });
        } catch (error) {
            console.error('[action-audit] failed to write action audit record', error);
        }
    }

    async search(params: ActionAuditSearchParams): Promise<ActionAuditSearchResult> {
        if (!this.inited) await this.init();

        const limit = Math.min(Math.max(Number(params.limit ?? 50), 1), 200);
        const parsedOffset = Number(params.offset ?? 0);
        const offset = Number.isFinite(parsedOffset) ? Math.max(Math.floor(parsedOffset), 0) : 0;
        const where: SQLWrapper[] = [eq(actionAudit.organizationId, params.organizationId)];

        if (params.actionRunId) where.push(eq(actionAudit.actionRunId, params.actionRunId));
        if (params.actionIds?.length) where.push(inArray(actionAudit.actionId, params.actionIds));
        if (params.statuses?.length) where.push(inArray(actionAudit.status, params.statuses));
        if (params.sources?.length) where.push(inArray(actionAudit.source, params.sources));
        if (params.actorTypes?.length) where.push(inArray(actionAudit.actorType, params.actorTypes));
        if (params.actorId) where.push(eq(actionAudit.actorId, params.actorId));

        const from = parseDate(params.from);
        if (from) where.push(gte(actionAudit.createdAt, from));
        const to = parseDate(params.to);
        if (to) where.push(lte(actionAudit.createdAt, to));

        if (params.q?.trim()) {
            const q = `%${params.q.trim()}%`;
            where.push(ilike(actionAudit.actionId, q));
        }

        const cursor = decodeCursor(params.cursor);
        if (cursor) {
            const cursorDate = new Date(cursor.createdAtMs);
            where.push(sql`(${actionAudit.createdAt} < ${cursorDate} OR (${actionAudit.createdAt} = ${cursorDate} AND ${actionAudit.id} < ${cursor.id}))`);
        }

        const whereCondition = and(...where);
        const [totalRow] = await this.db
            .select({
                total: sql<number>`count(*)`,
            })
            .from(actionAudit)
            .where(whereCondition);

        const rows = await this.db
            .select()
            .from(actionAudit)
            .where(whereCondition)
            .orderBy(desc(actionAudit.createdAt), desc(actionAudit.id))
            .offset(offset)
            .limit(limit + 1);

        const hasMore = rows.length > limit;
        const slice = hasMore ? rows.slice(0, limit) : rows;
        const last = slice.at(-1);

        return {
            items: slice.map(mapActionAuditItem),
            total: Number(totalRow?.total ?? 0),
            nextCursor: hasMore && last ? encodeCursor({ createdAtMs: last.createdAt.getTime(), id: last.id }) : null,
            hasMore,
        };
    }

    async getByRunId(organizationId: string, actionRunId: string): Promise<ActionAuditItem | null> {
        if (!this.inited) await this.init();

        const [row] = await this.db
            .select()
            .from(actionAudit)
            .where(and(eq(actionAudit.organizationId, organizationId), eq(actionAudit.actionRunId, actionRunId)))
            .orderBy(desc(actionAudit.createdAt), desc(actionAudit.id))
            .limit(1);

        return row ? mapActionAuditItem(row) : null;
    }
}

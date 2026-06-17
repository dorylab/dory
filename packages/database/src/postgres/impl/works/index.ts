import { gzipSync, gunzipSync } from 'node:zlib';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { getClient } from '@dory/database/postgres/client';
import { tabs, workChartStates, workEvents, workQueryResultPages, workQueryResultSets, workQuerySessions, works } from '@dory/database/postgres/schemas';
import { translateDatabase } from '@dory/database/i18n';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import { newEntityId } from '@dory/shared/id';
import type { PostgresDBClient } from '@dory/shared';

const ROWS_PER_PAGE = 1000;

export type WorkRecord = typeof works.$inferSelect;
export type WorkEventRecord = typeof workEvents.$inferSelect;

export type ResolveWorkInput = {
    organizationId: string;
    userId: string;
    tokenId?: string | null;
    connectionId?: string | null;
    workId?: string | null;
    externalSessionId?: string | null;
    title?: string | null;
    metadata?: Record<string, unknown> | null;
};

export type WorkEventCreateInput = {
    workId: string;
    organizationId: string;
    userId: string;
    tokenId?: string | null;
    connectionId?: string | null;
    toolName: string;
    actionId?: string | null;
    status: 'success' | 'error';
    inputSummary?: Record<string, unknown> | null;
    outputSummary?: Record<string, unknown> | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    durationMs?: number | null;
};

export type WorkSqlSnapshotPayload = {
    session: {
        sessionId: string;
        userId?: string | null;
        tabId?: string | null;
        connectionId?: string | null;
        database?: string | null;
        sqlText: string;
        status: 'running' | 'success' | 'error' | 'canceled' | string;
        errorMessage?: string | null;
        startedAt?: string | Date | number | null;
        finishedAt?: string | Date | number | null;
        durationMs?: number | null;
        resultSetCount?: number | null;
        stopOnError?: boolean | null;
        source?: string | null;
    };
    queryResultSets: Array<Record<string, unknown> & { sessionId: string; setIndex: number; sqlText: string }>;
    results: unknown[][];
};

function toDate(value: unknown, fallback?: Date | null): Date | null {
    if (value instanceof Date) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);
    if (typeof value === 'string' && value) return new Date(value);
    return fallback ?? null;
}

function encodeRows(rows: unknown[]) {
    const json = Buffer.from(JSON.stringify(rows), 'utf8');
    const gzipped = gzipSync(json);
    return {
        data: gzipped,
        isGzip: true,
    };
}

function decodeRows(data: Uint8Array | Buffer, isGzip: boolean): unknown[] {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const json = (isGzip ? gunzipSync(buffer) : buffer).toString('utf8');
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
}

function getString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

function getNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function compactToolInput(input: Record<string, unknown>) {
    const out: Record<string, unknown> = {};
    for (const key of ['operation', 'connectionId', 'database', 'table', 'query', 'limit', 'workspaceMode', 'targetTabId', 'tabName', 'workId', 'externalSessionId']) {
        if (typeof input[key] !== 'undefined') out[key] = input[key];
    }
    if (typeof input.sql === 'string') {
        out.sqlLength = input.sql.length;
    }
    return out;
}

export class PostgresWorksRepository {
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

    async create(input: ResolveWorkInput): Promise<WorkRecord> {
        this.assertInited();
        const now = new Date();
        const [row] = await this.db
            .insert(works)
            .values({
                workId: input.workId?.trim() || newEntityId(),
                organizationId: input.organizationId,
                userId: input.userId,
                tokenId: input.tokenId ?? null,
                connectionId: input.connectionId ?? null,
                externalSessionId: input.externalSessionId ?? null,
                title: input.title?.trim() || 'Agent Run',
                status: 'active',
                metadata: input.metadata ?? null,
                createdAt: now,
                updatedAt: now,
                lastActiveAt: now,
                archivedAt: null,
            })
            .returning();

        if (!row) throw new DatabaseError('Failed to create Work', 500);
        return row as WorkRecord;
    }

    async resolve(input: ResolveWorkInput): Promise<WorkRecord> {
        this.assertInited();
        const now = new Date();
        const requestedWorkId = input.workId?.trim();

        if (requestedWorkId) {
            const row = await this.getById({
                organizationId: input.organizationId,
                userId: input.userId,
                workId: requestedWorkId,
            });
            if (!row) throw new DatabaseError('Work not found.', 404);
            await this.touch(row.workId, now);
            return { ...row, lastActiveAt: now, updatedAt: now } as WorkRecord;
        }

        const externalSessionId = input.externalSessionId?.trim();
        if (externalSessionId) {
            const conds = [
                eq(works.organizationId, input.organizationId),
                eq(works.userId, input.userId),
                eq(works.externalSessionId, externalSessionId),
                input.tokenId ? eq(works.tokenId, input.tokenId) : isNull(works.tokenId),
                input.connectionId ? eq(works.connectionId, input.connectionId) : isNull(works.connectionId),
                isNull(works.archivedAt),
            ];
            const [existing] = await this.db
                .select()
                .from(works)
                .where(and(...conds))
                .orderBy(desc(works.lastActiveAt))
                .limit(1);

            if (existing) {
                await this.touch(existing.workId, now);
                return { ...(existing as WorkRecord), lastActiveAt: now, updatedAt: now };
            }
        }

        return this.create(input);
    }

    async touch(workId: string, now = new Date()) {
        this.assertInited();
        await this.db.update(works).set({ updatedAt: now, lastActiveAt: now }).where(eq(works.workId, workId));
    }

    async getById(params: { organizationId: string; userId: string; workId: string }): Promise<WorkRecord | null> {
        this.assertInited();
        const [row] = await this.db
            .select()
            .from(works)
            .where(and(eq(works.workId, params.workId), eq(works.organizationId, params.organizationId), eq(works.userId, params.userId)))
            .limit(1);
        return (row as WorkRecord | undefined) ?? null;
    }

    async list(params: { organizationId: string; userId: string; limit?: number }): Promise<WorkRecord[]> {
        this.assertInited();
        return (await this.db
            .select()
            .from(works)
            .where(and(eq(works.organizationId, params.organizationId), eq(works.userId, params.userId), isNull(works.archivedAt)))
            .orderBy(desc(works.lastActiveAt))
            .limit(params.limit ?? 100)) as WorkRecord[];
    }

    async listEvents(params: { organizationId: string; userId: string; workId: string }): Promise<WorkEventRecord[]> {
        this.assertInited();
        return (await this.db
            .select()
            .from(workEvents)
            .where(and(eq(workEvents.organizationId, params.organizationId), eq(workEvents.userId, params.userId), eq(workEvents.workId, params.workId)))
            .orderBy(desc(workEvents.createdAt))) as WorkEventRecord[];
    }

    async recordEvent(input: WorkEventCreateInput): Promise<WorkEventRecord> {
        this.assertInited();
        const [row] = await this.db
            .insert(workEvents)
            .values({
                workId: input.workId,
                organizationId: input.organizationId,
                userId: input.userId,
                tokenId: input.tokenId ?? null,
                connectionId: input.connectionId ?? null,
                toolName: input.toolName,
                actionId: input.actionId ?? null,
                status: input.status,
                inputSummary: input.inputSummary ?? null,
                outputSummary: input.outputSummary ?? null,
                errorCode: input.errorCode ?? null,
                errorMessage: input.errorMessage ?? null,
                durationMs: Math.max(0, Math.round(input.durationMs ?? 0)),
            })
            .returning();

        await this.touch(input.workId);
        return row as WorkEventRecord;
    }

    summarizeInput(input: unknown) {
        return input && typeof input === 'object' && !Array.isArray(input) ? compactToolInput(input as Record<string, unknown>) : {};
    }

    async saveSqlSnapshot(workId: string, payload: WorkSqlSnapshotPayload): Promise<void> {
        this.assertInited();
        const session = payload.session;
        const sessionId = session.sessionId;

        await this.db
            .insert(workQuerySessions)
            .values({
                workId,
                sessionId,
                userId: session.userId ?? '',
                tabId: session.tabId ?? '',
                connectionId: session.connectionId ?? null,
                database: session.database ?? null,
                sqlText: session.sqlText,
                status: session.status,
                errorMessage: session.errorMessage ?? null,
                startedAt: toDate(session.startedAt, new Date()) ?? new Date(),
                finishedAt: toDate(session.finishedAt, null),
                durationMs: session.durationMs ?? null,
                resultSetCount: session.resultSetCount ?? payload.queryResultSets.length,
                stopOnError: Boolean(session.stopOnError),
                source: session.source ?? null,
            })
            .onConflictDoUpdate({
                target: [workQuerySessions.workId, workQuerySessions.sessionId],
                set: {
                    userId: session.userId ?? '',
                    tabId: session.tabId ?? '',
                    connectionId: session.connectionId ?? null,
                    database: session.database ?? null,
                    sqlText: session.sqlText,
                    status: session.status,
                    errorMessage: session.errorMessage ?? null,
                    startedAt: toDate(session.startedAt, new Date()) ?? new Date(),
                    finishedAt: toDate(session.finishedAt, null),
                    durationMs: session.durationMs ?? null,
                    resultSetCount: session.resultSetCount ?? payload.queryResultSets.length,
                    stopOnError: Boolean(session.stopOnError),
                    source: session.source ?? null,
                },
            });

        await this.db.delete(workQueryResultPages).where(and(eq(workQueryResultPages.workId, workId), eq(workQueryResultPages.sessionId, sessionId)));
        await this.db.delete(workQueryResultSets).where(and(eq(workQueryResultSets.workId, workId), eq(workQueryResultSets.sessionId, sessionId)));

        if (payload.queryResultSets.length) {
            await this.db.insert(workQueryResultSets).values(
                payload.queryResultSets.map(resultSet => ({
                    workId,
                    sessionId,
                    setIndex: resultSet.setIndex,
                    sqlText: resultSet.sqlText,
                    sqlOp: getString(resultSet.sqlOp),
                    title: getString(resultSet.title),
                    columns: resultSet.columns ?? null,
                    stats: resultSet.stats ?? null,
                    viewState: resultSet.viewState ?? null,
                    aiProfileVersion: getNumber(resultSet.aiProfileVersion) ?? 1,
                    rowCount: getNumber(resultSet.rowCount),
                    limited: Boolean(resultSet.limited),
                    limit: getNumber(resultSet.limit),
                    affectedRows: getNumber(resultSet.affectedRows),
                    status: getString(resultSet.status) ?? 'success',
                    errorMessage: getString(resultSet.errorMessage),
                    errorCode: getString(resultSet.errorCode),
                    errorSqlState: getString(resultSet.errorSqlState),
                    errorMeta: resultSet.errorMeta ?? null,
                    warnings: resultSet.warnings ?? null,
                    startedAt: toDate(resultSet.startedAt, null),
                    finishedAt: toDate(resultSet.finishedAt, null),
                    durationMs: getNumber(resultSet.durationMs),
                })),
            );
        }

        for (let i = 0; i < payload.queryResultSets.length; i += 1) {
            const resultSet = payload.queryResultSets[i]!;
            const rows = Array.isArray(payload.results[i]) ? payload.results[i]! : [];
            for (let offset = 0, pageNo = 0; offset < rows.length; offset += ROWS_PER_PAGE, pageNo += 1) {
                const slice = rows.slice(offset, offset + ROWS_PER_PAGE);
                const encoded = encodeRows(slice);
                await this.db.insert(workQueryResultPages).values({
                    workId,
                    sessionId,
                    setIndex: resultSet.setIndex,
                    pageNo,
                    firstRowIndex: offset,
                    rowCount: slice.length,
                    rowsData: encoded.data,
                    isGzip: encoded.isGzip,
                });
            }
        }
    }

    async getSnapshot(params: { organizationId: string; userId: string; workId: string }) {
        this.assertInited();
        const work = await this.getById(params);
        if (!work) return null;

        const [tabRows, sessionRows, resultSetRows, pageRows, chartRows] = await Promise.all([
            this.db
                .select()
                .from(tabs)
                .where(and(eq(tabs.userId, params.userId), eq(tabs.workId, params.workId)))
                .orderBy(tabs.orderIndex, tabs.createdAt),
            this.db.select().from(workQuerySessions).where(eq(workQuerySessions.workId, params.workId)).orderBy(workQuerySessions.startedAt),
            this.db.select().from(workQueryResultSets).where(eq(workQueryResultSets.workId, params.workId)).orderBy(workQueryResultSets.sessionId, workQueryResultSets.setIndex),
            this.db
                .select()
                .from(workQueryResultPages)
                .where(eq(workQueryResultPages.workId, params.workId))
                .orderBy(workQueryResultPages.sessionId, workQueryResultPages.setIndex, workQueryResultPages.pageNo),
            this.db.select().from(workChartStates).where(eq(workChartStates.workId, params.workId)),
        ]);

        const resultsBySet = new Map<string, unknown[]>();
        for (const page of pageRows) {
            const key = `${page.sessionId}:${page.setIndex}`;
            const rows = resultsBySet.get(key) ?? [];
            rows.push(...decodeRows(page.rowsData as Uint8Array, page.isGzip));
            resultsBySet.set(key, rows);
        }

        const sessions = sessionRows.map(session => {
            const sets = resultSetRows.filter(resultSet => resultSet.sessionId === session.sessionId);
            return {
                session,
                queryResultSets: sets,
                results: sets.map(resultSet => resultsBySet.get(`${resultSet.sessionId}:${resultSet.setIndex}`) ?? []),
            };
        });

        return {
            work,
            tabs: tabRows,
            sessions,
            chartStates: chartRows,
        };
    }
}

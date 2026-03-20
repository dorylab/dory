import { and, asc, desc, eq, isNull, max, or } from 'drizzle-orm';

import { savedQueries } from '@/lib/database/postgres/schemas';
import { getClient } from '@/lib/database/postgres/client';
import { DatabaseError } from '@/lib/errors/DatabaseError';
import { newEntityId } from '@/lib/id';
import type { PostgresDBClient } from '@/types';
import { translateDatabase } from '@/lib/database/i18n';

// Position gap between items for ordering. Using 1000 allows ~10 consecutive
// mid-point insertions before a rebalance is needed (1000→500→250→…→1).
// With a max of 50 queries per scope this is more than sufficient.
const POSITION_GAP = 1000;
const MAX_QUERIES_PER_SCOPE = 50;

export type SavedQueryRecord = typeof savedQueries.$inferSelect;

export type SavedQueryCreateInput = {
    id?: string;
    organizationId: string;
    userId: string;
    title: string;
    description?: string | null;
    sqlText: string;
    context?: Record<string, unknown> | null;
    tags?: string[] | null;
    workId?: string | null;
    connectionId: string;
};

export type SavedQueryUpdateInput = {
    title?: string | null;
    description?: string | null;
    sqlText?: string | null;
    context?: Record<string, unknown> | null;
    tags?: string[] | null;
    workId?: string | null;
    archivedAt?: string | Date | null;
    folderId?: string | null;
    position?: number | null;
};

export type SavedQueryListParams = {
    organizationId: string;
    userId: string;
    includeArchived?: boolean;
    limit?: number;
    connectionId: string;
};

export class PostgresSavedQueriesRepository {
    private db!: PostgresDBClient;

    private normalizeConnectionId(value: string) {
        return value.trim();
    }

    private buildConnectionScopeCondition(connectionId: string) {
        const normalized = this.normalizeConnectionId(connectionId);
        return or(eq(savedQueries.connectionId, normalized), isNull(savedQueries.connectionId));
    }

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

    async create(input: SavedQueryCreateInput): Promise<SavedQueryRecord> {
        this.assertInited();

        const now = new Date();
        const id = input.id ?? newEntityId();

        // Get max position for root-level queries of this user
        const [maxRow] = await this.db
            .select({ maxPos: max(savedQueries.position) })
            .from(savedQueries)
            .where(
                and(
                    eq(savedQueries.organizationId, input.organizationId),
                    eq(savedQueries.userId, input.userId),
                    isNull(savedQueries.folderId),
                    isNull(savedQueries.archivedAt),
                ),
            );

        const position = (maxRow?.maxPos ?? 0) + POSITION_GAP;

        const [row] = await this.db
            .insert(savedQueries)
            .values({
                id,
                organizationId: input.organizationId,
                userId: input.userId,
                title: input.title,
                description: input.description ?? null,
                sqlText: input.sqlText,
                context: (input.context ?? {}) as any,
                tags: (input.tags ?? []) as any,
                workId: input.workId ?? null,
                connectionId: this.normalizeConnectionId(input.connectionId),
                folderId: null,
                position,
                createdAt: now,
                updatedAt: now,
                archivedAt: null,
            })
            .returning();

        if (!row) throw new DatabaseError(translateDatabase('Database.Errors.SaveQueryFailed'), 500);
        return row as SavedQueryRecord;
    }

    async getById(params: {
        organizationId: string;
        userId: string;
        id: string;
        includeArchived?: boolean;
        connectionId: string;
    }): Promise<SavedQueryRecord | null> {
        this.assertInited();

        const conds = [
            eq(savedQueries.id, params.id),
            eq(savedQueries.organizationId, params.organizationId),
            eq(savedQueries.userId, params.userId),
        ];
        if (!params.includeArchived) conds.push(isNull(savedQueries.archivedAt));
        const connectionCond = this.buildConnectionScopeCondition(params.connectionId);
        if (connectionCond) {
            conds.push(connectionCond);
        }

        const [row] = await this.db
            .select()
            .from(savedQueries)
            .where(and(...conds))
            .limit(1);

        return (row as SavedQueryRecord | undefined) ?? null;
    }

    async listAll(params: { organizationId: string; userId: string }): Promise<SavedQueryRecord[]> {
        this.assertInited();

        const rows = await this.db
            .select()
            .from(savedQueries)
            .where(
                and(
                    eq(savedQueries.organizationId, params.organizationId),
                    eq(savedQueries.userId, params.userId),
                    isNull(savedQueries.archivedAt),
                ),
            )
            .orderBy(asc(savedQueries.position), desc(savedQueries.updatedAt));

        return rows as SavedQueryRecord[];
    }

    async list(params: SavedQueryListParams): Promise<SavedQueryRecord[]> {
        this.assertInited();

        const conds = [
            eq(savedQueries.organizationId, params.organizationId),
            eq(savedQueries.userId, params.userId),
        ];
        if (!params.includeArchived) conds.push(isNull(savedQueries.archivedAt));
        const connectionCond = this.buildConnectionScopeCondition(params.connectionId);
        if (connectionCond) {
            conds.push(connectionCond);
        }

        let query = this.db
            .select()
            .from(savedQueries)
            .where(and(...conds))
            .orderBy(asc(savedQueries.position), desc(savedQueries.updatedAt));

        if (params.limit && params.limit > 0) {
            query = (query as any).limit(params.limit);
        }

        const rows = await query;
        return rows as SavedQueryRecord[];
    }

    async update(params: {
        organizationId: string;
        userId: string;
        id: string;
        patch: SavedQueryUpdateInput;
        connectionId: string;
    }): Promise<SavedQueryRecord> {
        this.assertInited();

        const data = params.patch;
        const updatePayload: Record<string, any> = {};
        let hasChanges = false;

        const assign = (key: string, value: any) => {
            updatePayload[key] = value ?? null;
            hasChanges = true;
        };

        if (data.title !== undefined) assign('title', data.title);
        if (data.description !== undefined) assign('description', data.description);
        if (data.sqlText !== undefined) assign('sqlText', data.sqlText);
        if (data.context !== undefined) assign('context', data.context ?? {});
        if (data.tags !== undefined) assign('tags', data.tags ?? []);
        if (data.workId !== undefined) assign('workId', data.workId);
        if (data.archivedAt !== undefined) {
            assign('archivedAt', data.archivedAt ? new Date(data.archivedAt) : null);
        }
        if (data.folderId !== undefined) assign('folderId', data.folderId);
        if (data.position !== undefined) assign('position', data.position ?? 0);

        if (hasChanges) {
            await this.db
                .update(savedQueries)
                .set({ ...updatePayload, updatedAt: new Date() } as any)
                .where(
                    and(
                        eq(savedQueries.id, params.id),
                        eq(savedQueries.organizationId, params.organizationId),
                        eq(savedQueries.userId, params.userId),
                        this.buildConnectionScopeCondition(params.connectionId),
                    ),
                );
        }

        const [row] = await this.db
            .select()
            .from(savedQueries)
            .where(
                and(
                    eq(savedQueries.id, params.id),
                    eq(savedQueries.organizationId, params.organizationId),
                    eq(savedQueries.userId, params.userId),
                    this.buildConnectionScopeCondition(params.connectionId),
                ),
            )
            .limit(1);

        if (!row) throw new DatabaseError(translateDatabase('Database.Errors.SavedQueryNotFound'), 404);
        return row as SavedQueryRecord;
    }

    async delete(params: { organizationId: string; userId: string; id: string; connectionId: string }): Promise<void> {
        this.assertInited();

        await this.db
            .update(savedQueries)
            .set({ archivedAt: new Date(), updatedAt: new Date() } as any)
            .where(
                and(
                    eq(savedQueries.id, params.id),
                    eq(savedQueries.organizationId, params.organizationId),
                    eq(savedQueries.userId, params.userId),
                    this.buildConnectionScopeCondition(params.connectionId),
                ),
            );
    }

    async reorder(params: {
        organizationId: string;
        userId: string;
        folderId: string | null;
        orderedIds: string[];
    }): Promise<void> {
        this.assertInited();

        for (let i = 0; i < params.orderedIds.length; i++) {
            await this.db
                .update(savedQueries)
                .set({ position: (i + 1) * POSITION_GAP, updatedAt: new Date() } as any)
                .where(
                    and(
                        eq(savedQueries.id, params.orderedIds[i]),
                        eq(savedQueries.organizationId, params.organizationId),
                        eq(savedQueries.userId, params.userId),
                    ),
                );
        }
    }
}

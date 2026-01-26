import { and, desc, eq, isNull } from 'drizzle-orm';

import { savedQueries } from '@/lib/database/postgres/schemas';
import { getClient } from '@/lib/database/postgres/client';
import { DatabaseError } from '@/lib/errors/DatabaseError';
import { newEntityId } from '@/lib/id';
import type { PostgresDBClient } from '@/types';
import { translateDatabase } from '@/lib/database/i18n';

export type SavedQueryRecord = typeof savedQueries.$inferSelect;

export type SavedQueryCreateInput = {
    id?: string;
    teamId: string;
    userId: string;
    title: string;
    description?: string | null;
    sqlText: string;
    context?: Record<string, unknown> | null;
    tags?: string[] | null;
    workId?: string | null;
};

export type SavedQueryUpdateInput = {
    title?: string | null;
    description?: string | null;
    sqlText?: string | null;
    context?: Record<string, unknown> | null;
    tags?: string[] | null;
    workId?: string | null;
    archivedAt?: string | Date | null;
};

export type SavedQueryListParams = {
    teamId: string;
    userId: string;
    includeArchived?: boolean;
    limit?: number;
};

export class PostgresSavedQueriesRepository {
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

    async create(input: SavedQueryCreateInput): Promise<SavedQueryRecord> {
        this.assertInited();

        const now = new Date();
        const id = input.id ?? newEntityId();

        const [row] = await this.db
            .insert(savedQueries)
            .values({
                id,
                teamId: input.teamId,
                userId: input.userId,
                title: input.title,
                description: input.description ?? null,
                sqlText: input.sqlText,
                context: (input.context ?? {}) as any,
                tags: (input.tags ?? []) as any,
                workId: input.workId ?? null,
                createdAt: now,
                updatedAt: now,
                archivedAt: null,
            })
            .returning();

        if (!row) throw new DatabaseError(translateDatabase('Database.Errors.SaveQueryFailed'), 500);
        return row as SavedQueryRecord;
    }

    async getById(params: {
        teamId: string;
        userId: string;
        id: string;
        includeArchived?: boolean;
    }): Promise<SavedQueryRecord | null> {
        this.assertInited();

        const conds = [
            eq(savedQueries.id, params.id),
            eq(savedQueries.teamId, params.teamId),
            eq(savedQueries.userId, params.userId),
        ];
        if (!params.includeArchived) conds.push(isNull(savedQueries.archivedAt));

        const [row] = await this.db
            .select()
            .from(savedQueries)
            .where(and(...conds))
            .limit(1);

        return (row as SavedQueryRecord | undefined) ?? null;
    }

    async list(params: SavedQueryListParams): Promise<SavedQueryRecord[]> {
        this.assertInited();

        const conds = [
            eq(savedQueries.teamId, params.teamId),
            eq(savedQueries.userId, params.userId),
        ];
        if (!params.includeArchived) conds.push(isNull(savedQueries.archivedAt));

        let query = this.db
            .select()
            .from(savedQueries)
            .where(and(...conds))
            .orderBy(desc(savedQueries.updatedAt), desc(savedQueries.createdAt));

        if (params.limit && params.limit > 0) {
            query = (query as any).limit(params.limit);
        }

        const rows = await query;
        return rows as SavedQueryRecord[];
    }

    async update(params: {
        teamId: string;
        userId: string;
        id: string;
        patch: SavedQueryUpdateInput;
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

        if (hasChanges) {
            await this.db
                .update(savedQueries)
                .set({ ...updatePayload, updatedAt: new Date() } as any)
                .where(
                    and(
                        eq(savedQueries.id, params.id),
                        eq(savedQueries.teamId, params.teamId),
                        eq(savedQueries.userId, params.userId),
                    ),
                );
        }

        const [row] = await this.db
            .select()
            .from(savedQueries)
            .where(
                and(
                    eq(savedQueries.id, params.id),
                    eq(savedQueries.teamId, params.teamId),
                    eq(savedQueries.userId, params.userId),
                ),
            )
            .limit(1);

        if (!row) throw new DatabaseError(translateDatabase('Database.Errors.SavedQueryNotFound'), 404);
        return row as SavedQueryRecord;
    }

    async delete(params: { teamId: string; userId: string; id: string }): Promise<void> {
        this.assertInited();

        await this.db
            .update(savedQueries)
            .set({ archivedAt: new Date(), updatedAt: new Date() } as any)
            .where(
                and(
                    eq(savedQueries.id, params.id),
                    eq(savedQueries.teamId, params.teamId),
                    eq(savedQueries.userId, params.userId),
                ),
            );
    }
}

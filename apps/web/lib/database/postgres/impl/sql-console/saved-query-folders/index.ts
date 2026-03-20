import { and, asc, count, eq, max } from 'drizzle-orm';

import { savedQueryFolders } from '@/lib/database/postgres/schemas';
import { savedQueries } from '@/lib/database/postgres/schemas';
import { getClient } from '@/lib/database/postgres/client';
import { DatabaseError } from '@/lib/errors/DatabaseError';
import { newEntityId } from '@/lib/id';
import type { PostgresDBClient } from '@/types';
import { translateDatabase } from '@/lib/database/i18n';

// Position gap between items for ordering. Using 1000 allows ~10 consecutive
// mid-point insertions before a rebalance is needed (1000→500→250→…→1).
// With a max of 50 folders this is more than sufficient.
const POSITION_GAP = 1000;
const MAX_FOLDERS = 50;

export type SavedQueryFolderRecord = typeof savedQueryFolders.$inferSelect;

export type SavedQueryFolderCreateInput = {
    organizationId: string;
    userId: string;
    name: string;
};

export type SavedQueryFolderUpdateInput = {
    name?: string;
};

export class PostgresSavedQueryFoldersRepository {
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

    async create(input: SavedQueryFolderCreateInput): Promise<SavedQueryFolderRecord> {
        this.assertInited();

        const now = new Date();

        // Check folder count limit
        const [countRow] = await this.db
            .select({ total: count() })
            .from(savedQueryFolders)
            .where(
                and(
                    eq(savedQueryFolders.organizationId, input.organizationId),
                    eq(savedQueryFolders.userId, input.userId),
                ),
            );
        if ((countRow?.total ?? 0) >= MAX_FOLDERS) {
            throw new DatabaseError(translateDatabase('Database.Errors.FolderLimitReached'), 400);
        }

        // Get max position for this user's folders
        const [maxRow] = await this.db
            .select({ maxPos: max(savedQueryFolders.position) })
            .from(savedQueryFolders)
            .where(
                and(
                    eq(savedQueryFolders.organizationId, input.organizationId),
                    eq(savedQueryFolders.userId, input.userId),
                ),
            );

        const position = (maxRow?.maxPos ?? 0) + POSITION_GAP;

        const [row] = await this.db
            .insert(savedQueryFolders)
            .values({
                id: newEntityId(),
                organizationId: input.organizationId,
                userId: input.userId,
                name: input.name,
                position,
                createdAt: now,
                updatedAt: now,
            })
            .returning();

        if (!row) throw new DatabaseError(translateDatabase('Database.Errors.CreateFolderFailed'), 500);
        return row as SavedQueryFolderRecord;
    }

    async list(params: { organizationId: string; userId: string }): Promise<SavedQueryFolderRecord[]> {
        this.assertInited();

        const rows = await this.db
            .select()
            .from(savedQueryFolders)
            .where(
                and(
                    eq(savedQueryFolders.organizationId, params.organizationId),
                    eq(savedQueryFolders.userId, params.userId),
                ),
            )
            .orderBy(asc(savedQueryFolders.position));

        return rows as SavedQueryFolderRecord[];
    }

    async getById(params: { id: string; organizationId: string; userId: string }): Promise<SavedQueryFolderRecord | null> {
        this.assertInited();

        const [row] = await this.db
            .select()
            .from(savedQueryFolders)
            .where(
                and(
                    eq(savedQueryFolders.id, params.id),
                    eq(savedQueryFolders.organizationId, params.organizationId),
                    eq(savedQueryFolders.userId, params.userId),
                ),
            )
            .limit(1);

        return (row as SavedQueryFolderRecord | undefined) ?? null;
    }

    async update(params: {
        id: string;
        organizationId: string;
        userId: string;
        patch: SavedQueryFolderUpdateInput;
    }): Promise<SavedQueryFolderRecord> {
        this.assertInited();

        const updatePayload: Record<string, any> = {};
        let hasChanges = false;

        if (params.patch.name !== undefined) {
            updatePayload.name = params.patch.name;
            hasChanges = true;
        }

        if (hasChanges) {
            await this.db
                .update(savedQueryFolders)
                .set({ ...updatePayload, updatedAt: new Date() } as any)
                .where(
                    and(
                        eq(savedQueryFolders.id, params.id),
                        eq(savedQueryFolders.organizationId, params.organizationId),
                        eq(savedQueryFolders.userId, params.userId),
                    ),
                );
        }

        const [row] = await this.db
            .select()
            .from(savedQueryFolders)
            .where(
                and(
                    eq(savedQueryFolders.id, params.id),
                    eq(savedQueryFolders.organizationId, params.organizationId),
                    eq(savedQueryFolders.userId, params.userId),
                ),
            )
            .limit(1);

        if (!row) throw new DatabaseError(translateDatabase('Database.Errors.FolderNotFound'), 404);
        return row as SavedQueryFolderRecord;
    }

    async delete(params: { id: string; organizationId: string; userId: string }): Promise<void> {
        this.assertInited();

        // Move queries in this folder back to root level
        await this.db
            .update(savedQueries)
            .set({ folderId: null, updatedAt: new Date() } as any)
            .where(eq(savedQueries.folderId, params.id));

        // Delete the folder
        await this.db
            .delete(savedQueryFolders)
            .where(
                and(
                    eq(savedQueryFolders.id, params.id),
                    eq(savedQueryFolders.organizationId, params.organizationId),
                    eq(savedQueryFolders.userId, params.userId),
                ),
            );
    }

    async reorder(params: { organizationId: string; userId: string; orderedIds: string[] }): Promise<void> {
        this.assertInited();

        for (let i = 0; i < params.orderedIds.length; i++) {
            await this.db
                .update(savedQueryFolders)
                .set({ position: (i + 1) * POSITION_GAP, updatedAt: new Date() } as any)
                .where(
                    and(
                        eq(savedQueryFolders.id, params.orderedIds[i]),
                        eq(savedQueryFolders.organizationId, params.organizationId),
                        eq(savedQueryFolders.userId, params.userId),
                    ),
                );
        }
    }
}

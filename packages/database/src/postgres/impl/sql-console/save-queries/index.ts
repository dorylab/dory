import { and, asc, desc, eq, getTableColumns, inArray, isNull, max, sql } from 'drizzle-orm';

import { savedQueries, savedQueryCollections as favorites, knowledgeQueryMemberships, savedQueryFolders, type SavedQuery } from '@dory/database/postgres/schemas';
import { getClient } from '@dory/database/postgres/client';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import { newEntityId } from '@dory/shared/id';
import type { PostgresDBClient } from '@dory/shared';
import { translateDatabase } from '@dory/database/i18n';

// Position gap between items for ordering. Using 1000 allows ~10 consecutive
// mid-point insertions before a rebalance is needed (1000→500→250→…→1).
// With a max of 50 queries per scope this is more than sufficient.
const POSITION_GAP = 1000;
export type QueryDatabase = Pick<PostgresDBClient, 'select' | 'insert' | 'update' | 'delete' | 'execute' | 'transaction'>;
const { queryId: collectionId, ...collectionFields } = getTableColumns(favorites);
const fields = { ...getTableColumns(savedQueries), ...collectionFields };
export type PersonalScope = { organizationId: string; userId: string; connectionId: string };
function scope(input: PersonalScope) {
    return and(eq(savedQueries.organizationId, input.organizationId), eq(savedQueries.connectionId, input.connectionId), eq(favorites.userId, input.userId));
}

export type SavedQueryRecord = SavedQuery;

export type SavedQueryCreateInput = {
    id?: string;
    organizationId: string;
    userId: string;
    title: string;
    autoName?: boolean;
    description?: string | null;
    folderId?: string | null;
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
    revision?: number;
};

export type SavedQueryListParams = {
    organizationId: string;
    userId: string;
    includeArchived?: boolean;
    limit?: number;
    connectionId: string;
};

export async function updateQueryBody(
    db: QueryDatabase,
    input: { organizationId: string; id: string; title?: string | null; description?: string | null; sqlText?: string | null; revision?: number },
) {
    const [row] = await db
        .update(savedQueries)
        .set({
            title: input.title ?? undefined,
            description: input.description,
            sqlText: input.sqlText ?? undefined,
            ...(input.title !== undefined || input.sqlText !== undefined ? { namingSource: 'manual' as const, namingRequestId: null } : {}),
            updatedAt: new Date(),
            revision: sql`${savedQueries.revision}+1`,
        })
        .where(
            and(
                eq(savedQueries.id, input.id),
                eq(savedQueries.organizationId, input.organizationId),
                input.revision === undefined ? undefined : eq(savedQueries.revision, input.revision),
            ),
        )
        .returning();
    if (!row) throw new DatabaseError('Query changed. Reload before saving.', 409);
    return row;
}

export class PostgresSavedQueriesRepository {
    private db!: QueryDatabase;

    async init(db?: QueryDatabase) {
        const client = db ?? (await getClient());
        if (!client) throw new DatabaseError(translateDatabase('Database.Errors.ConnectionFailed'), 500);
        this.db = client;
    }

    private async assertFolder(db: QueryDatabase, input: PersonalScope, id: string) {
        const [row] = await db
            .select({ id: savedQueryFolders.id })
            .from(savedQueryFolders)
            .where(
                and(
                    eq(savedQueryFolders.id, id),
                    eq(savedQueryFolders.organizationId, input.organizationId),
                    eq(savedQueryFolders.connectionId, input.connectionId),
                    eq(savedQueryFolders.userId, input.userId),
                ),
            )
            .for('share');
        if (!row) throw new DatabaseError(translateDatabase('Database.Errors.FolderNotFound'), 404);
    }

    async create(input: SavedQueryCreateInput) {
        const id = input.id ?? newEntityId();
        return this.db.transaction(async tx => {
            if (input.folderId) await this.assertFolder(tx, input, input.folderId);
            const [inserted] = await tx
                .insert(savedQueries)
                .values({
                    id,
                    organizationId: input.organizationId,
                    connectionId: input.connectionId,
                    title: input.title,
                    description: input.description,
                    sqlText: input.sqlText,
                    namingSource: input.autoName ? 'rule' : 'manual',
                })
                .onConflictDoNothing()
                .returning();
            if (inserted) {
                const [last] = await tx
                    .select({ position: max(favorites.position) })
                    .from(favorites)
                    .innerJoin(savedQueries, eq(savedQueries.id, collectionId))
                    .where(and(scope(input), isNull(favorites.archivedAt), input.folderId ? eq(favorites.folderId, input.folderId) : isNull(favorites.folderId)));
                await tx.insert(favorites).values({
                    queryId: id,
                    userId: input.userId,
                    folderId: input.folderId,
                    position: (last?.position ?? 0) + POSITION_GAP,
                    context: input.context ?? {},
                    tags: input.tags ?? [],
                    workId: input.workId,
                });
            }
            const [row] = await tx
                .select(fields)
                .from(favorites)
                .innerJoin(savedQueries, eq(savedQueries.id, collectionId))
                .where(and(scope(input), eq(collectionId, id)));
            if (!row || (!inserted && (row.sqlText !== input.sqlText || row.archivedAt))) throw new DatabaseError('Query ID is already in use.', 409);
            return row;
        });
    }

    async collectShared(input: PersonalScope & { id: string; folderId?: string | null }) {
        return this.db.transaction(async tx => {
            const [asset] = await tx
                .select({ id: savedQueries.id })
                .from(savedQueries)
                .innerJoin(knowledgeQueryMemberships, eq(knowledgeQueryMemberships.savedQueryId, savedQueries.id))
                .where(and(eq(savedQueries.id, input.id), eq(savedQueries.connectionId, input.connectionId), eq(savedQueries.organizationId, input.organizationId)))
                .limit(1)
                .for('update', { of: savedQueries });
            if (!asset) throw new DatabaseError('Shared query not found.', 404);
            if (input.folderId) await this.assertFolder(tx, input, input.folderId);
            const [last] = await tx
                .select({ position: max(favorites.position) })
                .from(favorites)
                .innerJoin(savedQueries, eq(savedQueries.id, collectionId))
                .where(and(scope(input), isNull(favorites.archivedAt), input.folderId ? eq(favorites.folderId, input.folderId) : isNull(favorites.folderId)));
            await tx
                .insert(favorites)
                .values({ queryId: input.id, userId: input.userId, folderId: input.folderId, position: (last?.position ?? 0) + POSITION_GAP })
                .onConflictDoUpdate({ target: [favorites.queryId, favorites.userId], set: { archivedAt: null } });
            return { id: input.id };
        });
    }

    async getById(input: PersonalScope & { id: string; includeArchived?: boolean }) {
        const [row] = await this.db
            .select(fields)
            .from(favorites)
            .innerJoin(savedQueries, eq(savedQueries.id, collectionId))
            .where(and(scope(input), eq(collectionId, input.id), input.includeArchived ? undefined : isNull(favorites.archivedAt)));
        return row ?? null;
    }

    async listAll(input: Pick<PersonalScope, 'userId' | 'organizationId'>) {
        return this.db
            .select(fields)
            .from(favorites)
            .innerJoin(savedQueries, eq(savedQueries.id, collectionId))
            .where(and(eq(savedQueries.organizationId, input.organizationId), eq(favorites.userId, input.userId), isNull(favorites.archivedAt)))
            .orderBy(asc(favorites.position), desc(savedQueries.updatedAt));
    }

    async list(input: SavedQueryListParams) {
        return this.db
            .select(fields)
            .from(favorites)
            .innerJoin(savedQueries, eq(savedQueries.id, collectionId))
            .where(and(scope(input), input.includeArchived ? undefined : isNull(favorites.archivedAt)))
            .orderBy(asc(favorites.position), desc(savedQueries.updatedAt))
            .limit(input.limit ?? 2147483647);
    }

    async update(input: PersonalScope & { id: string; patch: SavedQueryUpdateInput; allowSharedEdit?: boolean }) {
        const { patch } = input;
        return this.db.transaction(async tx => {
            const condition = and(scope(input), eq(savedQueries.id, input.id));
            const [current] = await tx.select(fields).from(savedQueries).innerJoin(favorites, eq(collectionId, savedQueries.id)).where(condition).for('update');
            if (!current) throw new DatabaseError(translateDatabase('Database.Errors.SavedQueryNotFound'), 404);
            if (patch.title !== undefined || patch.description !== undefined || patch.sqlText !== undefined) {
                const [membership] = await tx
                    .select({ id: knowledgeQueryMemberships.id })
                    .from(knowledgeQueryMemberships)
                    .where(eq(knowledgeQueryMemberships.savedQueryId, input.id))
                    .limit(1);
                if (membership && !input.allowSharedEdit) throw new DatabaseError('Knowledge write access is required to edit a shared query.', 403);
                await updateQueryBody(tx, { ...patch, id: input.id, organizationId: input.organizationId });
            }
            const { context, tags, workId, folderId, position, archivedAt } = patch;
            if ([context, tags, workId, folderId, position, archivedAt].some(value => value !== undefined)) {
                if (folderId) await this.assertFolder(tx, input, folderId);
                await tx
                    .update(favorites)
                    .set({
                        context: context === null ? {} : context,
                        tags: tags === null ? [] : tags,
                        workId,
                        folderId,
                        position: position === null ? 0 : position,
                        archivedAt: archivedAt == null ? archivedAt : new Date(archivedAt),
                    })
                    .where(and(eq(collectionId, input.id), eq(favorites.userId, input.userId)));
            }
            const [row] = await tx.select(fields).from(savedQueries).innerJoin(favorites, eq(collectionId, savedQueries.id)).where(condition);
            return row!;
        });
    }

    async delete(input: PersonalScope & { id: string }) {
        await this.db.transaction(async tx => {
            const [row] = await tx
                .select({ id: savedQueries.id })
                .from(savedQueries)
                .innerJoin(favorites, eq(collectionId, savedQueries.id))
                .where(and(scope(input), eq(savedQueries.id, input.id)))
                .for('update');
            if (row) await tx.delete(favorites).where(and(eq(collectionId, input.id), eq(favorites.userId, input.userId)));
        });
    }

    async reorder(input: PersonalScope & { folderId: string | null; orderedIds: string[] }) {
        await this.db.transaction(async tx => {
            if (input.folderId) await this.assertFolder(tx, input, input.folderId);
            const allowed = tx
                .select({ id: savedQueries.id })
                .from(savedQueries)
                .where(and(eq(savedQueries.organizationId, input.organizationId), eq(savedQueries.connectionId, input.connectionId)));
            for (const [index, id] of input.orderedIds.entries()) {
                await tx
                    .update(favorites)
                    .set({ position: (index + 1) * POSITION_GAP })
                    .where(
                        and(
                            eq(collectionId, id),
                            eq(favorites.userId, input.userId),
                            inArray(collectionId, allowed),
                            input.folderId ? eq(favorites.folderId, input.folderId) : isNull(favorites.folderId),
                        ),
                    );
            }
        });
    }
}

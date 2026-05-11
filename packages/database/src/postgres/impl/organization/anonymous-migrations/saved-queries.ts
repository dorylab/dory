import { and, eq } from 'drizzle-orm';
import { schema } from '@dory/database/schema';
import type { AnonymousOwnershipMigration } from './types';

const tables = ['savedQueryFolders', 'savedQueries'];

export const savedQueriesAnonymousOwnershipMigration: AnonymousOwnershipMigration = {
    id: 'saved-queries',
    tables,
    async migrate(tx, params) {
        const movedFolders = await tx
            .update(schema.savedQueryFolders)
            .set({
                organizationId: params.targetOrganizationId,
                userId: params.newUserId,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(schema.savedQueryFolders.organizationId, params.sourceOrganizationId),
                    eq(schema.savedQueryFolders.userId, params.anonymousUserId),
                ),
            )
            .returning({ id: schema.savedQueryFolders.id });

        const movedQueries = await tx
            .update(schema.savedQueries)
            .set({
                organizationId: params.targetOrganizationId,
                userId: params.newUserId,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(schema.savedQueries.organizationId, params.sourceOrganizationId),
                    eq(schema.savedQueries.userId, params.anonymousUserId),
                ),
            )
            .returning({ id: schema.savedQueries.id });

        return {
            id: 'saved-queries',
            tables,
            counts: {
                savedQueryFoldersMoved: movedFolders.length,
                savedQueriesMoved: movedQueries.length,
            },
        };
    },
};

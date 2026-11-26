import { and, eq, ne } from 'drizzle-orm';
import { schema } from '@dory/database/schema';
import type { AnonymousOwnershipMigration } from './types';

const tables = ['savedQueryFolders', 'savedQueries', 'savedQueryCollections'];

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
            .where(and(eq(schema.savedQueryFolders.organizationId, params.sourceOrganizationId), eq(schema.savedQueryFolders.userId, params.anonymousUserId)))
            .returning({ id: schema.savedQueryFolders.id });

        const collections = await tx
            .select({ query: schema.savedQueries, collection: schema.savedQueryCollections })
            .from(schema.savedQueryCollections)
            .innerJoin(schema.savedQueries, eq(schema.savedQueryCollections.queryId, schema.savedQueries.id))
            .where(and(eq(schema.savedQueries.organizationId, params.sourceOrganizationId), eq(schema.savedQueryCollections.userId, params.anonymousUserId)))
            .orderBy(schema.savedQueries.id)
            .for('update');
        for (const { query, collection } of collections) {
            let queryId = query.id;
            if (params.sourceOrganizationId !== params.targetOrganizationId) {
                const [shared] = await tx
                    .select({ id: schema.knowledgeQueryMemberships.id })
                    .from(schema.knowledgeQueryMemberships)
                    .where(eq(schema.knowledgeQueryMemberships.savedQueryId, query.id))
                    .limit(1);
                const [otherOwner] = await tx
                    .select({ id: schema.savedQueryCollections.userId })
                    .from(schema.savedQueryCollections)
                    .where(and(eq(schema.savedQueryCollections.queryId, query.id), ne(schema.savedQueryCollections.userId, params.anonymousUserId)))
                    .limit(1);
                if (shared || otherOwner) {
                    // Keep other members’ references in the original organization.
                    const [copy] = await tx
                        .insert(schema.savedQueries)
                        .values({ ...query, id: undefined, organizationId: params.targetOrganizationId, namingSource: 'manual', namingRequestId: null })
                        .returning({ id: schema.savedQueries.id });
                    queryId = copy!.id;
                } else {
                    await tx.update(schema.savedQueries).set({ organizationId: params.targetOrganizationId }).where(eq(schema.savedQueries.id, query.id));
                }
            }
            if (queryId !== query.id || params.newUserId !== params.anonymousUserId) {
                await tx
                    .insert(schema.savedQueryCollections)
                    .values({ ...collection, queryId, userId: params.newUserId })
                    .onConflictDoNothing();
                await tx
                    .delete(schema.savedQueryCollections)
                    .where(and(eq(schema.savedQueryCollections.queryId, query.id), eq(schema.savedQueryCollections.userId, params.anonymousUserId)));
            }
        }
        return {
            id: 'saved-queries',
            tables,
            counts: {
                savedQueryFoldersMoved: movedFolders.length,
                savedQueriesMoved: collections.length,
            },
        };
    },
};

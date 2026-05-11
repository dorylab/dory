import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { schema } from '@dory/database/schema';
import type { AnonymousOwnershipMigration } from './types';

const tables = ['connections', 'connectionIdentities', 'tabs', 'aiSchemaCache', 'syncOperations'];

function buildImportedConnectionName(baseName: string, occupiedNames: Set<string>) {
    const normalizedBaseName = baseName.trim() || 'Imported connection';
    let candidate = normalizedBaseName;
    let counter = 2;

    while (occupiedNames.has(candidate)) {
        candidate = `${normalizedBaseName} (${counter})`;
        counter += 1;
    }

    occupiedNames.add(candidate);
    return candidate;
}

export const connectionsAnonymousOwnershipMigration: AnonymousOwnershipMigration = {
    id: 'connections',
    tables,
    async migrate(tx, params) {
        const sourceConnections = await tx
            .select({
                id: schema.connections.id,
                name: schema.connections.name,
            })
            .from(schema.connections)
            .where(and(eq(schema.connections.organizationId, params.sourceOrganizationId), isNull(schema.connections.deletedAt)));

        const renamedConnections: Array<{
            id: string;
            from: string;
            to: string;
        }> = [];

        if (params.sourceOrganizationId !== params.targetOrganizationId) {
            const targetConnections = await tx
                .select({
                    id: schema.connections.id,
                    name: schema.connections.name,
                })
                .from(schema.connections)
                .where(and(eq(schema.connections.organizationId, params.targetOrganizationId), isNull(schema.connections.deletedAt)));

            const occupiedConnectionNames = new Set(targetConnections.map(connection => connection.name));
            for (const sourceConnection of sourceConnections) {
                if (!occupiedConnectionNames.has(sourceConnection.name)) {
                    occupiedConnectionNames.add(sourceConnection.name);
                    continue;
                }

                const renamedConnection = buildImportedConnectionName(sourceConnection.name, occupiedConnectionNames);
                await tx
                    .update(schema.connections)
                    .set({
                        name: renamedConnection,
                        updatedAt: new Date(),
                    })
                    .where(eq(schema.connections.id, sourceConnection.id));

                renamedConnections.push({
                    id: sourceConnection.id,
                    from: sourceConnection.name,
                    to: renamedConnection,
                });
            }
        }

        const connectionIds = sourceConnections.map(connection => connection.id);

        let connectionsMoved = 0;
        if (params.sourceOrganizationId !== params.targetOrganizationId && connectionIds.length > 0) {
            const movedConnections = await tx
                .update(schema.connections)
                .set({
                    organizationId: params.targetOrganizationId,
                    createdByUserId: params.newUserId,
                    updatedAt: new Date(),
                })
                .where(eq(schema.connections.organizationId, params.sourceOrganizationId))
                .returning({ id: schema.connections.id });

            connectionsMoved = movedConnections.length;
        } else if (connectionIds.length > 0) {
            await tx
                .update(schema.connections)
                .set({
                    createdByUserId: params.newUserId,
                    updatedAt: new Date(),
                })
                .where(eq(schema.connections.organizationId, params.sourceOrganizationId));
        }

        const sourceIdentities =
            connectionIds.length > 0
                ? await tx
                      .select({ id: schema.connectionIdentities.id })
                      .from(schema.connectionIdentities)
                      .where(inArray(schema.connectionIdentities.connectionId, connectionIds))
                : [];

        const identityIds = sourceIdentities.map(identity => identity.id);

        let connectionIdentitiesMoved = 0;
        if (params.sourceOrganizationId !== params.targetOrganizationId && connectionIds.length > 0) {
            const movedIdentities = await tx
                .update(schema.connectionIdentities)
                .set({
                    organizationId: params.targetOrganizationId,
                    createdByUserId: params.newUserId,
                    updatedAt: new Date(),
                })
                .where(inArray(schema.connectionIdentities.connectionId, connectionIds))
                .returning({ id: schema.connectionIdentities.id });

            connectionIdentitiesMoved = movedIdentities.length;
        } else if (connectionIds.length > 0) {
            await tx
                .update(schema.connectionIdentities)
                .set({
                    createdByUserId: params.newUserId,
                    updatedAt: new Date(),
                })
                .where(eq(schema.connectionIdentities.organizationId, params.sourceOrganizationId));
        }

        let tabsMoved = 0;
        if (connectionIds.length > 0) {
            const movedTabs = await tx
                .update(schema.tabs)
                .set({
                    userId: params.newUserId,
                    updatedAt: new Date(),
                })
                .where(and(eq(schema.tabs.userId, params.anonymousUserId), inArray(schema.tabs.connectionId, connectionIds)))
                .returning({ tabId: schema.tabs.tabId });

            tabsMoved = movedTabs.length;
        }

        let aiSchemaCacheMoved = 0;
        if (params.sourceOrganizationId !== params.targetOrganizationId && connectionIds.length > 0) {
            const movedCaches = await tx
                .update(schema.aiSchemaCache)
                .set({
                    organizationId: params.targetOrganizationId,
                    updatedAt: new Date().toISOString(),
                })
                .where(
                    and(
                        eq(schema.aiSchemaCache.organizationId, params.sourceOrganizationId),
                        inArray(schema.aiSchemaCache.connectionId, connectionIds),
                    ),
                )
                .returning({ id: schema.aiSchemaCache.id });

            aiSchemaCacheMoved = movedCaches.length;
        }

        let syncOperationsMoved = 0;
        if (params.sourceOrganizationId !== params.targetOrganizationId && (connectionIds.length > 0 || identityIds.length > 0)) {
            const syncConditions: any[] = [];
            if (connectionIds.length > 0) {
                syncConditions.push(and(eq(schema.syncOperations.entityType, 'connection'), inArray(schema.syncOperations.entityId, connectionIds)));
            }
            if (identityIds.length > 0) {
                syncConditions.push(and(eq(schema.syncOperations.entityType, 'connection_identity'), inArray(schema.syncOperations.entityId, identityIds)));
            }

            const movedSyncOperations = await tx
                .update(schema.syncOperations)
                .set({
                    organizationId: params.targetOrganizationId,
                    updatedAt: new Date(),
                })
                .where(and(eq(schema.syncOperations.organizationId, params.sourceOrganizationId), or(...syncConditions)))
                .returning({ id: schema.syncOperations.id });

            syncOperationsMoved = movedSyncOperations.length;
        }

        return {
            id: 'connections',
            tables,
            counts: {
                connectionsMoved,
                connectionIdentitiesMoved,
                tabsMoved,
                aiSchemaCacheMoved,
                syncOperationsMoved,
            },
            details: {
                renamedConnections,
            },
        };
    },
};

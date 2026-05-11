import { and, eq, inArray } from 'drizzle-orm';
import { schema } from '@dory/database/schema';
import type { PostgresDBClient } from '@dory/shared';
import { findOwnedOrganizationIdsForUser, getDb } from './common';

export const anonymousDeleteCleanupTableCoverage = {
    connectionIdentityScoped: ['connectionIdentitySecrets'],
    connectionScoped: ['connectionSsh', 'tabs', 'aiSchemaCache', 'syncOperations'],
    organizationScoped: [
        'chatMessages',
        'chatSessionState',
        'chatSessions',
        'savedQueries',
        'savedQueryFolders',
        'queryAudit',
        'aiUsageEvents',
        'aiUsageTraces',
        'invitation',
        'organizationMembers',
        'connectionIdentities',
        'connections',
        'organizations',
    ],
} as const;

export const anonymousMergeCleanupTableCoverage = {
    organizationScoped: ['queryAudit', 'aiUsageEvents', 'aiUsageTraces', 'invitation'],
} as const;

type DeleteAnonymousUserResult = {
    organizationIds: string[];
    deletedOrganizations: number;
};

export async function cleanupNonMigratedAnonymousOrganizations(
    tx: Pick<PostgresDBClient, 'delete'>,
    organizationIds: string[],
) {
    if (organizationIds.length === 0) {
        return;
    }

    await tx.delete(schema.queryAudit).where(inArray(schema.queryAudit.organizationId, organizationIds));
    await tx.delete(schema.aiUsageEvents).where(inArray(schema.aiUsageEvents.organizationId, organizationIds));
    await tx.delete(schema.aiUsageTraces).where(inArray(schema.aiUsageTraces.organizationId, organizationIds));
    await tx.delete(schema.invitation).where(inArray(schema.invitation.organizationId, organizationIds));
}

async function cleanupAnonymousOrganizationsWithTx(
    tx: Pick<PostgresDBClient, 'select' | 'delete'>,
    userId: string,
): Promise<DeleteAnonymousUserResult> {
    const organizationIds = await findOwnedOrganizationIdsForUser(tx, userId);

    if (organizationIds.length === 0) {
        return { organizationIds: [], deletedOrganizations: 0 };
    }

    const connections = await tx.select({ id: schema.connections.id }).from(schema.connections).where(inArray(schema.connections.organizationId, organizationIds));
    const connectionIds = connections.map(connection => connection.id);

    const connectionIdentities = connectionIds.length
        ? await tx.select({ id: schema.connectionIdentities.id }).from(schema.connectionIdentities).where(inArray(schema.connectionIdentities.connectionId, connectionIds))
        : [];
    const connectionIdentityIds = connectionIdentities.map(identity => identity.id);

    if (connectionIdentityIds.length > 0) {
        await tx.delete(schema.connectionIdentitySecrets).where(inArray(schema.connectionIdentitySecrets.identityId, connectionIdentityIds));
    }

    if (connectionIds.length > 0) {
        await tx.delete(schema.connectionSsh).where(inArray(schema.connectionSsh.connectionId, connectionIds));
        await tx.delete(schema.tabs).where(inArray(schema.tabs.connectionId, connectionIds));
        await tx.delete(schema.aiSchemaCache).where(inArray(schema.aiSchemaCache.connectionId, connectionIds));
        await tx.delete(schema.syncOperations).where(and(eq(schema.syncOperations.entityType, 'connection'), inArray(schema.syncOperations.entityId, connectionIds)));
    }

    if (connectionIdentityIds.length > 0) {
        await tx
            .delete(schema.syncOperations)
            .where(and(eq(schema.syncOperations.entityType, 'connection_identity'), inArray(schema.syncOperations.entityId, connectionIdentityIds)));
    }

    await tx.delete(schema.chatMessages).where(inArray(schema.chatMessages.organizationId, organizationIds));
    await tx.delete(schema.chatSessionState).where(inArray(schema.chatSessionState.organizationId, organizationIds));
    await tx.delete(schema.chatSessions).where(inArray(schema.chatSessions.organizationId, organizationIds));
    await tx.delete(schema.savedQueries).where(inArray(schema.savedQueries.organizationId, organizationIds));
    await tx.delete(schema.savedQueryFolders).where(inArray(schema.savedQueryFolders.organizationId, organizationIds));
    await cleanupNonMigratedAnonymousOrganizations(tx, organizationIds);
    await tx.delete(schema.organizationMembers).where(inArray(schema.organizationMembers.organizationId, organizationIds));
    await tx.delete(schema.connectionIdentities).where(inArray(schema.connectionIdentities.organizationId, organizationIds));
    await tx.delete(schema.connections).where(inArray(schema.connections.organizationId, organizationIds));
    await tx.delete(schema.organizations).where(inArray(schema.organizations.id, organizationIds));

    return {
        organizationIds,
        deletedOrganizations: organizationIds.length,
    };
}

export async function cleanupAnonymousUserOrganizations(userId: string) {
    const db = await getDb();
    return db.transaction(async tx => cleanupAnonymousOrganizationsWithTx(tx, userId));
}

export async function deleteAnonymousUserLocally(userId: string) {
    const db = await getDb();

    return db.transaction(async tx => {
        const cleanupResult = await cleanupAnonymousOrganizationsWithTx(tx, userId);
        await tx.delete(schema.user).where(eq(schema.user.id, userId));
        return cleanupResult;
    });
}

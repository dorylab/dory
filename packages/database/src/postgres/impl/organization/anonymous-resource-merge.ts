import { anonymousOwnershipMigrations, anonymousOwnershipNoMigratePolicies, getAnonymousOwnershipTablePolicies } from './anonymous-migrations/registry';
import type { AnonymousOwnershipMigrationParams, AnonymousOwnershipMigrationResult, AnonymousOwnershipMigrationTx } from './anonymous-migrations/types';

export type AnonymousOrganizationOwnershipMigrationResult = {
    sourceOrganizationId: string;
    targetOrganizationId: string;
    renamedConnections: Array<{
        id: string;
        from: string;
        to: string;
    }>;
    tabsMoved: number;
    chatSessionsMoved: number;
    chatMessagesMoved: number;
    chatSessionStateMoved: number;
    savedQueriesMoved: number;
    savedQueryFoldersMoved: number;
    connectionsMoved: number;
    connectionIdentitiesMoved: number;
    aiSchemaCacheMoved: number;
    syncOperationsMoved: number;
    migrationResults: AnonymousOwnershipMigrationResult[];
    skippedTables: string[];
};

export type AnonymousOrganizationMergeResult = AnonymousOrganizationOwnershipMigrationResult;

function sumCount(results: AnonymousOwnershipMigrationResult[], key: string) {
    return results.reduce((total, result) => total + (result.counts[key] ?? 0), 0);
}

function getRenamedConnections(results: AnonymousOwnershipMigrationResult[]) {
    const connectionResult = results.find(result => result.id === 'connections');
    const renamedConnections = connectionResult?.details?.renamedConnections;
    return Array.isArray(renamedConnections)
        ? (renamedConnections as Array<{
              id: string;
              from: string;
              to: string;
          }>)
        : [];
}

export async function migrateAnonymousOrganizationOwnership(
    tx: AnonymousOwnershipMigrationTx,
    params: AnonymousOwnershipMigrationParams,
): Promise<AnonymousOrganizationOwnershipMigrationResult> {
    const migrationResults: AnonymousOwnershipMigrationResult[] = [];

    for (const migration of anonymousOwnershipMigrations) {
        migrationResults.push(await migration.migrate(tx, params));
    }

    return {
        sourceOrganizationId: params.sourceOrganizationId,
        targetOrganizationId: params.targetOrganizationId,
        renamedConnections: getRenamedConnections(migrationResults),
        tabsMoved: sumCount(migrationResults, 'tabsMoved'),
        chatSessionsMoved: sumCount(migrationResults, 'chatSessionsMoved'),
        chatMessagesMoved: sumCount(migrationResults, 'chatMessagesMoved'),
        chatSessionStateMoved: sumCount(migrationResults, 'chatSessionStateMoved'),
        savedQueriesMoved: sumCount(migrationResults, 'savedQueriesMoved'),
        savedQueryFoldersMoved: sumCount(migrationResults, 'savedQueryFoldersMoved'),
        connectionsMoved: sumCount(migrationResults, 'connectionsMoved'),
        connectionIdentitiesMoved: sumCount(migrationResults, 'connectionIdentitiesMoved'),
        aiSchemaCacheMoved: sumCount(migrationResults, 'aiSchemaCacheMoved'),
        syncOperationsMoved: sumCount(migrationResults, 'syncOperationsMoved'),
        migrationResults,
        skippedTables: anonymousOwnershipNoMigratePolicies.map(policy => policy.table),
    };
}

export async function mergeAnonymousOrganizationIntoExistingOrganization(
    tx: AnonymousOwnershipMigrationTx,
    params: AnonymousOwnershipMigrationParams,
): Promise<AnonymousOrganizationMergeResult> {
    return migrateAnonymousOrganizationOwnership(tx, params);
}

export { anonymousOwnershipMigrations, anonymousOwnershipNoMigratePolicies, getAnonymousOwnershipTablePolicies };

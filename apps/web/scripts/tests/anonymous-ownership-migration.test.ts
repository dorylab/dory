import assert from 'node:assert/strict';
import test from 'node:test';
import { getTableColumns } from 'drizzle-orm';
import { schema } from '@dory/database/postgres/schemas';
import {
    anonymousOwnershipMigrations,
    anonymousOwnershipNoMigratePolicies,
    getAnonymousOwnershipTablePolicies,
} from '@dory/database/postgres/impl/organization/anonymous-resource-merge';

const ownershipColumnNames = new Set(['organizationId', 'userId', 'createdByUserId']);

function getOwnershipScopedSchemaTables() {
    return Object.entries(schema)
        .filter(([, table]) => {
            try {
                const columns = Object.keys(getTableColumns(table as any));
                return columns.some(column => ownershipColumnNames.has(column));
            } catch {
                return false;
            }
        })
        .map(([tableName]) => tableName)
        .sort();
}

test('anonymous ownership policies cover every ownership-scoped schema table exactly once', () => {
    const ownershipScopedTables = getOwnershipScopedSchemaTables();
    const policies = getAnonymousOwnershipTablePolicies();
    const policyTables = policies.map(policy => policy.table).sort();
    const duplicateTables = policyTables.filter((table, index) => table === policyTables[index - 1]);

    assert.deepEqual(duplicateTables, []);
    assert.deepEqual(policyTables, ownershipScopedTables);
});

test('anonymous ownership registry keeps audit and ai usage tables explicit no-migrate', () => {
    const policyByTable = new Map(getAnonymousOwnershipTablePolicies().map(policy => [policy.table, policy]));

    assert.equal(policyByTable.get('queryAudit')?.strategy, 'no-migrate');
    assert.equal(policyByTable.get('aiUsageEvents')?.strategy, 'no-migrate');
    assert.equal(policyByTable.get('aiUsageTraces')?.strategy, 'no-migrate');
});

test('anonymous ownership migrations only cover business resources', () => {
    const migrationTableSet = new Set(anonymousOwnershipMigrations.flatMap(migration => migration.tables));
    const noMigrateTableSet = new Set(anonymousOwnershipNoMigratePolicies.map(policy => policy.table));

    assert.deepEqual(
        [...migrationTableSet].sort(),
        ['aiSchemaCache', 'chatMessages', 'chatSessionState', 'chatSessions', 'connectionIdentities', 'connections', 'savedQueries', 'savedQueryFolders', 'syncOperations', 'tabs'],
    );
    assert.deepEqual(
        [...noMigrateTableSet].sort(),
        ['account', 'aiUsageEvents', 'aiUsageTraces', 'invitation', 'organizationMembers', 'queryAudit', 'session'],
    );
});

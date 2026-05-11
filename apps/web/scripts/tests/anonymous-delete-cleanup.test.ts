import assert from 'node:assert/strict';
import test from 'node:test';
import { anonymousDeleteCleanupTableCoverage, anonymousMergeCleanupTableCoverage } from '../../lib/auth/anonymous';
import { anonymousOwnershipNoMigratePolicies } from '@dory/database/postgres/impl/organization/anonymous-resource-merge';

const cleanupTables: Set<string> = new Set([
    ...anonymousDeleteCleanupTableCoverage.connectionIdentityScoped,
    ...anonymousDeleteCleanupTableCoverage.connectionScoped,
    ...anonymousDeleteCleanupTableCoverage.organizationScoped,
]);

test('anonymous delete cleanup covers all anonymous workspace business tables', () => {
    assert.deepEqual(
        [...cleanupTables].sort(),
        [
            'aiSchemaCache',
            'aiUsageEvents',
            'aiUsageTraces',
            'chatMessages',
            'chatSessionState',
            'chatSessions',
            'connectionIdentities',
            'connectionIdentitySecrets',
            'connectionSsh',
            'connections',
            'invitation',
            'organizationMembers',
            'organizations',
            'queryAudit',
            'savedQueries',
            'savedQueryFolders',
            'syncOperations',
            'tabs',
        ],
    );
});

test('anonymous delete cleanup includes no-migrate ownership tables that must be removed before deleting the user', () => {
    const deleteOnlyTables = new Set(
        anonymousOwnershipNoMigratePolicies
            .map(policy => policy.table)
            .filter(table => !['account', 'session'].includes(table)),
    );

    for (const table of deleteOnlyTables) {
        assert.equal(cleanupTables.has(table), true, `expected cleanup to include ${table}`);
    }
});

test('anonymous delete cleanup deletes organizations after dependent resources', () => {
    const organizationScopedTables = anonymousDeleteCleanupTableCoverage.organizationScoped;

    assert.equal(organizationScopedTables[organizationScopedTables.length - 1], 'organizations');
    assert.equal(organizationScopedTables.indexOf('connections') < organizationScopedTables.indexOf('organizations'), true);
    assert.equal(organizationScopedTables.indexOf('organizationMembers') < organizationScopedTables.indexOf('organizations'), true);
    assert.equal(organizationScopedTables.indexOf('invitation') < organizationScopedTables.indexOf('organizations'), true);
});

test('anonymous merge cleanup removes organization-scoped no-migrate tables before deleting the source organization', () => {
    assert.deepEqual([...anonymousMergeCleanupTableCoverage.organizationScoped].sort(), ['aiUsageEvents', 'aiUsageTraces', 'invitation', 'queryAudit']);
});

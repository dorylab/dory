import { chatAnonymousOwnershipMigration } from './chat';
import { connectionsAnonymousOwnershipMigration } from './connections';
import { savedQueriesAnonymousOwnershipMigration } from './saved-queries';
import type { AnonymousOwnershipMigration, AnonymousOwnershipTablePolicy } from './types';

export const anonymousOwnershipMigrations: AnonymousOwnershipMigration[] = [
    savedQueriesAnonymousOwnershipMigration,
    chatAnonymousOwnershipMigration,
    connectionsAnonymousOwnershipMigration,
];

export const anonymousOwnershipNoMigratePolicies: AnonymousOwnershipTablePolicy[] = [
    {
        table: 'account',
        strategy: 'no-migrate',
        reason: 'Auth account bindings are handled by better-auth and are not organization-scoped business resources.',
    },
    {
        table: 'invitation',
        strategy: 'no-migrate',
        reason: 'Anonymous workspaces do not transfer invitation rows during account linking.',
    },
    {
        table: 'session',
        strategy: 'no-migrate',
        reason: 'Session ownership is handled by auth flows outside the anonymous resource migration registry.',
    },
    {
        table: 'queryAudit',
        strategy: 'no-migrate',
        reason: 'Audit history remains immutable and is not rewritten during anonymous account upgrades.',
    },
    {
        table: 'organizationMembers',
        strategy: 'no-migrate',
        reason: 'Organization membership changes are handled by the surrounding auth linking workflow.',
    },
    {
        table: 'aiUsageEvents',
        strategy: 'no-migrate',
        reason: 'AI usage telemetry is not reassigned during anonymous account upgrades.',
    },
    {
        table: 'aiUsageTraces',
        strategy: 'no-migrate',
        reason: 'AI trace telemetry is not reassigned during anonymous account upgrades.',
    },
];

export function getAnonymousOwnershipTablePolicies(): AnonymousOwnershipTablePolicy[] {
    return [
        ...anonymousOwnershipMigrations.flatMap(migration =>
            migration.tables.map(table => ({
                table,
                strategy: 'migrate' as const,
                migrationId: migration.id,
            })),
        ),
        ...anonymousOwnershipNoMigratePolicies,
    ];
}

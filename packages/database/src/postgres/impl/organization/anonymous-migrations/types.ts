import type { PostgresDBClient } from '@dory/shared';

export type AnonymousOwnershipMigrationTx = Pick<PostgresDBClient, 'select' | 'update' | 'delete' | 'insert'>;

export type AnonymousOwnershipMigrationParams = {
    sourceOrganizationId: string;
    targetOrganizationId: string;
    anonymousUserId: string;
    newUserId: string;
};

export type AnonymousOwnershipMigrationResult = {
    id: string;
    tables: string[];
    counts: Record<string, number>;
    details?: Record<string, unknown>;
};

export type AnonymousOwnershipMigration = {
    id: string;
    tables: string[];
    migrate: (tx: AnonymousOwnershipMigrationTx, params: AnonymousOwnershipMigrationParams) => Promise<AnonymousOwnershipMigrationResult>;
};

export type AnonymousOwnershipTablePolicy = {
    table: string;
    strategy: 'migrate' | 'no-migrate';
    migrationId?: string;
    reason?: string;
};

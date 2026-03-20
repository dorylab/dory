import { getClient } from '@/lib/database/postgres/client';
import { syncOperations } from '@/lib/database/postgres/schemas';
import { DatabaseError } from '@/lib/errors/DatabaseError';
import type { PostgresDBClient } from '@/types';
import { translateDatabase } from '@/lib/database/i18n';

export type SyncOperationEnqueueInput = {
    organizationId: string;
    entityType: 'connection' | 'connection_identity';
    entityId: string;
    operation: 'create' | 'update' | 'delete';
    payload?: Record<string, unknown> | null;
};

export class PostgresSyncOperationsRepository {
    private db!: PostgresDBClient;

    async init() {
        try {
            this.db = (await getClient()) as PostgresDBClient;
            if (!this.db) {
                throw new DatabaseError(translateDatabase('Database.Errors.ConnectionFailed'), 500);
            }
        } catch (e) {
            console.error(translateDatabase('Database.Logs.InitFailed'), e);
            throw new DatabaseError(translateDatabase('Database.Errors.InitFailed'), 500);
        }
    }

    async enqueue(input: SyncOperationEnqueueInput) {
        const [row] = await this.db
            .insert(syncOperations)
            .values({
                organizationId: input.organizationId,
                entityType: input.entityType,
                entityId: input.entityId,
                operation: input.operation,
                payload: JSON.stringify(input.payload ?? {}),
                status: 'pending',
                retryCount: 0,
                errorMessage: null,
                lastAttemptAt: null,
                syncedAt: null,
            })
            .returning();

        return row ?? null;
    }
}

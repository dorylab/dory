import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { newEntityId } from '@/lib/id';

export type SyncEntityType = 'connection' | 'connection_identity';
export type SyncOperationType = 'create' | 'update' | 'delete';
export type SyncOperationStatus = 'pending' | 'processing' | 'synced' | 'failed' | 'conflict';

export const syncOperations = pgTable(
    'sync_operations',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),

        organizationId: text('organization_id').notNull(),
        entityType: text('entity_type').notNull().default('connection'),
        entityId: text('entity_id').notNull(),
        operation: text('operation').notNull(),

        payload: text('payload').notNull().default('{}'),

        status: text('status').notNull().default('pending'),
        retryCount: integer('retry_count').notNull().default(0),
        lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
        syncedAt: timestamp('synced_at', { withTimezone: true }),
        errorMessage: text('error_message'),

        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .$onUpdateFn(() => new Date()),
    },
    t => [
        index('idx_sync_operations_organization_status').on(t.organizationId, t.status),
        index('idx_sync_operations_entity').on(t.entityType, t.entityId),
        index('idx_sync_operations_created_at').on(t.createdAt),
    ],
);

export type SyncOperation = typeof syncOperations.$inferSelect;
export type NewSyncOperation = typeof syncOperations.$inferInsert;

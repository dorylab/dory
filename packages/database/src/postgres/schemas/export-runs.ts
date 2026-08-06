import { bigint, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { newEntityId } from '@dory/shared/id';

export const exportRuns = pgTable(
    'export_runs',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        organizationId: text('organization_id').notNull(),
        createdByUserId: text('created_by_user_id').notNull(),
        connectionId: text('connection_id').notNull(),
        databaseName: text('database_name').notNull(),
        tableName: text('table_name').notNull(),
        status: text('status').notNull().default('queued'),
        phase: text('phase').notNull().default('queued'),
        plan: jsonb('plan').notNull(),
        planHash: text('plan_hash').notNull(),
        progress: jsonb('progress'),
        processedRows: bigint('processed_rows', { mode: 'number' }).notNull().default(0),
        batchCount: integer('batch_count').notNull().default(0),
        byteSize: bigint('byte_size', { mode: 'number' }),
        objectPath: text('object_path'),
        manifestPath: text('manifest_path'),
        fileName: text('file_name'),
        contentType: text('content_type'),
        consistency: text('consistency'),
        errorCode: text('error_code'),
        errorMessage: text('error_message'),
        heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
        cancelRequested: boolean('cancel_requested').notNull().default(false),
        artifactExpiresAt: timestamp('artifact_expires_at', { withTimezone: true }),
        startedAt: timestamp('started_at', { withTimezone: true }),
        completedAt: timestamp('completed_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdateFn(() => new Date()),
    },
    table => [
        index('idx_export_runs_table_created').on(table.organizationId, table.connectionId, table.databaseName, table.tableName, table.createdAt),
        index('idx_export_runs_status_heartbeat').on(table.status, table.heartbeatAt),
        index('idx_export_runs_artifact_expires').on(table.artifactExpiresAt),
    ],
);

export const exportRunEvents = pgTable(
    'export_run_events',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        runId: text('run_id').notNull(),
        organizationId: text('organization_id').notNull(),
        sequence: integer('sequence').notNull(),
        type: text('type').notNull(),
        payload: jsonb('payload').notNull().default({}),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [
        uniqueIndex('uidx_export_run_events_sequence').on(table.runId, table.sequence),
        index('idx_export_run_events_org_run').on(table.organizationId, table.runId, table.sequence),
    ],
);

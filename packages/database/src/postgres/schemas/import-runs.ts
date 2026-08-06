import { bigint, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

import { newEntityId } from '@dory/shared/id';

export const importRuns = pgTable(
    'import_runs',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        organizationId: text('organization_id').notNull(),
        createdByUserId: text('created_by_user_id').notNull(),
        connectionId: text('connection_id'),
        status: text('status').notNull().default('draft'),
        phase: text('phase').notNull().default('draft'),
        sourceName: text('source_name'),
        sourceExtension: text('source_extension'),
        sourceHash: text('source_hash'),
        sourceBytes: bigint('source_bytes', { mode: 'number' }),
        sourceObjectPath: text('source_object_path'),
        artifactPrefix: text('artifact_prefix'),
        sourceArrowPath: text('source_arrow_path'),
        preparedArrowPath: text('prepared_arrow_path'),
        parsingOptions: jsonb('parsing_options'),
        profile: jsonb('profile'),
        plan: jsonb('plan'),
        progress: jsonb('progress'),
        processedRows: bigint('processed_rows', { mode: 'number' }).notNull().default(0),
        filteredRows: bigint('filtered_rows', { mode: 'number' }).notNull().default(0),
        pendingRows: bigint('pending_rows', { mode: 'number' }).notNull().default(0),
        insertedRows: bigint('inserted_rows', { mode: 'number' }).notNull().default(0),
        batchCount: integer('batch_count').notNull().default(0),
        errorCode: text('error_code'),
        errorMessage: text('error_message'),
        heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
        cancelRequested: boolean('cancel_requested').notNull().default(false),
        artifactsExpireAt: timestamp('artifacts_expire_at', { withTimezone: true }),
        startedAt: timestamp('started_at', { withTimezone: true }),
        completedAt: timestamp('completed_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow()
            .$onUpdateFn(() => new Date()),
    },
    table => [
        index('idx_import_runs_org_created').on(table.organizationId, table.createdAt),
        index('idx_import_runs_status_heartbeat').on(table.status, table.heartbeatAt),
        index('idx_import_runs_artifacts_expire').on(table.artifactsExpireAt),
    ],
);

export const importRunEvents = pgTable(
    'import_run_events',
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
        uniqueIndex('uidx_import_run_events_sequence').on(table.runId, table.sequence),
        index('idx_import_run_events_org_run').on(table.organizationId, table.runId, table.sequence),
    ],
);

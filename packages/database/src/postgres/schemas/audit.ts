import { pgTable, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { newEntityId } from '@dory/shared/id';
import type { QuerySource, QueryStatus } from '@dory/shared/types/audit';

export const queryAudit = pgTable(
    'query_audit',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        organizationId: text('organization_id').notNull(),
        tabId: text('tab_id'),
        userId: text('user_id').notNull(),
        source: text('source').$type<QuerySource>().notNull(),
        connectionId: text('connection_id'),
        connectionName: text('connection_name'),
        identityId: text('identity_id'),
        identityName: text('identity_name'),
        identityUsername: text('identity_username'),
        identityRole: text('identity_role'),
        identityDatabase: text('identity_database'),
        databaseName: text('database_name'),
        queryId: text('query_id'),
        sqlText: text('sql_text').notNull(),

        status: text('status').$type<QueryStatus>().notNull(),
        errorMessage: text('error_message'),

        durationMs: integer('duration_ms'),
        rowsRead: integer('rows_read'),
        bytesRead: integer('bytes_read'),
        rowsWritten: integer('rows_written'),

        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        extraJson: jsonb('extra_json').$type<Record<string, unknown> | null>(),
    },
    t => [index('idx_organization_created').on(t.organizationId, t.createdAt), index('idx_source_created').on(t.source, t.createdAt), index('idx_query_id').on(t.queryId)],
);

export const actionAudit = pgTable(
    'action_audit',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        actionRunId: text('action_run_id').notNull(),
        requestId: text('request_id'),
        actionId: text('action_id').notNull(),
        actionVersion: integer('action_version').notNull(),
        status: text('status').notNull(),
        risk: text('risk').notNull(),
        effects: jsonb('effects').$type<string[] | null>(),
        organizationId: text('organization_id').notNull(),
        userId: text('user_id').notNull(),
        actorType: text('actor_type').notNull(),
        actorId: text('actor_id'),
        projection: text('projection').notNull(),
        source: text('source'),
        resource: jsonb('resource').$type<Record<string, unknown> | null>(),
        inputHash: text('input_hash'),
        redactedInputSummary: jsonb('redacted_input_summary').$type<Record<string, unknown> | null>(),
        redactedOutputSummary: jsonb('redacted_output_summary').$type<Record<string, unknown> | null>(),
        errorCode: text('error_code'),
        errorMessage: text('error_message'),
        durationMs: integer('duration_ms').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    t => [
        index('idx_action_audit_org_created').on(t.organizationId, t.createdAt),
        index('idx_action_audit_run').on(t.actionRunId),
        index('idx_action_audit_action_created').on(t.actionId, t.createdAt),
        index('idx_action_audit_actor_created').on(t.actorType, t.createdAt),
    ],
);

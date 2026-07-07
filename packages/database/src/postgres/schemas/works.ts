import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { newEntityId } from '@dory/shared/id';
import type { ResultSetArtifactRef } from '@dory/resultset';

export type WorkStatus = 'active' | 'completed' | 'error' | 'archived';
export type WorkEventStatus = 'success' | 'error';

export const works = pgTable(
    'works',
    {
        workId: text('work_id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        organizationId: text('organization_id').notNull(),
        userId: text('user_id').notNull(),
        tokenId: text('token_id'),
        connectionId: text('connection_id'),
        externalSessionId: text('external_session_id'),
        title: text('title').notNull().default('Agent Run'),
        status: text('status').$type<WorkStatus>().notNull().default('active'),
        metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        lastActiveAt: timestamp('last_active_at', { withTimezone: true }).notNull().defaultNow(),
        archivedAt: timestamp('archived_at', { withTimezone: true }),
    },
    t => [
        index('idx_works_org_user_active').on(t.organizationId, t.userId, t.lastActiveAt),
        index('idx_works_external_session').on(t.organizationId, t.userId, t.tokenId, t.connectionId, t.externalSessionId),
        index('idx_works_connection_active').on(t.organizationId, t.connectionId, t.lastActiveAt),
    ],
);

export const workEvents = pgTable(
    'work_events',
    {
        eventId: text('event_id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        workId: text('work_id').notNull(),
        organizationId: text('organization_id').notNull(),
        userId: text('user_id').notNull(),
        tokenId: text('token_id'),
        connectionId: text('connection_id'),
        toolName: text('tool_name').notNull(),
        actionId: text('action_id'),
        status: text('status').$type<WorkEventStatus>().notNull(),
        inputSummary: jsonb('input_summary').$type<Record<string, unknown> | null>(),
        outputSummary: jsonb('output_summary').$type<Record<string, unknown> | null>(),
        errorCode: text('error_code'),
        errorMessage: text('error_message'),
        durationMs: integer('duration_ms').notNull().default(0),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    t => [index('idx_work_events_work_created').on(t.workId, t.createdAt), index('idx_work_events_org_created').on(t.organizationId, t.createdAt)],
);

export const workQuerySessions = pgTable(
    'work_query_sessions',
    {
        workId: text('work_id').notNull(),
        sessionId: text('session_id').notNull(),
        userId: text('user_id').notNull(),
        tabId: text('tab_id').notNull(),
        connectionId: text('connection_id'),
        database: text('database'),
        sqlText: text('sql_text').notNull(),
        status: text('status').notNull().default('success'),
        errorMessage: text('error_message'),
        startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
        finishedAt: timestamp('finished_at', { withTimezone: true }),
        durationMs: integer('elapsed_ms'),
        resultSetCount: integer('result_set_count').notNull().default(0),
        stopOnError: boolean('stop_on_error').notNull().default(false),
        source: text('source'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    t => [
        primaryKey({ name: 'pk_work_query_sessions', columns: [t.workId, t.sessionId] }),
        index('idx_work_query_sessions_work').on(t.workId, t.startedAt),
        index('idx_work_query_sessions_tab').on(t.tabId),
    ],
);

export const workQueryResultSets = pgTable(
    'work_query_result_sets',
    {
        workId: text('work_id').notNull(),
        sessionId: text('session_id').notNull(),
        setIndex: integer('set_index').notNull(),
        sqlText: text('sql_text').notNull(),
        sqlOp: text('sql_op'),
        title: text('title'),
        columns: jsonb('columns'),
        stats: jsonb('stats'),
        viewState: jsonb('view_state'),
        aiProfileVersion: integer('ai_profile_version').notNull().default(1),
        rowCount: integer('row_count'),
        limited: boolean('limited').notNull().default(false),
        limit: integer('limit'),
        affectedRows: integer('affected_rows'),
        status: text('status').notNull().default('success'),
        errorMessage: text('error_message'),
        errorCode: text('error_code'),
        errorSqlState: text('error_sql_state'),
        errorMeta: jsonb('error_meta'),
        warnings: jsonb('warnings'),
        startedAt: timestamp('started_at', { withTimezone: true }),
        finishedAt: timestamp('finished_at', { withTimezone: true }),
        durationMs: integer('duration_ms'),
        resultSetId: text('result_set_id'),
        artifactRefJson: jsonb('artifact_ref_json').$type<ResultSetArtifactRef | null>(),
    },
    t => [primaryKey({ name: 'pk_work_query_result_sets', columns: [t.workId, t.sessionId, t.setIndex] }), index('idx_work_qrs_session').on(t.workId, t.sessionId, t.setIndex)],
);

export const workChartStates = pgTable(
    'work_chart_states',
    {
        workId: text('work_id').notNull(),
        sessionId: text('session_id').notNull(),
        setIndex: integer('set_index').notNull(),
        stateKey: text('state_key').notNull(),
        chartState: jsonb('chart_state').$type<Record<string, unknown>>().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    t => [primaryKey({ name: 'pk_work_chart_states', columns: [t.workId, t.sessionId, t.setIndex, t.stateKey] }), index('idx_work_chart_states_work').on(t.workId)],
);

export type Work = typeof works.$inferSelect;
export type NewWork = typeof works.$inferInsert;
export type WorkEvent = typeof workEvents.$inferSelect;

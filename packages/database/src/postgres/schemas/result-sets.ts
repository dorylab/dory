import { boolean, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { newEntityId } from '@dory/shared/id';
import type { ResultSetArtifactRef, ResultSetColumn, ResultSetDataAvailability, ResultSetSourceType } from '@dory/resultset';

export type QueryRunActorType = 'user' | 'agent' | 'mcp' | 'automation' | (string & {});
export type QueryRunStatus = 'running' | 'success' | 'error' | 'canceled' | (string & {});
export type ResultSetKind = 'sql-result-set';
export type ResultSetStatus = 'success' | 'error' | 'canceled' | (string & {});
export type AgentRunResultSetRole = 'generated' | 'referenced' | 'derived' | (string & {});

export const queryRuns = pgTable(
    'query_runs',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => `qr_${newEntityId()}`),
        organizationId: text('organization_id').notNull(),
        connectionId: text('connection_id'),
        workspaceId: text('workspace_id'),
        tabId: text('tab_id'),
        workId: text('work_id'),
        agentRunId: text('agent_run_id'),
        sessionId: text('session_id'),
        setIndex: integer('set_index'),
        actorType: text('actor_type').$type<QueryRunActorType>().notNull(),
        actorId: text('actor_id'),
        sql: text('sql').notNull(),
        status: text('status').$type<QueryRunStatus>().notNull().default('running'),
        durationMs: integer('duration_ms'),
        errorMessage: text('error_message'),
        resultSetId: text('result_set_id'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    t => [
        index('idx_query_runs_org_created').on(t.organizationId, t.createdAt),
        index('idx_query_runs_connection_created').on(t.organizationId, t.connectionId, t.createdAt),
        index('idx_query_runs_tab_created').on(t.tabId, t.createdAt),
        index('idx_query_runs_work_created').on(t.workId, t.createdAt),
        index('idx_query_runs_agent_created').on(t.agentRunId, t.createdAt),
        index('idx_query_runs_session_set').on(t.organizationId, t.sessionId, t.setIndex),
        index('idx_query_runs_result_set').on(t.resultSetId),
    ],
);

export const resultSets = pgTable(
    'result_sets',
    {
        id: text('id').primaryKey(),
        organizationId: text('organization_id').notNull(),
        connectionId: text('connection_id'),
        workspaceId: text('workspace_id'),
        tabId: text('tab_id'),
        workId: text('work_id'),
        agentRunId: text('agent_run_id'),
        sessionId: text('session_id'),
        setIndex: integer('set_index'),
        sourceQueryRunId: text('source_query_run_id'),
        sourceType: text('source_type').$type<ResultSetSourceType>().notNull(),
        kind: text('kind').$type<ResultSetKind>().notNull(),
        status: text('status').$type<ResultSetStatus>().notNull(),
        rowCount: integer('row_count'),
        previewRowCount: integer('preview_row_count').notNull().default(0),
        limited: boolean('limited').notNull().default(false),
        limit: integer('limit'),
        schemaJson: jsonb('schema_json').$type<ResultSetColumn[]>().notNull().default([]),
        viewState: jsonb('view_state'),
        sql: text('sql'),
        operation: text('operation'),
        errorMessage: text('error_message'),
        artifactRefJson: jsonb('artifact_ref_json').$type<ResultSetArtifactRef>().notNull(),
        dataAvailability: text('data_availability').$type<ResultSetDataAvailability>().notNull().default('none'),
        parentResultSetId: text('parent_result_set_id'),
        previousResultSetId: text('previous_result_set_id'),
        refreshOfResultSetId: text('refresh_of_result_set_id'),
        derivedFromResultSetId: text('derived_from_result_set_id'),
        createdByActorType: text('created_by_actor_type').$type<QueryRunActorType>().notNull(),
        createdByActorId: text('created_by_actor_id'),
        contentHash: text('content_hash'),
        byteSize: integer('byte_size'),
        expiresAt: timestamp('expires_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    t => [
        index('idx_result_sets_org_created').on(t.organizationId, t.createdAt),
        index('idx_result_sets_connection_created').on(t.organizationId, t.connectionId, t.createdAt),
        index('idx_result_sets_tab_created').on(t.tabId, t.createdAt),
        index('idx_result_sets_work_created').on(t.workId, t.createdAt),
        index('idx_result_sets_agent_created').on(t.agentRunId, t.createdAt),
        index('idx_result_sets_session_set').on(t.organizationId, t.sessionId, t.setIndex),
        index('idx_result_sets_source_query_run').on(t.sourceQueryRunId),
        index('idx_result_sets_expires_at').on(t.expiresAt),
    ],
);

export const agentRunResultSets = pgTable(
    'agent_run_result_sets',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        agentRunId: text('agent_run_id').notNull(),
        resultSetId: text('result_set_id').notNull(),
        queryRunId: text('query_run_id'),
        role: text('role').$type<AgentRunResultSetRole>().notNull().default('generated'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    t => [
        index('idx_agent_run_result_sets_run').on(t.agentRunId, t.createdAt),
        index('idx_agent_run_result_sets_result_set').on(t.resultSetId),
        index('idx_agent_run_result_sets_query_run').on(t.queryRunId),
    ],
);

export type QueryRun = typeof queryRuns.$inferSelect;
export type ResultSet = typeof resultSets.$inferSelect;
export type AgentRunResultSet = typeof agentRunResultSets.$inferSelect;

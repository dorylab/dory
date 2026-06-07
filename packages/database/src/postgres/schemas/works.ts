import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { newEntityId } from '@dory/shared/id';

export type WorkStatus = 'draft' | 'running' | 'completed';
export type WorkCreator = 'user' | 'agent';
export type WorkRunStatus = 'running' | 'completed' | 'failed';
export type WorkRunEventType =
    | 'message'
    | 'tool_call'
    | 'tool_result'
    | 'sql_executed'
    | 'investigation_created'
    | 'investigation_updated'
    | 'conclusion_updated'
    | 'error'
    | 'completed';
export type WorkRunEventRole = 'user' | 'agent' | 'tool' | 'system';

export const works = pgTable(
    'works',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        organizationId: text('organization_id').notNull(),
        title: text('title').notNull().default('Untitled Work'),
        status: text('status').$type<WorkStatus>().notNull().default('draft'),
        goal: text('goal').notNull(),
        conclusion: text('conclusion'),
        connectionId: text('connection_id').notNull(),
        createdBy: text('created_by').$type<WorkCreator>().notNull(),
        createdByUserId: text('created_by_user_id').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    t => [
        index('idx_works_organization_updated_at').on(t.organizationId, t.updatedAt),
        index('idx_works_connection_id').on(t.connectionId),
        index('idx_works_created_by_user_id').on(t.createdByUserId),
    ],
);

export const workInvestigations = pgTable(
    'work_investigations',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        workId: text('work_id').notNull(),
        organizationId: text('organization_id').notNull(),
        connectionId: text('connection_id').notNull(),
        title: text('title').notNull(),
        summary: text('summary'),
        status: text('status').$type<WorkStatus>().notNull().default('draft'),
        linkedTabId: text('linked_tab_id'),
        lastQueryAt: timestamp('last_query_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    t => [
        index('idx_work_investigations_work_id').on(t.workId),
        index('idx_work_investigations_organization_work').on(t.organizationId, t.workId),
        index('idx_work_investigations_connection_id').on(t.connectionId),
    ],
);

export const workRuns = pgTable(
    'work_runs',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        workId: text('work_id').notNull(),
        organizationId: text('organization_id').notNull(),
        connectionId: text('connection_id').notNull(),
        status: text('status').$type<WorkRunStatus>().notNull().default('running'),
        previousWorkStatus: text('previous_work_status').$type<WorkStatus>().notNull(),
        createdByUserId: text('created_by_user_id').notNull(),
        startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
        completedAt: timestamp('completed_at', { withTimezone: true }),
        error: text('error'),
    },
    t => [
        index('idx_work_runs_work_started_at').on(t.workId, t.startedAt),
        index('idx_work_runs_organization_work').on(t.organizationId, t.workId),
        index('idx_work_runs_status').on(t.status),
        uniqueIndex('uidx_work_runs_one_running_per_work')
            .on(t.workId)
            .where(sql`${t.status} = 'running'`),
    ],
);

export const workRunEvents = pgTable(
    'work_run_events',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        runId: text('run_id').notNull(),
        workId: text('work_id').notNull(),
        organizationId: text('organization_id').notNull(),
        type: text('type').$type<WorkRunEventType>().notNull(),
        role: text('role').$type<WorkRunEventRole>().notNull(),
        content: text('content'),
        payload: jsonb('payload').$type<Record<string, unknown> | null>(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    t => [
        index('idx_work_run_events_run_created_at').on(t.runId, t.createdAt),
        index('idx_work_run_events_work_created_at').on(t.workId, t.createdAt),
        index('idx_work_run_events_organization_work').on(t.organizationId, t.workId),
        index('idx_work_run_events_type').on(t.type),
    ],
);

export type Work = typeof works.$inferSelect;
export type NewWork = typeof works.$inferInsert;
export type WorkInvestigation = typeof workInvestigations.$inferSelect;
export type NewWorkInvestigation = typeof workInvestigations.$inferInsert;
export type WorkRun = typeof workRuns.$inferSelect;
export type NewWorkRun = typeof workRuns.$inferInsert;
export type WorkRunEvent = typeof workRunEvents.$inferSelect;
export type NewWorkRunEvent = typeof workRunEvents.$inferInsert;

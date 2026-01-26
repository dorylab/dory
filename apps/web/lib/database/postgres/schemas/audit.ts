import { pgTable, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { newEntityId } from '@/lib/id';
import { connections } from './connections';

export const queryAudit = pgTable(
    'query_audit',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        teamId: text('team_id').notNull(),
        tabId: text('tab_id'),
        userId: text('user_id').notNull(),
        source: text('source').$type<'console' | 'chatbot' | 'api' | 'task'>().notNull(),
        connectionId: text('connection_id').references(() => connections.id),
        connectionName: text('connection_name'),
        databaseName: text('database_name'),
        queryId: text('query_id'),
        sqlText: text('sql_text').notNull(),

        status: text('status').$type<'success' | 'error' | 'denied' | 'canceled'>().notNull(),
        errorMessage: text('error_message'),

        durationMs: integer('duration_ms'),
        rowsRead: integer('rows_read'),
        bytesRead: integer('bytes_read'),
        rowsWritten: integer('rows_written'),

        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        extraJson: jsonb('extra_json').$type<Record<string, unknown> | null>(),
    },
    t => [index('idx_team_created').on(t.teamId, t.createdAt), index('idx_source_created').on(t.source, t.createdAt), index('idx_query_id').on(t.queryId)],
);

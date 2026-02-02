import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { newEntityId } from '@/lib/id';

export const savedQueries = pgTable(
    'saved_queries',
    {
        id: text('id').primaryKey().$defaultFn(() => newEntityId()),

        teamId: text('team_id').notNull(),
        userId: text('user_id').notNull(),

        title: text('title').notNull(),
        description: text('description'),

        sqlText: text('sql_text').notNull(),

        
        connectionId: text('connection_id').notNull(),
        
        context: jsonb('context').notNull().default(sql`'{}'::jsonb`),

        // text[]
        tags: text('tags')
            .array()
            .notNull()
            .default(sql`'{}'::text[]`),

        workId: uuid('work_id'),

        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

        archivedAt: timestamp('archived_at', { withTimezone: true }),
    },
    (t) => ([
        index('idx_saved_queries_team_user').on(t.teamId, t.userId),
        index('idx_saved_queries_updated_at').on(t.updatedAt),
    ]),
);

export type SavedQuery = typeof savedQueries.$inferSelect;
export type NewSavedQuery = typeof savedQueries.$inferInsert;

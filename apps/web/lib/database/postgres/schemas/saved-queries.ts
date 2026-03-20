import { pgTable, uuid, text, jsonb, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { newEntityId } from '@/lib/id';

export const savedQueries = pgTable(
    'saved_queries',
    {
        id: text('id').primaryKey().$defaultFn(() => newEntityId()),

        organizationId: text('organization_id').notNull(),
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

        folderId: text('folder_id'),
        position: integer('position').notNull().default(0),

        workId: uuid('work_id'),

        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

        archivedAt: timestamp('archived_at', { withTimezone: true }),
    },
    (t) => ([
        index('idx_saved_queries_organization_user').on(t.organizationId, t.userId),
        index('idx_saved_queries_updated_at').on(t.updatedAt),
        index('idx_saved_queries_folder_id').on(t.folderId),
    ]),
);

export type SavedQuery = typeof savedQueries.$inferSelect;
export type NewSavedQuery = typeof savedQueries.$inferInsert;

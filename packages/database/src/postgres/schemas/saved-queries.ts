import type { NamingSource } from '@dory/shared/utils/sql-name';
import { newEntityId } from '@dory/shared/id';
import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const savedQueries = pgTable(
    'saved_queries',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        organizationId: text('organization_id').notNull(),
        connectionId: text('connection_id').notNull(),
        title: text('title').notNull(),
        description: text('description'),
        sqlText: text('sql_text').notNull(),
        namingSource: text('naming_source').$type<NamingSource>().notNull().default('manual'),
        namingRequestId: text('naming_request_id'),
        revision: integer('revision').notNull().default(1),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    t => [index('idx_saved_queries_org_connection').on(t.organizationId, t.connectionId), index('idx_saved_queries_updated_at').on(t.updatedAt)],
);

export const savedQueryCollections = pgTable(
    'saved_query_collections',
    {
        queryId: text('query_id')
            .notNull()
            .references(() => savedQueries.id, { onDelete: 'cascade' }),
        userId: text('user_id').notNull(),
        folderId: text('folder_id'),
        position: integer('position').notNull().default(0),
        context: jsonb('context')
            .notNull()
            .default(sql`'{}'::jsonb`),
        tags: text('tags')
            .array()
            .notNull()
            .default(sql`'{}'::text[]`),
        workId: uuid('work_id'),
        archivedAt: timestamp('archived_at', { withTimezone: true }),
    },
    t => [primaryKey({ columns: [t.queryId, t.userId] }), index('idx_query_collections_user_folder').on(t.userId, t.folderId, t.position)],
);

export type SavedQuery = typeof savedQueries.$inferSelect & Omit<typeof savedQueryCollections.$inferSelect, 'queryId'>;
export type NewSavedQuery = typeof savedQueries.$inferInsert & Omit<typeof savedQueryCollections.$inferInsert, 'queryId'>;

export const querySaveRequests = pgTable(
    'query_save_requests',
    {
        organizationId: text('organization_id').notNull(),
        userId: text('user_id').notNull(),
        requestId: text('request_id').notNull(),
        fingerprint: text('fingerprint').notNull(),
        knowledgeModelId: text('knowledge_model_id'),
        queryId: text('query_id'),
    },
    t => [primaryKey({ columns: [t.organizationId, t.userId, t.requestId] })],
);

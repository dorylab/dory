import { pgTable, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { newEntityId } from '@/lib/id';

export const savedQueryFolders = pgTable(
    'saved_query_folders',
    {
        id: text('id').primaryKey().$defaultFn(() => newEntityId()),
        organizationId: text('organization_id').notNull(),
        userId: text('user_id').notNull(),
        name: text('name').notNull(),
        position: integer('position').notNull().default(0),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => ([
        index('idx_saved_query_folders_organization_user').on(t.organizationId, t.userId),
    ]),
);

export type SavedQueryFolder = typeof savedQueryFolders.$inferSelect;
export type NewSavedQueryFolder = typeof savedQueryFolders.$inferInsert;

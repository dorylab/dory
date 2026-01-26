import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';
import { newEntityId } from '@/lib/id';
import { connections } from './connections';
import { TabPayload, TabResultMetaPayload } from '@/types/tabs';

export const tabs = pgTable('tabs', {
    tabId: text('tab_id')
        .primaryKey()
        .$defaultFn(() => newEntityId()),
    tabType: text('tab_type').notNull().default('sql'),
    tabName: text('tab_name').notNull().default('New Query'),
    userId: text('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    connectionId: text('connection_id')
        .notNull()
        .references(() => connections.id, { onDelete: 'cascade' }),

    // SQL tabs leave empty; Table tabs fill this
    databaseName: text('database_name'),
    tableName: text('table_name'),
    activeSubTab: text('active_sub_tab').notNull().default('data'),

    content: text('content').notNull().default(''),

    state: text('state').$type<TabPayload>(),
    resultMeta: text('result_meta').$type<TabResultMetaPayload | null>(),

    // Explicit order field to avoid reserved words: orderIndex
    orderIndex: integer('order_index').notNull().default(0),

    // Optional: createdAt for future ordering by creation time
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),

    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

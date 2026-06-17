import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { newEntityId } from '@dory/shared/id';
import { TabPayload, TabResultMetaPayload } from '@dory/shared/types/tabs';

export const tabs = pgTable('tabs', {
    tabId: text('tab_id')
        .primaryKey()
        .$defaultFn(() => newEntityId()),
    tabType: text('tab_type').notNull().default('sql'),
    tabName: text('tab_name').notNull().default('New Query'),
    userId: text('user_id').notNull(),
    connectionId: text('connection_id').notNull(),
    workId: text('work_id'),

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

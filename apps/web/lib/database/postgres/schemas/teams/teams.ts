// db/schema/teams.ts
import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { newEntityId } from '@/lib/id';

export const teams = pgTable(
    'teams',
    {
        id: text('id').primaryKey().$defaultFn(() => newEntityId()), // uuid
        name: text('name').notNull(), // e.g. "Personal space" / "cat's workspace"

        // Owner
        ownerUserId: text('owner_user_id').notNull(),

        // URL /team/:slug
        slug: text('slug'),

        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [
        // Ensure slug is globally unique
        uniqueIndex('teams_slug_unique').on(table.slug)
    ],
);

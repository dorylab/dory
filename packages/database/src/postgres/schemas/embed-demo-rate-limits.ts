import { index, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

export const embedDemoRateLimits = pgTable(
    'embed_demo_rate_limits',
    {
        dayKey: text('day_key').notNull(),
        ipHash: text('ip_hash').notNull(),
        sessions: integer('sessions').notNull().default(0),
        prompts: integer('prompts').notNull().default(0),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [primaryKey({ columns: [table.dayKey, table.ipHash] }), index('idx_embed_demo_rate_limits_updated').on(table.updatedAt)],
);

export type EmbedDemoRateLimit = typeof embedDemoRateLimits.$inferSelect;

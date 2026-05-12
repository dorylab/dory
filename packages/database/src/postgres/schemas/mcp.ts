import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { newEntityId } from '@dory/shared/id';

export const mcpAccessTokens = pgTable(
    'mcp_access_tokens',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        organizationId: text('organization_id').notNull(),
        name: text('name').notNull(),
        tokenPrefix: text('token_prefix').notNull(),
        tokenHash: text('token_hash').notNull(),
        scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
        enabled: boolean('enabled').notNull().default(true),
        createdByUserId: text('created_by_user_id').notNull(),
        lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
        revokedAt: timestamp('revoked_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .$onUpdateFn(() => new Date()),
    },
    t => [
        uniqueIndex('uidx_mcp_access_tokens_hash').on(t.tokenHash),
        index('idx_mcp_access_tokens_organization_created').on(t.organizationId, t.createdAt),
        index('idx_mcp_access_tokens_organization_user_created').on(t.organizationId, t.createdByUserId, t.createdAt),
        index('idx_mcp_access_tokens_organization_active')
            .on(t.organizationId, t.enabled, t.revokedAt)
            .where(sql`${t.revokedAt} IS NULL`),
    ],
);

export type McpAccessToken = typeof mcpAccessTokens.$inferSelect;
export type NewMcpAccessToken = typeof mcpAccessTokens.$inferInsert;

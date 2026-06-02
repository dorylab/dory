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

export const mcpAuthorizationRequests = pgTable(
    'mcp_authorization_requests',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newEntityId()),
        clientName: text('client_name').notNull(),
        verifierHash: text('verifier_hash').notNull(),
        scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
        status: text('status').notNull().default('pending'),
        organizationId: text('organization_id'),
        userId: text('user_id'),
        mcpTokenId: text('mcp_token_id'),
        approvedAt: timestamp('approved_at', { withTimezone: true }),
        deniedAt: timestamp('denied_at', { withTimezone: true }),
        consumedAt: timestamp('consumed_at', { withTimezone: true }),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .$onUpdateFn(() => new Date()),
    },
    t => [
        index('idx_mcp_authorization_requests_status_expires').on(t.status, t.expiresAt),
        index('idx_mcp_authorization_requests_org_user_created').on(t.organizationId, t.userId, t.createdAt),
        index('idx_mcp_authorization_requests_token').on(t.mcpTokenId),
    ],
);

export type McpAccessToken = typeof mcpAccessTokens.$inferSelect;
export type NewMcpAccessToken = typeof mcpAccessTokens.$inferInsert;
export type McpAuthorizationRequest = typeof mcpAuthorizationRequests.$inferSelect;
export type NewMcpAuthorizationRequest = typeof mcpAuthorizationRequests.$inferInsert;

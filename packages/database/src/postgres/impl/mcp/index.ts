import { and, eq, isNull } from 'drizzle-orm';

import { getClient } from '@dory/database/postgres/client';
import { mcpAccessTokens, organizations } from '@dory/database/schema';
import { translateDatabase } from '@dory/database/i18n';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { PostgresDBClient } from '@dory/shared';

export type McpAccessTokenRecord = typeof mcpAccessTokens.$inferSelect;

export type McpAccessTokenCreateInput = {
    organizationId: string;
    name: string;
    tokenPrefix: string;
    tokenHash: string;
    scopes: string[];
    createdByUserId: string;
};

type OrganizationMetadata = {
    mcp?: {
        enabled?: boolean;
    };
    [key: string]: unknown;
};

function parseOrganizationMetadata(raw?: string | null): OrganizationMetadata {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as OrganizationMetadata) : {};
    } catch {
        return {};
    }
}

function serializeOrganizationMetadata(metadata: OrganizationMetadata) {
    return JSON.stringify(metadata);
}

export class PostgresMcpRepository {
    private db!: PostgresDBClient;

    async init() {
        try {
            this.db = (await getClient()) as PostgresDBClient;
            if (!this.db) {
                throw new DatabaseError(translateDatabase('Database.Errors.ConnectionFailed'), 500);
            }
        } catch (e) {
            console.error(translateDatabase('Database.Logs.InitFailed'), e);
            throw new DatabaseError(translateDatabase('Database.Errors.InitFailed'), 500);
        }
    }

    async isOrganizationEnabled(organizationId: string): Promise<boolean> {
        const rows = await this.db.select({ metadata: organizations.metadata }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);

        return parseOrganizationMetadata(rows[0]?.metadata).mcp?.enabled === true;
    }

    async setOrganizationEnabled(organizationId: string, enabled: boolean): Promise<boolean> {
        const rows = await this.db.select({ metadata: organizations.metadata }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);

        const metadata = parseOrganizationMetadata(rows[0]?.metadata);
        metadata.mcp = {
            ...(metadata.mcp ?? {}),
            enabled,
        };

        await this.db
            .update(organizations)
            .set({
                metadata: serializeOrganizationMetadata(metadata),
                updatedAt: new Date(),
            })
            .where(eq(organizations.id, organizationId));

        return enabled;
    }

    async listTokens(organizationId: string): Promise<McpAccessTokenRecord[]> {
        return this.db.select().from(mcpAccessTokens).where(eq(mcpAccessTokens.organizationId, organizationId)).orderBy(mcpAccessTokens.createdAt);
    }

    async listTokensForUser(organizationId: string, userId: string): Promise<McpAccessTokenRecord[]> {
        return this.db
            .select()
            .from(mcpAccessTokens)
            .where(and(eq(mcpAccessTokens.organizationId, organizationId), eq(mcpAccessTokens.createdByUserId, userId)))
            .orderBy(mcpAccessTokens.createdAt);
    }

    async createToken(input: McpAccessTokenCreateInput): Promise<McpAccessTokenRecord> {
        const [created] = await this.db
            .insert(mcpAccessTokens)
            .values({
                organizationId: input.organizationId,
                name: input.name,
                tokenPrefix: input.tokenPrefix,
                tokenHash: input.tokenHash,
                scopes: input.scopes,
                enabled: true,
                createdByUserId: input.createdByUserId,
            })
            .returning();

        if (!created) {
            throw new DatabaseError('Failed to create MCP access token', 500);
        }

        return created;
    }

    async getActiveTokenByHash(tokenHash: string): Promise<McpAccessTokenRecord | null> {
        const rows = await this.db
            .select()
            .from(mcpAccessTokens)
            .where(and(eq(mcpAccessTokens.tokenHash, tokenHash), eq(mcpAccessTokens.enabled, true), isNull(mcpAccessTokens.revokedAt)))
            .limit(1);

        return rows[0] ?? null;
    }

    async markTokenUsed(id: string): Promise<void> {
        await this.db
            .update(mcpAccessTokens)
            .set({
                lastUsedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(mcpAccessTokens.id, id));
    }

    async revokeToken(organizationId: string, id: string): Promise<boolean> {
        const rows = await this.db
            .update(mcpAccessTokens)
            .set({
                enabled: false,
                revokedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(and(eq(mcpAccessTokens.organizationId, organizationId), eq(mcpAccessTokens.id, id), isNull(mcpAccessTokens.revokedAt)))
            .returning({ id: mcpAccessTokens.id });

        return rows.length > 0;
    }

    async deleteToken(organizationId: string, id: string): Promise<boolean> {
        const rows = await this.db
            .delete(mcpAccessTokens)
            .where(and(eq(mcpAccessTokens.organizationId, organizationId), eq(mcpAccessTokens.id, id)))
            .returning({ id: mcpAccessTokens.id });

        return rows.length > 0;
    }

    async deleteTokenForUser(organizationId: string, userId: string, id: string): Promise<boolean> {
        const rows = await this.db
            .delete(mcpAccessTokens)
            .where(and(eq(mcpAccessTokens.organizationId, organizationId), eq(mcpAccessTokens.createdByUserId, userId), eq(mcpAccessTokens.id, id)))
            .returning({ id: mcpAccessTokens.id });

        return rows.length > 0;
    }
}

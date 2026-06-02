import { and, eq, isNull } from 'drizzle-orm';

import { getClient } from '@dory/database/postgres/client';
import { mcpAccessTokens, mcpAuthorizationRequests, organizations } from '@dory/database/schema';
import { translateDatabase } from '@dory/database/i18n';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { PostgresDBClient } from '@dory/shared';

export type McpAccessTokenRecord = typeof mcpAccessTokens.$inferSelect;
export type McpAuthorizationRequestRecord = typeof mcpAuthorizationRequests.$inferSelect;
export type McpAuthorizationRequestStatus = 'pending' | 'approved' | 'denied';
export type McpAuthorizationPollStatus = 'not_found' | 'pending' | 'approved' | 'denied' | 'expired' | 'consumed' | 'verifier_mismatch';

export type McpAccessTokenCreateInput = {
    organizationId: string;
    name: string;
    tokenPrefix: string;
    tokenHash: string;
    scopes: string[];
    createdByUserId: string;
};

export type McpAuthorizationRequestCreateInput = {
    clientName: string;
    verifierHash: string;
    scopes: string[];
    expiresAt: Date;
};

type McpAuthorizationDecisionInput = {
    id: string;
    organizationId: string;
    userId: string;
    scopes: string[];
    now?: Date;
};

type McpAuthorizationConsumeInput = {
    id: string;
    verifierHash: string;
    token: McpAccessTokenCreateInput;
    now?: Date;
};

export type McpAuthorizationPollResult =
    | {
          status: Exclude<McpAuthorizationPollStatus, 'approved'>;
          record?: McpAuthorizationRequestRecord;
      }
    | {
          status: 'approved';
          record: McpAuthorizationRequestRecord;
      };

export type McpAuthorizationConsumeResult =
    | {
          status: Exclude<McpAuthorizationPollStatus, 'approved'>;
          record?: McpAuthorizationRequestRecord;
      }
    | {
          status: 'approved';
          record: McpAuthorizationRequestRecord;
          tokenRecord: McpAccessTokenRecord;
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

export function resolveMcpAuthorizationPollState(
    record: McpAuthorizationRequestRecord | null,
    input: {
        verifierHash?: string;
        now?: Date;
    } = {},
): McpAuthorizationPollResult {
    if (!record) return { status: 'not_found' };

    const now = input.now ?? new Date();
    if (input.verifierHash && record.verifierHash !== input.verifierHash) {
        return { status: 'verifier_mismatch', record };
    }
    if (record.expiresAt <= now) {
        return { status: 'expired', record };
    }
    if (record.status === 'denied') {
        return { status: 'denied', record };
    }
    if (record.consumedAt) {
        return { status: 'consumed', record };
    }
    if (record.status === 'approved') {
        return { status: 'approved', record };
    }

    return { status: 'pending', record };
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

    async createAuthorizationRequest(input: McpAuthorizationRequestCreateInput): Promise<McpAuthorizationRequestRecord> {
        const [created] = await this.db
            .insert(mcpAuthorizationRequests)
            .values({
                clientName: input.clientName,
                verifierHash: input.verifierHash,
                scopes: input.scopes,
                status: 'pending' satisfies McpAuthorizationRequestStatus,
                expiresAt: input.expiresAt,
            })
            .returning();

        if (!created) {
            throw new DatabaseError('Failed to create MCP authorization request', 500);
        }

        return created;
    }

    async getAuthorizationRequest(id: string): Promise<McpAuthorizationRequestRecord | null> {
        const rows = await this.db.select().from(mcpAuthorizationRequests).where(eq(mcpAuthorizationRequests.id, id)).limit(1);
        return rows[0] ?? null;
    }

    async getAuthorizationPollState(input: { id: string; verifierHash?: string; now?: Date }): Promise<McpAuthorizationPollResult> {
        return resolveMcpAuthorizationPollState(await this.getAuthorizationRequest(input.id), input);
    }

    async approveAuthorizationRequest(input: McpAuthorizationDecisionInput): Promise<McpAuthorizationPollResult> {
        const current = await this.getAuthorizationRequest(input.id);
        const state = resolveMcpAuthorizationPollState(current, { now: input.now });
        if (state.status !== 'pending' && state.status !== 'approved') return state;

        if (state.status === 'approved') return state;

        const now = input.now ?? new Date();
        const [updated] = await this.db
            .update(mcpAuthorizationRequests)
            .set({
                status: 'approved' satisfies McpAuthorizationRequestStatus,
                organizationId: input.organizationId,
                userId: input.userId,
                scopes: input.scopes,
                approvedAt: now,
                deniedAt: null,
                updatedAt: now,
            })
            .where(and(eq(mcpAuthorizationRequests.id, input.id), eq(mcpAuthorizationRequests.status, 'pending'), isNull(mcpAuthorizationRequests.consumedAt)))
            .returning();

        return resolveMcpAuthorizationPollState(updated ?? (await this.getAuthorizationRequest(input.id)), { now });
    }

    async denyAuthorizationRequest(input: Omit<McpAuthorizationDecisionInput, 'scopes'>): Promise<McpAuthorizationPollResult> {
        const current = await this.getAuthorizationRequest(input.id);
        const state = resolveMcpAuthorizationPollState(current, { now: input.now });
        if (state.status !== 'pending' && state.status !== 'denied') return state;

        if (state.status === 'denied') return state;

        const now = input.now ?? new Date();
        const [updated] = await this.db
            .update(mcpAuthorizationRequests)
            .set({
                status: 'denied' satisfies McpAuthorizationRequestStatus,
                organizationId: input.organizationId,
                userId: input.userId,
                deniedAt: now,
                updatedAt: now,
            })
            .where(and(eq(mcpAuthorizationRequests.id, input.id), eq(mcpAuthorizationRequests.status, 'pending'), isNull(mcpAuthorizationRequests.consumedAt)))
            .returning();

        return resolveMcpAuthorizationPollState(updated ?? (await this.getAuthorizationRequest(input.id)), { now });
    }

    async consumeAuthorizationRequest(input: McpAuthorizationConsumeInput): Promise<McpAuthorizationConsumeResult> {
        return this.db.transaction(async tx => {
            const rows = await tx.select().from(mcpAuthorizationRequests).where(eq(mcpAuthorizationRequests.id, input.id)).limit(1);
            const state = resolveMcpAuthorizationPollState(rows[0] ?? null, {
                verifierHash: input.verifierHash,
                now: input.now,
            });
            if (state.status !== 'approved') return state;

            const now = input.now ?? new Date();
            const [claimed] = await tx
                .update(mcpAuthorizationRequests)
                .set({
                    consumedAt: now,
                    updatedAt: now,
                })
                .where(and(eq(mcpAuthorizationRequests.id, input.id), eq(mcpAuthorizationRequests.status, 'approved'), isNull(mcpAuthorizationRequests.consumedAt)))
                .returning();

            if (!claimed) {
                return {
                    status: 'consumed',
                    record: state.record,
                };
            }

            const [tokenRecord] = await tx
                .insert(mcpAccessTokens)
                .values({
                    organizationId: input.token.organizationId,
                    name: input.token.name,
                    tokenPrefix: input.token.tokenPrefix,
                    tokenHash: input.token.tokenHash,
                    scopes: input.token.scopes,
                    enabled: true,
                    createdByUserId: input.token.createdByUserId,
                })
                .returning();

            if (!tokenRecord) {
                throw new DatabaseError('Failed to create MCP access token', 500);
            }

            const [updated] = await tx
                .update(mcpAuthorizationRequests)
                .set({
                    mcpTokenId: tokenRecord.id,
                    updatedAt: now,
                })
                .where(eq(mcpAuthorizationRequests.id, input.id))
                .returning();

            return {
                status: 'approved',
                record: updated ?? claimed,
                tokenRecord,
            };
        });
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

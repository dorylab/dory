import { and, asc, desc, eq, isNull, lte } from 'drizzle-orm';

import { getClient } from '@dory/database/postgres/client';
import { localAiBridges, localAiJobs, mcpAccessTokens, mcpAuthorizationRequests, organizations } from '@dory/database/schema';
import { translateDatabase } from '@dory/database/i18n';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import type { PostgresDBClient } from '@dory/shared';

export type McpAccessTokenRecord = typeof mcpAccessTokens.$inferSelect;
export type McpAuthorizationRequestRecord = typeof mcpAuthorizationRequests.$inferSelect;
export type LocalAiBridgeRecord = typeof localAiBridges.$inferSelect;
export type LocalAiJobRecord = typeof localAiJobs.$inferSelect;
export type McpAuthorizationRequestStatus = 'pending' | 'approved' | 'denied';
export type McpAuthorizationPollStatus = 'not_found' | 'pending' | 'approved' | 'denied' | 'expired' | 'consumed' | 'verifier_mismatch';
export type LocalAiJobStatus = 'pending' | 'claimed' | 'completed' | 'failed' | 'expired';

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

export type LocalAiBridgeRegisterInput = {
    organizationId: string;
    userId: string;
    mcpTokenId: string;
    provider: string;
    name: string;
    capabilities?: Record<string, unknown> | null;
};

export type LocalAiJobCreateInput = {
    organizationId: string;
    bridgeId: string;
    provider: string;
    model: string;
    prompt: string;
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

function normalizeName(value?: string | null) {
    const trimmed = value?.trim();
    return trimmed ? trimmed.slice(0, 80) : 'Dory MCP';
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

    async registerLocalAiBridge(input: LocalAiBridgeRegisterInput): Promise<LocalAiBridgeRecord> {
        const now = new Date();
        const name = normalizeName(input.name);
        const existing = await this.db
            .select()
            .from(localAiBridges)
            .where(
                and(
                    eq(localAiBridges.mcpTokenId, input.mcpTokenId),
                    eq(localAiBridges.provider, input.provider),
                    eq(localAiBridges.name, name),
                    isNull(localAiBridges.revokedAt),
                ),
            )
            .orderBy(desc(localAiBridges.updatedAt))
            .limit(1);

        if (existing[0]) {
            const [updated] = await this.db
                .update(localAiBridges)
                .set({
                    organizationId: input.organizationId,
                    userId: input.userId,
                    capabilities: input.capabilities ?? null,
                    lastSeenAt: now,
                    updatedAt: now,
                })
                .where(eq(localAiBridges.id, existing[0].id))
                .returning();

            if (!updated) {
                throw new DatabaseError('Failed to update local AI bridge', 500);
            }

            return updated;
        }

        const [created] = await this.db
            .insert(localAiBridges)
            .values({
                organizationId: input.organizationId,
                userId: input.userId,
                mcpTokenId: input.mcpTokenId,
                provider: input.provider,
                name,
                capabilities: input.capabilities ?? null,
                lastSeenAt: now,
                updatedAt: now,
            })
            .returning();

        if (!created) {
            throw new DatabaseError('Failed to create local AI bridge', 500);
        }

        return created;
    }

    async listLocalAiBridges(organizationId: string): Promise<LocalAiBridgeRecord[]> {
        return this.db
            .select()
            .from(localAiBridges)
            .where(and(eq(localAiBridges.organizationId, organizationId), isNull(localAiBridges.revokedAt)))
            .orderBy(desc(localAiBridges.lastSeenAt), desc(localAiBridges.updatedAt));
    }

    async getLocalAiBridge(organizationId: string, id: string): Promise<LocalAiBridgeRecord | null> {
        const rows = await this.db
            .select()
            .from(localAiBridges)
            .where(and(eq(localAiBridges.organizationId, organizationId), eq(localAiBridges.id, id), isNull(localAiBridges.revokedAt)))
            .limit(1);

        return rows[0] ?? null;
    }

    async touchLocalAiBridge(input: { organizationId: string; id: string; mcpTokenId: string; now?: Date }): Promise<LocalAiBridgeRecord | null> {
        const now = input.now ?? new Date();
        const [updated] = await this.db
            .update(localAiBridges)
            .set({
                lastSeenAt: now,
                updatedAt: now,
            })
            .where(and(eq(localAiBridges.organizationId, input.organizationId), eq(localAiBridges.id, input.id), eq(localAiBridges.mcpTokenId, input.mcpTokenId), isNull(localAiBridges.revokedAt)))
            .returning();

        return updated ?? null;
    }

    async createLocalAiJob(input: LocalAiJobCreateInput): Promise<LocalAiJobRecord> {
        const [created] = await this.db
            .insert(localAiJobs)
            .values({
                organizationId: input.organizationId,
                bridgeId: input.bridgeId,
                provider: input.provider,
                model: input.model,
                prompt: input.prompt,
                status: 'pending',
                expiresAt: input.expiresAt,
                updatedAt: new Date(),
            })
            .returning();

        if (!created) {
            throw new DatabaseError('Failed to create local AI job', 500);
        }

        return created;
    }

    async getLocalAiJob(organizationId: string, id: string): Promise<LocalAiJobRecord | null> {
        const rows = await this.db.select().from(localAiJobs).where(and(eq(localAiJobs.organizationId, organizationId), eq(localAiJobs.id, id))).limit(1);
        return rows[0] ?? null;
    }

    async claimLocalAiJob(input: { organizationId: string; bridgeId: string; mcpTokenId: string; now?: Date }): Promise<LocalAiJobRecord | null> {
        const now = input.now ?? new Date();
        const bridge = await this.touchLocalAiBridge({
            organizationId: input.organizationId,
            id: input.bridgeId,
            mcpTokenId: input.mcpTokenId,
            now,
        });
        if (!bridge) return null;

        await this.db
            .update(localAiJobs)
            .set({
                status: 'expired',
                errorMessage: 'Local AI job expired before it was claimed.',
                completedAt: now,
                updatedAt: now,
            })
            .where(and(eq(localAiJobs.organizationId, input.organizationId), eq(localAiJobs.bridgeId, input.bridgeId), eq(localAiJobs.status, 'pending'), lte(localAiJobs.expiresAt, now)));

        return this.db.transaction(async tx => {
            const [job] = await tx
                .select()
                .from(localAiJobs)
                .where(and(eq(localAiJobs.organizationId, input.organizationId), eq(localAiJobs.bridgeId, input.bridgeId), eq(localAiJobs.status, 'pending')))
                .orderBy(asc(localAiJobs.createdAt))
                .limit(1);

            if (!job) return null;

            const [claimed] = await tx
                .update(localAiJobs)
                .set({
                    status: 'claimed',
                    attempts: job.attempts + 1,
                    claimedAt: now,
                    updatedAt: now,
                })
                .where(and(eq(localAiJobs.id, job.id), eq(localAiJobs.status, 'pending')))
                .returning();

            return claimed ?? null;
        });
    }

    async completeLocalAiJob(input: {
        organizationId: string;
        bridgeId: string;
        mcpTokenId: string;
        id: string;
        ok: boolean;
        text?: string | null;
        stdout?: string | null;
        stderr?: string | null;
        errorMessage?: string | null;
        now?: Date;
    }): Promise<LocalAiJobRecord | null> {
        const now = input.now ?? new Date();
        const bridge = await this.touchLocalAiBridge({
            organizationId: input.organizationId,
            id: input.bridgeId,
            mcpTokenId: input.mcpTokenId,
            now,
        });
        if (!bridge) return null;

        const [updated] = await this.db
            .update(localAiJobs)
            .set({
                status: input.ok ? 'completed' : 'failed',
                resultText: input.ok ? (input.text ?? '') : null,
                stdout: input.stdout ?? null,
                stderr: input.stderr ?? null,
                errorMessage: input.ok ? null : (input.errorMessage ?? 'Local AI job failed.'),
                completedAt: now,
                updatedAt: now,
            })
            .where(and(eq(localAiJobs.organizationId, input.organizationId), eq(localAiJobs.bridgeId, input.bridgeId), eq(localAiJobs.id, input.id), eq(localAiJobs.status, 'claimed')))
            .returning();

        return updated ?? null;
    }
}

import { eq } from 'drizzle-orm';

import { getDBService } from '@dory/database';
import { getClient } from '@dory/database/postgres/client';
import { isOrganizationEligibleForAiQuotaExemption } from '@/lib/organization/metadata';
import { user } from '@dory/database/postgres/schemas';
import { normalizeOrganizationBillingStatus } from '@/lib/billing/normalize';
import type { OrganizationPlan } from '@/lib/billing/types';

export const AI_QUOTA_EXCEEDED_CODE = 'AI_QUOTA_EXCEEDED';

export class AiQuotaExceededError extends Error {
    public readonly code = AI_QUOTA_EXCEEDED_CODE;
    public readonly status = 429;

    constructor(message = 'AI monthly token quota exceeded') {
        super(message);
        this.name = 'AiQuotaExceededError';
    }
}

export type AiQuotaConfig = {
    hobbyMonthlyTokens: number | null;
    proMonthlyTokens: number | null;
};

export type AiQuotaWindow = {
    from: Date;
    to: Date;
    resetAt: Date;
};

export type AiQuotaState = {
    plan: OrganizationPlan;
    usedTokens: number;
    limitTokens: number | null;
    remainingTokens: number | null;
    resetAt: string;
    enforced: boolean;
};

export type AiIdentityContext = {
    organizationId?: string | null;
    userId?: string | null;
    userEmail?: string | null;
    plan?: OrganizationPlan;
    feature?: string | null;
};

export type AiResolvedEntitlements = AiIdentityContext & {
    quota: AiQuotaState | null;
};

export function parseMonthlyTokenLimit(value?: string | null): number | null {
    if (!value) return null;
    const parsed = Number(value.trim());
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.floor(parsed);
}

export function getAiQuotaConfig(env: Record<string, string | undefined> = process.env): AiQuotaConfig {
    return {
        hobbyMonthlyTokens: parseMonthlyTokenLimit(env.DORY_AI_QUOTA_HOBBY_MONTHLY_TOKENS),
        proMonthlyTokens: parseMonthlyTokenLimit(env.DORY_AI_QUOTA_PRO_MONTHLY_TOKENS),
    };
}

export function getCurrentUtcMonthWindow(now = new Date()): AiQuotaWindow {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const resetAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
    return {
        from,
        to: resetAt,
        resetAt,
    };
}

export function getLimitForPlan(plan: OrganizationPlan, config = getAiQuotaConfig()): number | null {
    return plan === 'pro' ? config.proMonthlyTokens : config.hobbyMonthlyTokens;
}

async function resolveUserEmail(userId?: string | null): Promise<string | null> {
    if (!userId) return null;

    try {
        const db = await getClient();
        const [row] = await db.select({ email: user.email }).from(user).where(eq(user.id, userId)).limit(1);
        return row?.email ?? null;
    } catch (error) {
        console.error('[ai][quota] failed to resolve user email', error);
        return null;
    }
}

export async function resolveAiEntitlements(context: AiIdentityContext): Promise<AiResolvedEntitlements> {
    const organizationId = context.organizationId ?? null;
    const userId = context.userId ?? null;
    const userEmail = context.userEmail ?? (await resolveUserEmail(userId));

    if (!organizationId) {
        return {
            ...context,
            userEmail,
            quota: null,
        };
    }

    const db = await getDBService();
    const records = await db.billing.listByReferenceId(organizationId);
    const billing = normalizeOrganizationBillingStatus(records, false);
    const plan = context.plan ?? billing.plan;
    const window = getCurrentUtcMonthWindow();
    const usedTokens = await db.aiUsage.getMonthlyTokenUsage({
        organizationId,
        from: window.from,
        to: window.to,
    });
    const limitTokens = getLimitForPlan(plan);
    const ownerEmail = await db.organizations.getOrganizationOwnerEmail(organizationId);
    const exemptFromQuota = isOrganizationEligibleForAiQuotaExemption(ownerEmail);
    const enforced = limitTokens !== null && !exemptFromQuota;

    return {
        ...context,
        organizationId,
        userId,
        userEmail,
        plan,
        quota: {
            plan,
            usedTokens,
            limitTokens: enforced ? limitTokens : null,
            remainingTokens: enforced ? Math.max(0, limitTokens - usedTokens) : null,
            resetAt: window.resetAt.toISOString(),
            enforced,
        },
    };
}

export function assertAiQuotaAllowed(quota: AiQuotaState | null): void {
    if (!quota?.enforced || quota.limitTokens === null) return;
    if (quota.usedTokens < quota.limitTokens) return;
    throw new AiQuotaExceededError();
}

export function isAiQuotaExceededError(error: unknown): error is AiQuotaExceededError {
    return error instanceof AiQuotaExceededError || (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === AI_QUOTA_EXCEEDED_CODE);
}

export function toAiQuotaExceededResponse(error: unknown, extraBody?: Record<string, unknown>): Response {
    const message =
        error instanceof Error
            ? error.message
            : typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string'
              ? (error as { message: string }).message
              : 'AI monthly token quota exceeded';

    return new Response(
        JSON.stringify({
            code: AI_QUOTA_EXCEEDED_CODE,
            message,
            ...(extraBody ?? {}),
        }),
        {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
        },
    );
}

export function buildCloudflareAiGatewayHeaders(context: AiIdentityContext, gateway?: string | null): Record<string, string> | null {
    if (gateway !== 'cloudflare') return null;

    return {
        'cf-aig-metadata': JSON.stringify({
            email: context.userEmail ?? '',
            userId: context.userId ?? '',
            orgId: context.organizationId ?? '',
            feature: context.feature ?? '',
            plan: context.plan ?? 'hobby',
        }),
        'cf-aig-collect-log-payload': 'false',
    };
}

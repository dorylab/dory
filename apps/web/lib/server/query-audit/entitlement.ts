import 'server-only';

import { getOrganizationBillingStatus } from '@/lib/billing/server';
import { shouldProxyCloudRequest } from '@/lib/auth/auth-proxy';
import { fetchDesktopCloud } from '@/lib/server/desktop-cloud';
import { isEnterpriseLicenseForServer } from '@dory/shared/runtime';

type OrganizationBillingPayload = {
    code?: number;
    data?: {
        billingStatus?: {
            plan?: unknown;
        } | null;
    } | null;
};

function normalizeOrganizationPlan(value: unknown): 'hobby' | 'pro' | null {
    return value === 'pro' || value === 'hobby' ? value : null;
}

async function resolveCloudBillingPlan(organizationId: string): Promise<'hobby' | 'pro' | null> {
    const cloudResponse = await fetchDesktopCloud(`/api/organization/billing?organizationId=${encodeURIComponent(organizationId)}`);
    if (cloudResponse.state !== 'available' || !cloudResponse.response.ok) {
        return null;
    }

    const payload = (await cloudResponse.response.json().catch(() => null)) as OrganizationBillingPayload | null;
    if (payload?.code !== 0) {
        return null;
    }

    return normalizeOrganizationPlan(payload.data?.billingStatus?.plan);
}

export async function canUseQueryAuditForOrganization(organizationId: string): Promise<boolean> {
    if (isEnterpriseLicenseForServer()) {
        return true;
    }

    try {
        if (shouldProxyCloudRequest()) {
            const cloudPlan = await resolveCloudBillingPlan(organizationId);
            return cloudPlan === 'pro';
        }

        const billingStatus = await getOrganizationBillingStatus(organizationId, false);
        return billingStatus.plan === 'pro';
    } catch {
        return false;
    }
}

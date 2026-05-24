import 'server-only';

import type { DBService } from '@dory/database';
import {
    getOrganizationAiProviderEntitlementModeForServer,
    resolveOrganizationAiProviderBillingPlan,
    resolveOrganizationAiProviderCapability,
    type OrganizationAiProviderCapability,
    type OrganizationAiProviderEntitlementMode,
    type OrganizationPlan,
} from '@dory/ee/ai/organization-ai-providers';
import { shouldProxyCloudRequest } from '@/lib/auth/auth-proxy';
import { fetchDesktopCloud } from '@/lib/server/desktop-cloud';

type OrganizationBillingPayload = {
    code?: number;
    data?: {
        billingStatus?: {
            plan?: unknown;
        } | null;
    } | null;
};

type OrganizationAiProviderEntitlement = {
    entitlementMode: OrganizationAiProviderEntitlementMode;
    billingPlan: OrganizationPlan | string | null;
    capability: OrganizationAiProviderCapability;
};

function normalizeOrganizationPlan(value: unknown): OrganizationPlan | null {
    return value === 'pro' || value === 'hobby' ? value : null;
}

async function resolveCloudBillingPlan(organizationId: string): Promise<OrganizationPlan | null> {
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

export async function resolveOrganizationAiProviderEntitlementForRequest(db: DBService, organizationId: string): Promise<OrganizationAiProviderEntitlement> {
    const entitlementMode = getOrganizationAiProviderEntitlementModeForServer();
    const billingPlan =
        entitlementMode !== 'cloud-plan'
            ? null
            : shouldProxyCloudRequest()
              ? await resolveCloudBillingPlan(organizationId)
              : await resolveOrganizationAiProviderBillingPlan(db, organizationId);

    return {
        entitlementMode,
        billingPlan,
        capability: resolveOrganizationAiProviderCapability({
            entitlementMode,
            billingPlan,
        }),
    };
}

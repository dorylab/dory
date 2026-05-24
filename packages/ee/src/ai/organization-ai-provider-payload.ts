import { getLicenseForServer, getRuntimeForServer } from '@dory/shared/runtime';
import type { DBService } from '@dory/database';
import {
    buildAiProvidersViewModel,
    getOrganizationAiProviderEntitlementModeForServer,
    resolveOrganizationAiProviderBillingPlan,
    type OrganizationAiProviderEntitlementMode,
    type OrganizationPlan,
} from './organization-ai-providers';

export async function buildOrganizationAiProvidersPayload(options: {
    db: DBService;
    organizationId: string;
    canManage: boolean;
    entitlementMode?: OrganizationAiProviderEntitlementMode;
    billingPlan?: OrganizationPlan | string | null;
}) {
    const runtime = getRuntimeForServer() ?? 'web';
    const entitlementMode = options.entitlementMode ?? getOrganizationAiProviderEntitlementModeForServer();
    const license = entitlementMode === 'self-hosted-license' ? getLicenseForServer() : null;
    const billingPlan =
        options.billingPlan !== undefined
            ? options.billingPlan
            : entitlementMode === 'cloud-plan'
              ? await resolveOrganizationAiProviderBillingPlan(options.db, options.organizationId)
              : null;
    const organizationProviders = await options.db.organizationAiProviders.list(options.organizationId);
    const viewModel = buildAiProvidersViewModel({
        organizationProviders,
        entitlementMode,
        license,
        billingPlan,
        runtime,
    });

    return {
        canManage: options.canManage,
        ...viewModel,
        organizationProviderCapability: options.canManage
            ? viewModel.organizationProviderCapability
            : {
                  ...viewModel.organizationProviderCapability,
                  enabled: false,
              },
    };
}

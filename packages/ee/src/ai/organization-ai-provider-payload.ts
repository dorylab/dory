import { getLicenseForServer, getRuntimeForServer } from '@dory/shared/runtime';
import type { DBService } from '@dory/database';
import { buildAiProvidersViewModel, getOrganizationAiProviderEntitlementModeForServer, resolveOrganizationAiProviderBillingPlan } from './organization-ai-providers';

export async function buildOrganizationAiProvidersPayload(options: { db: DBService; organizationId: string; canManage: boolean }) {
    const license = getLicenseForServer();
    const runtime = getRuntimeForServer() ?? 'web';
    const entitlementMode = getOrganizationAiProviderEntitlementModeForServer();
    const billingPlan = await resolveOrganizationAiProviderBillingPlan(options.db, options.organizationId);
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

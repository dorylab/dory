import 'server-only';

import { getOrganizationBillingStatus } from '@/lib/billing/server';
import { isEnterpriseLicenseForServer } from '@dory/shared/runtime';

export async function canUseQueryAuditForOrganization(organizationId: string): Promise<boolean> {
    if (isEnterpriseLicenseForServer()) {
        return true;
    }

    try {
        const billingStatus = await getOrganizationBillingStatus(organizationId, false);
        return billingStatus.plan === 'pro';
    } catch {
        return false;
    }
}

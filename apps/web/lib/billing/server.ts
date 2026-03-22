import 'server-only';

import { getDBService } from '@/lib/database';
import { normalizeOrganizationBillingStatus } from './normalize';

export async function getOrganizationBillingStatus(referenceId: string, canManageBilling: boolean) {
    const db = await getDBService();
    const records = await db.billing.listByReferenceId(referenceId);
    return normalizeOrganizationBillingStatus(records, canManageBilling);
}

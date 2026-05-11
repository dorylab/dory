import type { OrganizationRole } from '@dory/shared/types/organization';

export function canManageOrganizationBilling(role: OrganizationRole | null | undefined): boolean {
    return role === 'owner';
}

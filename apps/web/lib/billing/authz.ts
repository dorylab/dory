import type { OrganizationRole } from '@/types/organization';

export function canManageOrganizationBilling(role: OrganizationRole | null | undefined): boolean {
    return role === 'owner';
}

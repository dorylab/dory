import type { OrganizationPermissionMap, OrganizationRole } from '@dory/shared/types/organization';

export type OrganizationAccessRole = OrganizationRole | null;
export type OrganizationAccessSource = 'desktop_cloud' | 'local';

export type OrganizationAccess = {
    source: OrganizationAccessSource;
    organizationId: string;
    userId: string;
    isMember: boolean;
    role: OrganizationAccessRole;
    permissions: OrganizationPermissionMap;
    organization: {
        id: string;
        slug?: string | null;
        name?: string | null;
    } | null;
};

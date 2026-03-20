export type OrganizationAccessRole = 'owner' | 'admin' | 'member' | 'viewer' | null;

export type OrganizationAccess = {
    source: 'desktop' | 'local';
    organizationId: string;
    userId: string;
    isMember: boolean;
    role: OrganizationAccessRole;
    organization: {
        id: string;
        slug?: string | null;
        name?: string | null;
    } | null;
};

import { getDBService } from '@dory/database';
import { getOrganizationPermissionMap } from '@/lib/auth/organization-ac';
import type { OrganizationAccess } from './types';

export async function resolveLocalOrganizationAccess(organizationId: string, userId: string): Promise<OrganizationAccess | null> {
    const db = await getDBService();
    if (!db) throw new Error('Database service not initialized');

    const organization = await db.organizations.getOrganizationBySlugOrId(organizationId);
    const resolvedOrganizationId = organization?.id ?? organizationId;
    const members = await db.organizations.listByUser(userId);
    const member = members.find(item => item.organizationId === resolvedOrganizationId && (item.status === 'active' || item.status == null));

    if (!member && organization?.ownerUserId !== userId) {
        return null;
    }

    return {
        source: 'local',
        organizationId: resolvedOrganizationId,
        userId,
        isMember: true,
        role: member?.role ?? (organization?.ownerUserId === userId ? 'owner' : null),
        permissions: getOrganizationPermissionMap(member?.role ?? (organization?.ownerUserId === userId ? 'owner' : null)),
        organization: organization
            ? {
                  id: organization.id,
                  slug: organization.slug ?? null,
                  name: organization.name ?? null,
              }
            : {
                  id: resolvedOrganizationId,
                  slug: resolvedOrganizationId,
                  name: resolvedOrganizationId,
              },
    };
}

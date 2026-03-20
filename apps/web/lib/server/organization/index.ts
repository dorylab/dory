import { shouldProxyAuthRequest } from '@/lib/auth/auth-proxy';
import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';
import { getSessionFromRequest } from '@/lib/auth/session';
import { getDBService } from '@/lib/database';
import { resolveOrganizationAccess } from '@/lib/server/authz';

export async function getOrganizationBySlugOrId(slugOrId: string, userId: string) {
    if (shouldProxyAuthRequest()) {
        const session = await getSessionFromRequest();
        const currentOrganizationId = resolveCurrentOrganizationId(session);

        console.log('[organization] resolve:desktop', {
            slugOrId,
            userId,
            currentOrganizationId,
        });

        if (!currentOrganizationId || slugOrId !== currentOrganizationId) {
            console.log('[organization] resolve:desktop:mismatch', {
                slugOrId,
                userId,
                currentOrganizationId,
            });
            return null;
        }

        const access = await resolveOrganizationAccess(currentOrganizationId, userId);
        if (!access?.isMember) {
            console.log('[organization] resolve:desktop:access-denied', {
                slugOrId,
                userId,
                currentOrganizationId,
                access,
            });
            return null;
        }

        console.log('[organization] resolve:desktop:success', {
            slugOrId,
            userId,
            currentOrganizationId,
            accessSource: access.source,
        });
        return access.organization
            ? {
                  id: access.organization.id,
                  slug: access.organization.slug ?? access.organization.id,
                  name: access.organization.name ?? access.organization.id,
              }
            : {
                  id: currentOrganizationId,
                  slug: currentOrganizationId,
                  name: currentOrganizationId,
              };
    }

    const db = await getDBService();
    if (!db) {
        throw new Error('Database service not initialized');
    }

    console.log('[organization] resolve:local', {
        slugOrId,
        userId,
    });

    const organization = await db.organizations.getOrganizationBySlugOrId(slugOrId);
    if (!organization) {
        console.log('[organization] resolve:local:not-found', {
            slugOrId,
            userId,
        });
        return null;
    }

    const access = await resolveOrganizationAccess(organization.id, userId);
    if (!access?.isMember) {
        console.log('[organization] resolve:local:access-denied', {
            slugOrId,
            organizationId: organization.id,
            userId,
            access,
        });
        return null;
    }

    console.log('[organization] resolve:local:success', {
        slugOrId,
        organizationId: organization.id,
        userId,
        accessSource: access.source,
    });
    return access.organization
        ? {
              ...organization,
              slug: access.organization.slug ?? organization.slug,
              name: access.organization.name ?? organization.name,
          }
        : organization;
}

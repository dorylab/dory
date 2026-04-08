import { shouldProxyAuthRequest } from '@/lib/auth/auth-proxy';
import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';
import { getSessionFromRequest } from '@/lib/auth/session';
import { getDBService } from '@/lib/database';
import { resolveDesktopOrganizationAccessResult } from '@/lib/server/authz/authz.desktop';
import { fetchDesktopCloud } from '@/lib/server/desktop-cloud';
import { resolveOrganizationAccess } from '@/lib/server/authz';

type OrganizationSummary = {
    id: string;
    slug: string;
    name: string;
};

export type OrganizationResolutionState = {
    organization: OrganizationSummary | null;
    isOffline: boolean;
};

function toOrganizationSummary(organization: { id: string; slug?: string | null; name?: string | null } | null, fallbackId?: string | null): OrganizationSummary | null {
    if (!organization && !fallbackId) {
        return null;
    }

    const id = organization?.id ?? fallbackId ?? null;
    if (!id) {
        return null;
    }

    return {
        id,
        slug: organization?.slug ?? id,
        name: organization?.name ?? id,
    };
}

async function getLocalOrganizationSummaryBySlugOrId(slugOrId: string, userId: string): Promise<OrganizationSummary | null> {
    const db = await getDBService();
    if (!db) {
        throw new Error('Database service not initialized');
    }

    const organization = await db.organizations.getOrganizationBySlugOrId(slugOrId);
    if (!organization) {
        return null;
    }

    const access = await resolveOrganizationAccess(organization.id, userId);
    if (!access?.isMember) {
        return null;
    }

    return toOrganizationSummary(
        {
            ...organization,
            slug: access.organization?.slug ?? organization.slug,
            name: access.organization?.name ?? organization.name,
        },
        organization.id,
    );
}

async function getLocalOrganizationSummaryByUser(userId: string): Promise<OrganizationSummary | null> {
    const db = await getDBService();
    if (!db) {
        throw new Error('Database service not initialized');
    }

    const memberships = await db.organizations.listByUser(userId);
    const firstMembership = memberships.find(item => item.status === 'active' || item.status == null);
    if (!firstMembership?.organizationId) {
        return null;
    }

    const organization = await db.organizations.getOrganizationBySlugOrId(firstMembership.organizationId);
    return toOrganizationSummary(organization, firstMembership.organizationId);
}

export async function getOrganizationBySlugOrIdState(slugOrId: string, userId: string): Promise<OrganizationResolutionState> {
    if (shouldProxyAuthRequest()) {
        const session = await getSessionFromRequest();
        const currentOrganizationId = resolveCurrentOrganizationId(session);

        console.log('[organization] resolve:desktop', {
            slugOrId,
            userId,
            currentOrganizationId,
        });

        if (!currentOrganizationId) {
            return {
                organization: null,
                isOffline: false,
            };
        }

        const accessResult = await resolveDesktopOrganizationAccessResult(currentOrganizationId, userId);
        if (!accessResult.access?.isMember) {
            return {
                organization: null,
                isOffline: accessResult.isOffline,
            };
        }

        if (accessResult.status === 'granted_from_cloud') {
            const resolvedOrganization = toOrganizationSummary(accessResult.access.organization, currentOrganizationId);
            if (slugOrId !== resolvedOrganization?.id && slugOrId !== resolvedOrganization?.slug) {
                return {
                    organization: null,
                    isOffline: false,
                };
            }

            return {
                organization: resolvedOrganization,
                isOffline: false,
            };
        }

        const localOrganization = await getLocalOrganizationSummaryBySlugOrId(slugOrId, userId).catch(() => null);
        if (localOrganization && currentOrganizationId === localOrganization.id) {
            return {
                organization: localOrganization,
                isOffline: accessResult.isOffline,
            };
        }

        const sessionOrganization = toOrganizationSummary(accessResult.access.organization, currentOrganizationId);
        if (slugOrId !== sessionOrganization?.id && slugOrId !== sessionOrganization?.slug) {
            return {
                organization: null,
                isOffline: accessResult.isOffline,
            };
        }

        return {
            organization: sessionOrganization,
            isOffline: accessResult.isOffline,
        };
    }

    return {
        organization: await getLocalOrganizationSummaryBySlugOrId(slugOrId, userId),
        isOffline: false,
    };
}

export async function getFirstOrganizationForUserState(userId: string): Promise<OrganizationResolutionState> {
    if (shouldProxyAuthRequest()) {
        const cloudResponse = await fetchDesktopCloud('/api/auth/organization/list');
        if (cloudResponse.state === 'available') {
            const organizations = (await cloudResponse.response.json().catch(() => null)) as Array<{ id: string; slug: string; name: string }> | null;
            const firstOrganization = organizations?.[0] ?? null;
            if (firstOrganization) {
                return {
                    organization: {
                        id: firstOrganization.id,
                        slug: firstOrganization.slug ?? firstOrganization.id,
                        name: firstOrganization.name,
                    },
                    isOffline: false,
                };
            }

            return {
                organization: null,
                isOffline: false,
            };
        }

        return {
            organization: await getLocalOrganizationSummaryByUser(userId).catch(() => null),
            isOffline: cloudResponse.state === 'unreachable',
        };
    }

    return {
        organization: await getLocalOrganizationSummaryByUser(userId),
        isOffline: false,
    };
}

export async function getOrganizationBySlugOrId(slugOrId: string, userId: string) {
    return (await getOrganizationBySlugOrIdState(slugOrId, userId)).organization;
}

export async function getFirstOrganizationForUser(userId: string) {
    return (await getFirstOrganizationForUserState(userId)).organization;
}

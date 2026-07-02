import { getDBService } from '@dory/database';
import { getOrganizationBySlugOrId } from '@/lib/server/organization';

type OrganizationLookupResult = {
    id: string;
} | null;

type ResolveMcpDesktopGrantOrganizationIdOptions = {
    userId: string;
    sessionOrganizationId: string | null;
    requestedOrganizationSlugOrId?: string | null;
    findOrganizationBySlugOrId?: (slugOrId: string, userId: string) => Promise<OrganizationLookupResult>;
};

function normalizeOrganizationSlugOrId(value: string | null | undefined) {
    const normalized = value?.trim();
    return normalized || null;
}

async function findOrganizationBySlugOrId(slugOrId: string, userId: string): Promise<OrganizationLookupResult> {
    const organization = await getOrganizationBySlugOrId(slugOrId, userId);
    if (organization) {
        return {
            id: organization.id,
        };
    }

    const db = await getDBService();
    return db.organizations.getOrganizationBySlugOrId(slugOrId);
}

export async function resolveMcpDesktopGrantOrganizationId({
    userId,
    sessionOrganizationId,
    requestedOrganizationSlugOrId,
    findOrganizationBySlugOrId: findOrganization = findOrganizationBySlugOrId,
}: ResolveMcpDesktopGrantOrganizationIdOptions) {
    const requested = normalizeOrganizationSlugOrId(requestedOrganizationSlugOrId);
    if (!requested) {
        return sessionOrganizationId;
    }

    const organization = await findOrganization(requested, userId);
    return organization?.id ?? requested;
}

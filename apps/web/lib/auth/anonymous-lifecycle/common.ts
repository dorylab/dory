import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import type { PostgresDBClient } from '@dory/shared';
import { getServerLocale } from '@dory/i18n/server';
import { translate } from '@dory/i18n/translate';
import { getClient } from '@dory/database/postgres/client';
import type { OrganizationProvisioningKind } from '@dory/database/postgres/schemas';
import { schema } from '@dory/database/schema';

export type AuthSessionLike = {
    session?: {
        token?: string | null;
        activeOrganizationId?: string | null;
    } | null;
    user?: {
        id?: string | null;
        email?: string | null;
        isAnonymous?: boolean | null;
    } | null;
};

export type AnonymousOrganizationRow = {
    id: string;
    slug: string | null;
    name: string;
    provisioningKind: OrganizationProvisioningKind | null;
};

function slugifyOrganizationName(name: string) {
    const normalized = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    return normalized || 'workspace';
}

export async function buildAnonymousOrganizationValues(userId: string) {
    const locale = await getServerLocale();
    const t = (key: string, values?: Record<string, unknown>) => translate(locale, key, values);
    const name = t('Auth.AnonymousWorkspace.Name');

    return {
        name,
        slug: `${slugifyOrganizationName(name)}-${userId.slice(0, 8)}`,
    };
}

export async function buildDefaultOrganizationValues(userId: string, email: string | null | undefined) {
    const locale = await getServerLocale();
    const t = (key: string, values?: Record<string, unknown>) => translate(locale, key, values);
    const name = t('Auth.TeamName', { name: email ?? t('Auth.TeamDefaultName') });

    return {
        name,
        slug: `${slugifyOrganizationName(name)}-${userId.slice(0, 8)}`,
    };
}

export async function getDb() {
    return (await getClient()) as PostgresDBClient;
}

export async function findFirstActiveOrganizationIdForUser(db: PostgresDBClient, userId: string) {
    const [membership] = await db
        .select({ organizationId: schema.organizationMembers.organizationId })
        .from(schema.organizationMembers)
        .where(and(eq(schema.organizationMembers.userId, userId), or(eq(schema.organizationMembers.status, 'active'), isNull(schema.organizationMembers.status))))
        .limit(1);

    return membership?.organizationId ?? null;
}

export async function findOwnedOrganizationIdsForUser(db: Pick<PostgresDBClient, 'select'>, userId: string) {
    const organizations = await db.select({ id: schema.organizations.id }).from(schema.organizations).where(eq(schema.organizations.ownerUserId, userId));

    return organizations.map(organization => organization.id);
}

export async function findAnonymousOrganizationIdsForLink(
    db: PostgresDBClient,
    params: {
        anonymousUserId: string;
        anonymousActiveOrganizationId?: string | null;
    },
) {
    const organizationIds = [
        params.anonymousActiveOrganizationId ?? null,
        await findFirstActiveOrganizationIdForUser(db, params.anonymousUserId),
        ...(await findOwnedOrganizationIdsForUser(db, params.anonymousUserId)),
    ].filter((organizationId): organizationId is string => Boolean(organizationId));

    return [...new Set(organizationIds)];
}

export async function normalizeAnonymousSourceOrganizations(tx: Pick<PostgresDBClient, 'update'>, organizations: AnonymousOrganizationRow[]) {
    const organizationIdsToBackfill = organizations.filter(organization => organization.provisioningKind == null).map(organization => organization.id);

    if (organizationIdsToBackfill.length > 0) {
        await tx
            .update(schema.organizations)
            .set({
                provisioningKind: 'anonymous',
                updatedAt: new Date(),
            })
            .where(inArray(schema.organizations.id, organizationIdsToBackfill));
    }

    return organizations.map(organization => ({
        ...organization,
        provisioningKind: organization.provisioningKind ?? 'anonymous',
    }));
}

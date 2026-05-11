import { ensureOrganizationDefaults } from '@/lib/demo/organization-defaults';
import { eq } from 'drizzle-orm';
import { createProvisionedOrganization } from '@/lib/auth/organization-provisioning';
import { getDBService } from '@dory/database';
import { schema } from '@dory/database/schema';
import { AuthSessionLike, buildAnonymousOrganizationValues, findFirstActiveOrganizationIdForUser, getDb } from './common';

export async function bootstrapAnonymousOrganization(params: { auth: any; session: AuthSessionLike; headers?: Headers }) {
    const db = await getDb();
    const userId = params.session.user?.id ?? null;
    const sessionToken = params.session.session?.token ?? null;

    if (!userId || !sessionToken) {
        throw new Error('missing_anonymous_session');
    }

    let organizationId = params.session.session?.activeOrganizationId ?? (await findFirstActiveOrganizationIdForUser(db, userId));

    if (!organizationId) {
        const defaults = await buildAnonymousOrganizationValues(userId);
        const created = await createProvisionedOrganization({
            auth: params.auth,
            headers: params.headers,
            userId,
            name: defaults.name,
            slug: defaults.slug,
            provisioningKind: 'anonymous',
        });

        organizationId = created?.id ?? null;
        if (!organizationId) {
            throw new Error(`failed_to_create_default_organization_for_${userId}`);
        }
    }

    const [organization] = await db
        .select({
            id: schema.organizations.id,
            slug: schema.organizations.slug,
            name: schema.organizations.name,
            provisioningKind: schema.organizations.provisioningKind,
        })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, organizationId))
        .limit(1);

    if (!organization) {
        throw new Error(`organization_not_found_for_${organizationId}`);
    }

    const dbService = await getDBService();
    await ensureOrganizationDefaults(dbService, userId, organization.id);

    await db
        .update(schema.session)
        .set({
            activeOrganizationId: organization.id,
            updatedAt: new Date(),
        })
        .where(eq(schema.session.token, sessionToken));

    return organization;
}

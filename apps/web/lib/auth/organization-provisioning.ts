import { eq } from 'drizzle-orm';
import { getClient } from '@dory/database/postgres/client';
import { schema } from '@dory/database/schema';
import type { PostgresDBClient } from '@dory/shared';
import type { OrganizationProvisioningKind } from '@dory/database/postgres/schemas';

type CreateProvisionedOrganizationParams = {
    auth: any;
    userId: string;
    name: string;
    slug: string;
    provisioningKind: OrganizationProvisioningKind;
    headers?: Headers;
    keepCurrentActiveOrganization?: boolean;
};

export function buildCreateOrganizationRequest(params: CreateProvisionedOrganizationParams) {
    return {
        ...(params.headers ? { headers: params.headers } : {}),
        body: {
            name: params.name,
            slug: params.slug,
            userId: params.userId,
            keepCurrentActiveOrganization: params.keepCurrentActiveOrganization ?? false,
        },
    };
}

async function getDb() {
    return (await getClient()) as PostgresDBClient;
}

export async function createProvisionedOrganization(params: CreateProvisionedOrganizationParams) {
    const created = await params.auth.api.createOrganization(buildCreateOrganizationRequest(params));

    const organizationId = created?.id ?? null;
    if (!organizationId) {
        throw new Error(`failed_to_create_organization_for_${params.userId}`);
    }

    const db = await getDb();
    await db
        .update(schema.organizations)
        .set({
            provisioningKind: params.provisioningKind,
            updatedAt: new Date(),
        })
        .where(eq(schema.organizations.id, organizationId));

    const [organization] = await db
        .select({
            id: schema.organizations.id,
            slug: schema.organizations.slug,
            name: schema.organizations.name,
            createdAt: schema.organizations.createdAt,
            provisioningKind: schema.organizations.provisioningKind,
        })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, organizationId))
        .limit(1);

    if (!organization) {
        throw new Error(`organization_not_found_for_${organizationId}`);
    }

    return organization;
}

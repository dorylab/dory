import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { schema } from '@dory/database/schema';
import { mergeAnonymousOrganizationIntoExistingOrganization, migrateAnonymousOrganizationOwnership } from '@dory/database/postgres/impl/organization/anonymous-resource-merge';
import { resolveAnonymousOrganizationLinkDecision } from '../anonymous-link-strategy';
import {
    findAnonymousOrganizationIdsForLink,
    getDb,
    normalizeAnonymousSourceOrganizations,
} from './common';
import { cleanupNonMigratedAnonymousOrganizations } from './delete';

export async function linkAnonymousOrganizationToUser(params: {
    anonymousUserId: string;
    anonymousActiveOrganizationId?: string | null;
    newUserId: string;
    newSessionToken?: string | null;
    newActiveOrganizationId?: string | null;
}) {
    console.log('[auth][anonymous-link] start', {
        anonymousUserId: params.anonymousUserId,
        anonymousActiveOrganizationId: params.anonymousActiveOrganizationId ?? null,
        newUserId: params.newUserId,
        newActiveOrganizationId: params.newActiveOrganizationId ?? null,
        hasNewSessionToken: Boolean(params.newSessionToken),
    });

    const db = await getDb();
    const sourceOrganizationIds = await findAnonymousOrganizationIdsForLink(db, {
        anonymousUserId: params.anonymousUserId,
        anonymousActiveOrganizationId: params.anonymousActiveOrganizationId,
    });

    console.log('[auth][anonymous-link] source organizations resolved', {
        anonymousUserId: params.anonymousUserId,
        sourceOrganizationIds,
    });

    if (sourceOrganizationIds.length === 0) {
        console.log('[auth][anonymous-link] no source organizations found');
        return null;
    }

    const primarySourceOrganizationId = sourceOrganizationIds[0];

    const resultOrganization = await db.transaction(async tx => {
        const preexistingMemberships = await tx
            .select({ organizationId: schema.organizationMembers.organizationId })
            .from(schema.organizationMembers)
            .where(and(eq(schema.organizationMembers.userId, params.newUserId), or(eq(schema.organizationMembers.status, 'active'), isNull(schema.organizationMembers.status))));

        const sourceOrganizationsRaw = await tx
            .select({
                id: schema.organizations.id,
                slug: schema.organizations.slug,
                name: schema.organizations.name,
                provisioningKind: schema.organizations.provisioningKind,
            })
            .from(schema.organizations)
            .where(inArray(schema.organizations.id, sourceOrganizationIds));

        const sourceOrganizationOrder = new Map(sourceOrganizationIds.map((organizationId, index) => [organizationId, index]));
        const sourceOrganizations = (await normalizeAnonymousSourceOrganizations(tx, sourceOrganizationsRaw)).sort(
            (left, right) => (sourceOrganizationOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (sourceOrganizationOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER),
        );

        if (sourceOrganizations.length === 0) {
            return null;
        }

        const primarySourceOrganization = sourceOrganizations.find(organization => organization.id === primarySourceOrganizationId) ?? sourceOrganizations[0]!;
        const targetCandidateOrganizationIds = [...new Set(preexistingMemberships.map(membership => membership.organizationId))];
        const targetCandidateOrganizations = targetCandidateOrganizationIds.length
            ? await tx
                  .select({
                      id: schema.organizations.id,
                      slug: schema.organizations.slug,
                      name: schema.organizations.name,
                      provisioningKind: schema.organizations.provisioningKind,
                  })
                  .from(schema.organizations)
                  .where(inArray(schema.organizations.id, targetCandidateOrganizationIds))
            : [];

        const linkDecision = resolveAnonymousOrganizationLinkDecision({
            sourceOrganizations,
            userOrganizations: targetCandidateOrganizations,
            newActiveOrganizationId: params.newActiveOrganizationId,
        });

        console.log('[auth][anonymous-link] decision', {
            anonymousUserId: params.anonymousUserId,
            newUserId: params.newUserId,
            sourceOrganizations: sourceOrganizations.map(organization => ({
                id: organization.id,
                provisioningKind: organization.provisioningKind,
            })),
            targetCandidateOrganizations: targetCandidateOrganizations.map(organization => ({
                id: organization.id,
                provisioningKind: organization.provisioningKind,
            })),
            linkDecision,
        });

        if (!linkDecision) {
            console.log('[auth][anonymous-link] no link decision');
            return null;
        }

        if (linkDecision.action === 'merge' && linkDecision.targetOrganizationId) {
            const mergeResults = [];

            for (const sourceOrganization of sourceOrganizations) {
                const mergeResult = await mergeAnonymousOrganizationIntoExistingOrganization(tx, {
                    sourceOrganizationId: sourceOrganization.id,
                    targetOrganizationId: linkDecision.targetOrganizationId,
                    anonymousUserId: params.anonymousUserId,
                    newUserId: params.newUserId,
                });

                await cleanupNonMigratedAnonymousOrganizations(tx, [sourceOrganization.id]);
                await tx.delete(schema.organizationMembers).where(eq(schema.organizationMembers.organizationId, sourceOrganization.id));
                await tx.delete(schema.organizations).where(eq(schema.organizations.id, sourceOrganization.id));

                mergeResults.push(mergeResult);
            }

            if (params.newSessionToken) {
                await tx
                    .update(schema.session)
                    .set({
                        activeOrganizationId: linkDecision.targetOrganizationId,
                        updatedAt: new Date(),
                    })
                    .where(eq(schema.session.token, params.newSessionToken));
            }

            console.log('[auth] merged guest organizations into existing organization', mergeResults);

            const [targetOrganization] = await tx
                .select({
                    id: schema.organizations.id,
                    slug: schema.organizations.slug,
                    name: schema.organizations.name,
                    provisioningKind: schema.organizations.provisioningKind,
                })
                .from(schema.organizations)
                .where(eq(schema.organizations.id, linkDecision.targetOrganizationId))
                .limit(1);

            return targetOrganization ?? null;
        }

        const migrationResults = [];

        for (const sourceOrganization of sourceOrganizations) {
            await tx
                .update(schema.organizations)
                .set({
                    ownerUserId: params.newUserId,
                    provisioningKind: 'anonymous_promoted',
                    updatedAt: new Date(),
                })
                .where(eq(schema.organizations.id, sourceOrganization.id));

            const [existingMembership] = await tx
                .select({ id: schema.organizationMembers.id })
                .from(schema.organizationMembers)
                .where(and(eq(schema.organizationMembers.organizationId, sourceOrganization.id), eq(schema.organizationMembers.userId, params.newUserId)))
                .limit(1);

            if (existingMembership) {
                await tx
                    .update(schema.organizationMembers)
                    .set({
                        role: 'owner',
                        status: 'active',
                        joinedAt: new Date(),
                    })
                    .where(eq(schema.organizationMembers.id, existingMembership.id));
            } else {
                await tx.insert(schema.organizationMembers).values({
                    userId: params.newUserId,
                    organizationId: sourceOrganization.id,
                    role: 'owner',
                    status: 'active',
                    joinedAt: new Date(),
                });
            }

            const migrationResult = await migrateAnonymousOrganizationOwnership(tx, {
                sourceOrganizationId: sourceOrganization.id,
                targetOrganizationId: sourceOrganization.id,
                anonymousUserId: params.anonymousUserId,
                newUserId: params.newUserId,
            });

            migrationResults.push(migrationResult);
        }

        if (params.newSessionToken) {
            await tx
                .update(schema.session)
                .set({
                    activeOrganizationId: linkDecision.primarySourceOrganizationId,
                    updatedAt: new Date(),
                })
                .where(eq(schema.session.token, params.newSessionToken));
        }

        console.log('[auth] reassigned guest organization ownership to linked user', migrationResults);

        return sourceOrganizations.find(sourceOrganization => sourceOrganization.id === linkDecision.primarySourceOrganizationId) ?? primarySourceOrganization;
    });

    console.log('[auth][anonymous-link] result organization', {
        anonymousUserId: params.anonymousUserId,
        newUserId: params.newUserId,
        resultOrganizationId: resultOrganization?.id ?? null,
        resultOrganizationSlug: resultOrganization?.slug ?? null,
    });

    return resultOrganization;
}

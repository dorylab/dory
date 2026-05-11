import type { OrganizationProvisioningKind } from '@dory/database/postgres/schemas';

export type AnonymousLinkOrganizationRecord = {
    id: string;
    provisioningKind: OrganizationProvisioningKind | null;
};

export type AnonymousOrganizationLinkDecision = {
    action: 'merge' | 'promote';
    primarySourceOrganizationId: string;
    sourceOrganizationIds: string[];
    targetOrganizationId: string | null;
};

export function resolveAnonymousOrganizationLinkDecision(input: {
    sourceOrganizations: AnonymousLinkOrganizationRecord[];
    userOrganizations: AnonymousLinkOrganizationRecord[];
    newActiveOrganizationId?: string | null;
}): AnonymousOrganizationLinkDecision | null {
    const sourceOrganizations = input.sourceOrganizations.filter(organization => organization.provisioningKind === 'anonymous');

    if (sourceOrganizations.length === 0) {
        return null;
    }

    const sourceOrganizationIds = sourceOrganizations.map(organization => organization.id);
    const sourceOrganizationIdSet = new Set(sourceOrganizationIds);
    const primarySourceOrganizationId = sourceOrganizationIds[0]!;
    const userOrganizations = input.userOrganizations.filter(organization => !sourceOrganizationIdSet.has(organization.id));

    const explicitActiveOrganization = input.newActiveOrganizationId ? (userOrganizations.find(organization => organization.id === input.newActiveOrganizationId) ?? null) : null;

    if (explicitActiveOrganization) {
        return {
            action: 'merge',
            primarySourceOrganizationId,
            sourceOrganizationIds,
            targetOrganizationId: explicitActiveOrganization.id,
        };
    }

    const systemDefaultOrganizations = userOrganizations.filter(organization => organization.provisioningKind === 'system_default');
    const hasBlockingOrganizations = userOrganizations.some(organization => organization.provisioningKind !== 'system_default');

    if (systemDefaultOrganizations.length === 1 && !hasBlockingOrganizations) {
        return {
            action: 'merge',
            primarySourceOrganizationId,
            sourceOrganizationIds,
            targetOrganizationId: systemDefaultOrganizations[0]!.id,
        };
    }

    return {
        action: 'promote',
        primarySourceOrganizationId,
        sourceOrganizationIds,
        targetOrganizationId: null,
    };
}

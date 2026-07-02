export function resolveMcpRecoveryOrganizationSlugOrId(input: {
    initialOrganizationId?: string | null;
    initialActiveOrganizationId?: string | null;
    routeOrganizationSlugOrId?: string | null;
}) {
    return input.initialOrganizationId ?? input.initialActiveOrganizationId ?? input.routeOrganizationSlugOrId ?? undefined;
}

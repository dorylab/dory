import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';
import { getSessionFromRequest } from '@/lib/auth/session';
import { getDesktopCloudStateFromFlags } from '@/lib/server/desktop-cloud';
import { getFirstOrganizationForUserState, getOrganizationBySlugOrIdState } from '@/lib/server/organization';

type SessionLike = Awaited<ReturnType<typeof getSessionFromRequest>>;

export type AppBootstrapOrganization = {
    id: string;
    slug: string;
    name: string;
} | null;

export type AppBootstrapState = {
    session: SessionLike;
    activeOrganizationId: string | null;
    organization: AppBootstrapOrganization;
    isOffline: boolean;
    canUseCloudFeatures: boolean;
};

export async function getAppBootstrapState(options?: { organizationSlugOrId?: string | null }): Promise<AppBootstrapState> {
    const session = await getSessionFromRequest();
    const activeOrganizationId = resolveCurrentOrganizationId(session);

    if (!session?.user?.id) {
        return {
            session,
            activeOrganizationId,
            organization: null,
            isOffline: false,
            canUseCloudFeatures: getDesktopCloudStateFromFlags({}).canUseCloudFeatures,
        };
    }

    const organizationState = options?.organizationSlugOrId
        ? await getOrganizationBySlugOrIdState(options.organizationSlugOrId, session.user.id)
        : activeOrganizationId
          ? await getOrganizationBySlugOrIdState(activeOrganizationId, session.user.id)
          : await getFirstOrganizationForUserState(session.user.id);

    const capabilityState = getDesktopCloudStateFromFlags({
        isOffline: organizationState.isOffline,
    });

    return {
        session,
        activeOrganizationId,
        organization: organizationState.organization,
        isOffline: capabilityState.isOffline,
        canUseCloudFeatures: capabilityState.canUseCloudFeatures,
    };
}

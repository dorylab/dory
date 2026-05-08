import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';
import { getSessionFromRequest } from '@/lib/auth/session';
import { getCloudApiBaseUrl } from '@/lib/cloud/url';
import { getRuntimeForServer } from '@/lib/runtime/runtime';
import { getFirstOrganizationForUserState, getOrganizationBySlugOrIdState } from '@/lib/server/organization';
import { resolveAppBootstrapCloudCapabilities } from './app-bootstrap.shared';

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
    const runtime = getRuntimeForServer();
    const hasCloudBaseUrl = Boolean(getCloudApiBaseUrl());

    if (!session?.user?.id) {
        const capabilityState = resolveAppBootstrapCloudCapabilities({
            runtime,
            hasCloudBaseUrl,
        });

        return {
            session,
            activeOrganizationId,
            organization: null,
            isOffline: capabilityState.isOffline,
            canUseCloudFeatures: capabilityState.canUseCloudFeatures,
        };
    }

    const organizationState = options?.organizationSlugOrId
        ? await getOrganizationBySlugOrIdState(options.organizationSlugOrId, session.user.id)
        : activeOrganizationId
          ? await getOrganizationBySlugOrIdState(activeOrganizationId, session.user.id)
          : await getFirstOrganizationForUserState(session.user.id);

    const capabilityState = resolveAppBootstrapCloudCapabilities({
        runtime,
        hasCloudBaseUrl,
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

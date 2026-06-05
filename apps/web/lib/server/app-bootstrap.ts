import { resolveCurrentOrganizationId } from '@/lib/auth/current-organization';
import { buildDesktopAuthSnapshotBootstrapState, readDesktopAuthSnapshot } from '@/lib/auth/desktop-auth-snapshot';
import { getSessionFromRequest } from '@/lib/auth/session';
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
};

export async function getAppBootstrapState(options?: { organizationSlugOrId?: string | null }): Promise<AppBootstrapState> {
    const snapshot = readDesktopAuthSnapshot();
    if (snapshot?.user.id) {
        const snapshotState = buildDesktopAuthSnapshotBootstrapState(snapshot, options);

        return {
            session: snapshotState.session as unknown as SessionLike,
            activeOrganizationId: snapshotState.activeOrganizationId,
            organization: snapshotState.organization,
        };
    }

    const session = await getSessionFromRequest();
    const activeOrganizationId = resolveCurrentOrganizationId(session);

    if (!session?.user?.id) {
        return {
            session,
            activeOrganizationId,
            organization: null,
        };
    }

    const organizationState = options?.organizationSlugOrId
        ? await getOrganizationBySlugOrIdState(options.organizationSlugOrId, session.user.id)
        : activeOrganizationId
          ? await getOrganizationBySlugOrIdState(activeOrganizationId, session.user.id)
          : await getFirstOrganizationForUserState(session.user.id);

    return {
        session,
        activeOrganizationId,
        organization: organizationState.organization,
    };
}

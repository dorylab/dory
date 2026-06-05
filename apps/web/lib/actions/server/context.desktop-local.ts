import type { ActionDefinition, ActionId } from '@dory/actions';
import { readDesktopAuthSnapshot, type DesktopAuthSnapshot } from '@/lib/auth/desktop-auth-snapshot';
import { webActionRegistry } from './registry';
import type { WebActionServices } from './types';

type DesktopLocalActionBody = {
    actionId?: string | null;
    organizationId?: string | null;
};

export function getDesktopLocalWorkspaceAction(actionId?: string | null): ActionDefinition<any, any, WebActionServices> | null {
    if (!actionId) return null;

    const action = webActionRegistry.get(actionId as ActionId);
    return action?.desktopAuth === 'local-workspace' ? action : null;
}

export function resolveDesktopLocalActionSnapshot(
    body: DesktopLocalActionBody,
    options: { snapshot?: DesktopAuthSnapshot | null } = {},
) {
    const action = getDesktopLocalWorkspaceAction(body.actionId);
    if (!action) return null;

    const snapshot = options.snapshot ?? readDesktopAuthSnapshot();
    if (!snapshot?.user.id || !snapshot.access?.isMember) return null;

    const organizationId = body.organizationId ?? snapshot.activeOrganizationId;
    if (!organizationId || organizationId !== snapshot.access.organizationId) {
        return null;
    }

    if (snapshot.access.userId !== snapshot.user.id) {
        return null;
    }

    return {
        action,
        userId: snapshot.user.id,
        organizationId,
        access: snapshot.access,
    };
}

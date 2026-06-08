import { executeActionClient } from '@/lib/actions/client';
import { normalizeWorkspaceScope, workspaceScopeKey, type UITabPayload, type WorkspaceScope } from '@dory/shared/types/tabs';

export const SQL_TABS_PREFETCH_STALE_TIME_MS = 5_000;

export function sqlTabsQueryKey(connectionId: string, workspaceScope?: WorkspaceScope | null) {
    return ['sql-console', 'tabs', connectionId, workspaceScopeKey(workspaceScope)] as const;
}

export function fetchSqlTabs(connectionId: string, workspaceScope?: WorkspaceScope | null) {
    const normalizedWorkspaceScope = normalizeWorkspaceScope(workspaceScope);

    return executeActionClient<UITabPayload[]>(
        'tab.list',
        {
            connectionId,
            workspaceScope: normalizedWorkspaceScope,
        },
        {
            currentConnectionId: connectionId,
        },
    );
}

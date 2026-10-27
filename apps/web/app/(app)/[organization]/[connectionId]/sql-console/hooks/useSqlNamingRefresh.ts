'use client';

import { useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SQLTab } from '@dory/shared/types/tabs';
import { executeActionClient } from '@/lib/actions/client';
import type { ResultSetMeta } from '@/lib/client/type';
import { SQL_CONSOLE_NAMES_UPDATED_EVENT } from '@/lib/client/sql-console-result-store';
import { sessionIdByTabAtom } from '../sql-console.store';
import type { SqlWorkspaceScope } from '../workspace-scope';

export function useSqlNamingRefresh(tabs: SQLTab[], runningTabs: Record<string, string>, scope: SqlWorkspaceScope, applyTabNames: (tabs: SQLTab[]) => void) {
    const sessionsByTab = useAtomValue(sessionIdByTabAtom);
    const queryClient = useQueryClient();
    const connectionId = scope.connectionId ?? tabs[0]?.connectionId;
    const workId = scope.workspaceMode === 'agent' ? (scope.workId ?? null) : null;
    const sessionIds = [...new Set(tabs.map(tab => sessionsByTab[tab.tabId]).filter((id): id is string => Boolean(id)))].sort();
    const hasRunning = tabs.some(tab => runningTabs[tab.tabId] === 'running');
    const names = useQuery({
        queryKey: ['sql-auto-names', connectionId, workId, sessionIds, hasRunning],
        enabled: Boolean(connectionId) && (sessionIds.length > 0 || tabs.some(tab => tab.namingSource === 'pending')),
        queryFn: async ({ signal }) => {
            const [serverTabs, sessions] = await Promise.all([
                executeActionClient<SQLTab[]>('tab.list', { connectionId, workId }, { currentConnectionId: connectionId, signal }),
                Promise.all(
                    sessionIds.map(async sessionId => ({
                        sessionId,
                        ...(await executeActionClient<{ resultSets: ResultSetMeta[] }>('query.resultSets.list', { sessionId, includeProfile: false }, { signal })),
                    })),
                ),
            ]);
            return { serverTabs, sessions };
        },
        refetchInterval: query =>
            query.state.dataUpdateCount < 21 &&
            (hasRunning ||
                !query.state.data ||
                query.state.data.serverTabs.some(tab => tab.namingSource === 'pending') ||
                query.state.data.sessions.some(session => session.resultSets.some(set => set.namingSource === 'pending')))
                ? 1000
                : false,
        retry: false,
        refetchOnWindowFocus: false,
    });
    useEffect(() => {
        if (!names.data) return;
        applyTabNames(names.data.serverTabs);
        for (const session of names.data.sessions) window.dispatchEvent(new CustomEvent(SQL_CONSOLE_NAMES_UPDATED_EVENT, { detail: session }));
        void queryClient.invalidateQueries({ predicate: query => query.queryKey[0] === 'artifacts' || query.queryKey[0] === 'artifact' });
    }, [names.data, applyTabNames, queryClient]);
}

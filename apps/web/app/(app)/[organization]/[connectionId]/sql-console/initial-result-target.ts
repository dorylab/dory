import type { UITabPayload } from '@dory/shared/types/tabs';

export type SqlWorkspaceInitialResultTarget = {
    tabId: string;
    sessionId: string;
    setIndex: number;
    sql: string | null;
    title: string;
};

export function resolveInitialResultTargetTabId(tabs: UITabPayload[], sessionIdByTab: Record<string, string>, target: SqlWorkspaceInitialResultTarget): string | null {
    const exactTab = tabs.find(tab => tab.tabType === 'sql' && tab.tabId === target.tabId);
    if (exactTab) return exactTab.tabId;

    const restoredTab = tabs.find(tab => tab.tabType === 'sql' && (tab.sessionId === target.sessionId || sessionIdByTab[tab.tabId] === target.sessionId));
    return restoredTab?.tabId ?? null;
}

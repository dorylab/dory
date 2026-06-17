import type { DBService } from '@dory/database';
import { workspaceScopeKey, type TabResultMetaPayload, type UITabPayload } from '@dory/shared/types/tabs';
import type { WorkWorkspaceSnapshot } from '@dory/database/postgres/schemas';

export type WorkWorkspaceSummaryTab = {
    tabId: string;
    title: string;
    status: string;
    rows: number | null;
    columns: number | null;
    resultMeta: Record<string, unknown> | null;
    updatedAt: Date | null;
};

export type WorkWorkspaceSummary = {
    workspaceId: string;
    tabs: WorkWorkspaceSummaryTab[];
    tabCount: number;
    resultCount: number;
    unsyncedCount: number;
    activeTabId: string | null;
    recentSnapshots: WorkWorkspaceSnapshot[];
    latestAcknowledgedAgentEventId: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function toDate(value: unknown): Date | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isFinite(date.getTime()) ? date : null;
}

function tabStatus(tab: UITabPayload) {
    return tab.workSyncState ?? tab.status ?? 'synced';
}

function isMeaningfulWorkSqlTab(tab: Extract<UITabPayload, { tabType: 'sql' }>) {
    if (tab.content?.trim()) return true;
    if (tab.resultMeta?.sessionId || tab.sessionId) return true;
    if (tab.resultMeta?.source === 'work-run') return true;
    if (tab.lastAgentRunId || tab.lastAgentEventId || tab.lastAgentSyncedAt) return true;
    return false;
}

function summarizeTab(tab: UITabPayload): WorkWorkspaceSummaryTab {
    const typedResultMeta = tab.tabType === 'sql' ? (tab.resultMeta as TabResultMetaPayload | null | undefined) : null;
    const resultMeta = asRecord(typedResultMeta);
    return {
        tabId: tab.tabId,
        title: tab.tabName?.trim() || 'Untitled SQL tab',
        status: tabStatus(tab),
        rows: typeof typedResultMeta?.rows === 'number' ? typedResultMeta.rows : null,
        columns: typeof typedResultMeta?.columns === 'number' ? typedResultMeta.columns : null,
        resultMeta,
        updatedAt: toDate(tab.updatedAt),
    };
}

export async function getWorkWorkspaceSummary(input: {
    db: DBService;
    organizationId: string;
    userId: string;
    workId: string;
    connectionId: string;
    limitSnapshots?: number;
}): Promise<WorkWorkspaceSummary> {
    const workspaceScope = { type: 'work' as const, workId: input.workId };
    const tabs = (await input.db.tabState.loadAllTab(input.userId, input.connectionId, workspaceScope)) as unknown as UITabPayload[];
    const sqlTabs = tabs.filter((tab): tab is Extract<UITabPayload, { tabType: 'sql' }> => tab.tabType === 'sql').filter(isMeaningfulWorkSqlTab);
    const snapshots = await input.db.works.listWorkspaceSnapshots({
        organizationId: input.organizationId,
        workId: input.workId,
        limit: input.limitSnapshots ?? 5,
    });
    const latestAcknowledgedAgentEventId = tabs.map(tab => tab.lastAgentEventId).find((eventId): eventId is string => typeof eventId === 'string' && eventId.length > 0) ?? null;

    return {
        workspaceId: workspaceScopeKey(workspaceScope),
        tabs: sqlTabs.map(summarizeTab),
        tabCount: sqlTabs.length,
        resultCount: sqlTabs.filter(tab => Boolean(tab.resultMeta?.sessionId || tab.sessionId)).length,
        unsyncedCount: sqlTabs.filter(tab => tab.workSyncState === 'unsynced' || tab.workSyncState === 'human_edited').length,
        activeTabId: sqlTabs[0]?.tabId ?? null,
        recentSnapshots: snapshots,
        latestAcknowledgedAgentEventId,
    };
}

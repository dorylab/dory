import type { TabPayload, UITabPayload } from '@dory/shared/types/tabs';

const SQL_TABS_CACHE_VERSION = 1;

type SqlTabsCache = {
    version: typeof SQL_TABS_CACHE_VERSION;
    tabs: TabPayload[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeCachedTab(value: unknown): UITabPayload | null {
    if (!isRecord(value) || typeof value.tabId !== 'string' || typeof value.connectionId !== 'string') return null;

    const base = {
        tabId: value.tabId,
        userId: typeof value.userId === 'string' ? value.userId : '',
        connectionId: value.connectionId,
        workId: typeof value.workId === 'string' ? value.workId : null,
        tabName: typeof value.tabName === 'string' ? value.tabName : undefined,
        orderIndex: typeof value.orderIndex === 'number' ? value.orderIndex : undefined,
        createdAt: typeof value.createdAt === 'string' ? value.createdAt : undefined,
        updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : undefined,
    };

    if (value.tabType === 'sql') {
        return {
            ...base,
            tabType: 'sql',
            content: typeof value.content === 'string' ? value.content : '',
            status: value.status === 'running' || value.status === 'error' || value.status === 'success' ? value.status : 'idle',
            resultMeta: isRecord(value.resultMeta) ? value.resultMeta : undefined,
        } as UITabPayload;
    }

    if (value.tabType === 'table') {
        return {
            ...base,
            tabType: 'table',
            databaseName: typeof value.databaseName === 'string' ? value.databaseName : undefined,
            tableName: typeof value.tableName === 'string' ? value.tableName : undefined,
            activeSubTab:
                value.activeSubTab === 'overview' ||
                value.activeSubTab === 'data' ||
                value.activeSubTab === 'structure' ||
                value.activeSubTab === 'indexes' ||
                value.activeSubTab === 'stats'
                    ? value.activeSubTab
                    : undefined,
            dataView: isRecord(value.dataView) ? value.dataView : undefined,
        } as UITabPayload;
    }

    return null;
}

export function serializeSqlTabsCache(tabs: UITabPayload[], toPersistedTab: (tab: UITabPayload, index: number) => TabPayload) {
    const payload: SqlTabsCache = {
        version: SQL_TABS_CACHE_VERSION,
        tabs: tabs.map(toPersistedTab),
    };
    return JSON.stringify(payload);
}

export function parseSqlTabsCache(raw: string | null): UITabPayload[] {
    if (!raw) return [];

    try {
        const payload: unknown = JSON.parse(raw);
        if (!isRecord(payload) || payload.version !== SQL_TABS_CACHE_VERSION || !Array.isArray(payload.tabs)) return [];

        return payload.tabs.flatMap(tab => {
            const normalized = normalizeCachedTab(tab);
            return normalized ? [normalized] : [];
        });
    } catch {
        return [];
    }
}

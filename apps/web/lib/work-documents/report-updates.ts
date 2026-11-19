import type { ReportUpdateContext, ReportUpdateItem, StoredReportUpdate } from '@dory/shared/types/report-updates';

export function sameReportSql(left: string | null | undefined, right: string | null | undefined) {
    return typeof left === 'string' && typeof right === 'string' && left.trim().replace(/;+$/, '').trimEnd() === right.trim().replace(/;+$/, '').trimEnd();
}

export function updateReady(item: ReportUpdateItem) {
    return !item.needsReview && item.results.length > 0 && item.executedSql === item.sql;
}

// Older drafts staged individual results. Recover their SQL and require a fresh full-tab run.
export function recoverTabUpdates(stored: StoredReportUpdate[], bindings: ReportUpdateContext['bindings']) {
    const tabs = new Map<string, ReportUpdateItem>();
    for (const item of stored) {
        if ('results' in item) {
            tabs.set(item.tabId, item);
            continue;
        }
        const source = bindings[item.originalArtifactId ?? ''];
        if (item.sql === source?.sql || !item.sql.trim()) continue;
        tabs.set(item.tabId, {
            id: item.id,
            tabId: item.tabId,
            sourceTabId: source?.tabId ?? item.tabId,
            title: item.title,
            originalSql: source?.sql ?? null,
            sql: item.sql,
            results: [],
        });
    }
    return [...tabs.values()];
}

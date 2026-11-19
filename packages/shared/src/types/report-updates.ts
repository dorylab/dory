import type { WorkDocumentView } from './work-document';
import type { WorkspaceChartSpec } from './workspace-chart';

export type ReportResultPointer = {
    tabId: string;
    sessionId: string;
    setIndex: number;
    resultSetId: string;
    sql: string;
    rowCount: number;
    connectionId: string;
    database: string | null;
};

export type LegacyReportUpdateItem = {
    id: string;
    tabId: string;
    setIndex: number;
    title: string;
    sql: string;
    originalArtifactId?: string;
    result?: ReportResultPointer;
    // Full editor text at execution time; result.sql is the individual statement.
    executedSql?: string;
    chart?: WorkspaceChartSpec;
    insertSection?: string;
    selected: boolean;
    needsReview?: boolean;
    locations: string[];
    eligibleLocations?: string[];
};

export type ReportUpdateItem = {
    id: string;
    tabId: string;
    sourceTabId: string;
    title: string;
    originalSql: string | null;
    sql: string;
    executedSql?: string;
    results: ReportResultPointer[];
    needsReview?: boolean;
};

export type StoredReportUpdate = ReportUpdateItem | LegacyReportUpdateItem;

export function reportUpdateResults(item: StoredReportUpdate) {
    return 'results' in item ? item.results : item.result ? [item.result] : [];
}

export type ReportUpdateContext = {
    document: Pick<WorkDocumentView, 'id' | 'title' | 'revision' | 'content'>;
    latestRevision: number;
    baseRevision: number;
    draftRevision: number;
    userId: string;
    bindings: Record<string, ReportResultPointer>;
    items: ReportUpdateItem[];
};

export const reportWorkspaceRunId = (documentId: string) => 'report_' + documentId;

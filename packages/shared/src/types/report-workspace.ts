import type { ConnectionType } from './connections';
import type { WorkEvidence } from './work-document';

export type ReportEvidenceReference = {
    documentId: string;
    artifactId: string;
    revision: number;
    publicationId?: string;
    snapshotId?: string;
};
export type ReportWorkspaceSource =
    | { kind: 'attachment'; dialect: 'duckdb' }
    | { kind: 'database'; connectionId: string; database: string | null; dialect: ConnectionType }
    | { kind: 'unavailable'; reason: string };
export type ReportWorkspaceContext = {
    reference: ReportEvidenceReference;
    title: string;
    evidence: WorkEvidence;
    source: ReportWorkspaceSource;
};
export type ReportWorkspaceSourceInfo = {
    available: boolean;
    reason?: string;
    tables: Array<{ name: string; filename: string; columns: Array<{ name: string; type: string }> }>;
};
export type ReportWorkspaceResult = {
    sessionId: string;
    sets: Array<{
        resultSetId: string | null;
        sql: string;
        columns: Array<{ name: string; type: string }>;
        rows: Record<string, unknown>[];
        rowCount: number;
        limited: boolean;
        error?: string;
    }>;
};

export type ReportQueryTab = {
    id: string;
    title: string;
    sourceArtifactId: string;
    copiedFromId?: string;
    snapshotArtifactId?: string;
    sql: string;
    hidden: boolean;
    candidateId?: string;
    appliedId?: string;
    componentIds: string[];
};
export type ReportWorkingState = {
    title: string;
    content: import('./work-document').WorkDocumentContent;
    tabs: ReportQueryTab[];
    activeTabId: string | null;
    proseNeedsReview: boolean;
};
export type ReportWorkingDraft = {
    userId: string;
    documentId: string;
    baseRevision: number;
    expectedReportRevision: number;
    revision: number;
    state: ReportWorkingState;
    results: Record<string, { sourceArtifactId: string; evidence: WorkEvidence }>;
};
export type ReportAnalysisContext = {
    draft: ReportWorkingDraft;
    sources: ReportWorkspaceContext[];
};

import type { ConnectionType } from './connections';
import type { WorkEvidence } from './work-document';
import type { WorkspaceChart } from './workspace-chart';

export type ReportEvidenceReference = {
    documentId: string;
    artifactId: string;
    revision: number;
    publicationId?: string;
    snapshotId?: string;
    componentId?: string;
    groupId?: string;
};
export type ReportEvidenceInspection = {
    evidence: WorkEvidence;
    artifactAvailable: boolean;
    fullResultAvailable: boolean;
    canOpenWorkspace: boolean;
};
export type ReportEvidenceRows = {
    columns: string[];
    rows: Record<string, unknown>[];
    rowCount: number | null;
    offset: number;
    limit: number;
};
export type ReportArtifactUsage = { id: string; title: string; revision?: number; publicationId?: string };
export type ReportWorkspaceSource =
    | { kind: 'attachment'; dialect: 'duckdb' }
    | { kind: 'database'; connectionId: string; database: string | null; schema?: string | null; dialect: ConnectionType }
    | { kind: 'unavailable'; reason: string };
export type ReportWorkspaceContext = {
    reference: ReportEvidenceReference;
    title: string;
    evidence: WorkEvidence;
    source: ReportWorkspaceSource;
};
export type ReportWorkspaceSourceInfo = {
    source?: ReportWorkspaceSource;
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
    source?: ReportWorkspaceSource;
    resultIds?: string[];
    selectedResultId?: string;
    copiedFromId?: string;
    snapshotArtifactId?: string;
    sql: string;
    hidden: boolean;
    candidateId?: string;
    appliedId?: string;
    componentIds: string[];
};
export type ReportCanvasBlock = { id: string; source: string; kind: string; title: string; visualId?: string };
export type ReportCanvasState = {
    blocks: ReportCanvasBlock[];
    baselineBlocks: ReportCanvasBlock[];
    baselineRevision: number;
    undo?: { content: import('./work-document').WorkDocumentContent; blocks: ReportCanvasBlock[]; proseNeedsReview: boolean };
};
export type ReportWorkingState = {
    canvas?: ReportCanvasState;
    title: string;
    bindingVersion?: 2;
    baseline?: { revision: number; title: string; content: import('./work-document').WorkDocumentContent };
    charts?: WorkspaceChart[];
    content: import('./work-document').WorkDocumentContent;
    tabs: ReportQueryTab[];
    activeTabId: string | null;
    proseNeedsReview: boolean;
    applyTarget?: ReportApplyTarget;
};
export type ReportWorkingDraft = {
    id?: string;
    userId: string;
    documentId: string;
    baseRevision: number;
    expectedReportRevision: number;
    revision: number;
    state: ReportWorkingState;
    results: Record<string, { sourceArtifactId: string; sessionId?: string; tabId?: string; evidence: WorkEvidence }>;
};
export type ReportAnalysisContext = {
    draft: ReportWorkingDraft;
    sources: ReportWorkspaceContext[];
};

export type ReportApplyTarget = { artifactId: string; componentId?: string; groupId?: string };

/** Session-wide report association; tab sources and execution are independent. */
export type ReportContext = {
    reportId: string;
    draftId: string;
    baseRevision: number;
    originBlockId?: string;
    originArtifactId?: string;
};

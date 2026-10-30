import type { ChatAttachmentSource } from './chat-attachment';

export type AnalysisScope = {
    connectionMode?: 'auto' | 'manual';
    knowledgeMode?: 'auto' | 'manual' | 'none';
    connectionIds: string[];
    knowledgeModelId?: string | null;
    databasesByConnection?: Record<string, string | string[]>;
};
export type WorkEvidence = {
    snapshotId?: string;
    sourceDatabaseName?: string | null;
    columnTypes?: Array<{ name: string; type: string }>;
    dataRange?: { from?: string; through?: string };
    attachmentSource?: ChatAttachmentSource;
    artifactId: string;
    title: string;
    connectionId: string | null;
    connectionName: string | null;
    sql: string | null;
    capturedAt: string;
    columns: string[];
    rows: Record<string, unknown>[];
    rowCount: number | null;
    truncated: boolean;
    runId: string | null;
};
export type WorkVisual = {
    id: string;
    type: 'metric' | 'chart' | 'table';
    title: string;
    evidenceId: string;
    chart?: { type: 'bar' | 'line' | 'area' | 'pie'; xKey: string } & ({ yKey: string; yKeys?: never } | { yKey?: never; yKeys: Array<{ key: string; label?: string }> });
    metric?: {
        column: string;
        rowIndex: number;
        format?: 'number' | 'percent' | 'currency';
        precision?: number;
        currency?: string;
        percentScale?: 'ratio' | 'whole';
        unit?: string;
        comparison?: { column: string; rowIndex: number };
        items?: Array<{ column: string; rowIndex: number; label: string }>;
    };
    allowSubset?: boolean;
};
export type ReportEmbed =
    | { type: 'metric'; artifactId: string; snapshotId: string; config: { title: string; metric: NonNullable<WorkVisual['metric']>; allowSubset?: boolean } }
    | { type: 'chart'; artifactId: string; snapshotId: string; config: { title: string; chart: NonNullable<WorkVisual['chart']>; allowSubset?: boolean } }
    | { type: 'table'; artifactId: string; snapshotId: string; config: { title: string; allowSubset?: boolean } };
export type ReportDiagnostic = { message: string; line?: number; column?: number };
export type WorkDocumentContent = {
    workspaceOrigin?: { baseRevision: number; draftRevision: number };
    sourceWorkId?: string;
    format?: 'restricted-mdx';
    schemaVersion?: 1;
    body?: string;
    embeds?: Record<string, ReportEmbed>;
    diagnostics?: ReportDiagnostic[];
    agentWrite?: { requestId: string; revision: number; visualIds: string[]; writeKey?: string };
    markdown: string;
    visuals: WorkVisual[];
    evidence: WorkEvidence[];
    knowledge: Array<{ ref: string; title: string; revision: string; content: string }>;
};
export type WorkDocumentView = {
    id: string;
    title: string;
    chatId: string | null;
    scope: AnalysisScope;
    content: WorkDocumentContent;
    revision: number;
    /** Legacy history grouping; explicit publications use publication.number. */
    version?: number;
    publishedVersionId?: string | null;
    publication?: { id: string; number: number; publishedAt: string };
    status: 'draft' | 'ready';
    archivedAt: string | null;
    createdAt: string;
    updatedAt: string;
};
export type WorkDocumentSummary = Omit<WorkDocumentView, 'content'> & { sourceMessageId?: string | null; summary?: string; sourceLabels?: string[] };

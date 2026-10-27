import type { ChatAttachmentSource } from './chat-attachment';
export type AnalysisScope = {
    connectionMode?: 'auto' | 'manual';
    knowledgeMode?: 'auto' | 'manual' | 'none';
    connectionIds: string[];
    knowledgeModelId?: string | null;
    databasesByConnection?: Record<string, string | string[]>;
};
export type WorkEvidence = {
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
    metric?: { column: string; rowIndex: number };
};
export type WorkDocumentContent = {
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
    status: 'draft' | 'ready';
    archivedAt: string | null;
    createdAt: string;
    updatedAt: string;
};
export type WorkDocumentSummary = Omit<WorkDocumentView, 'content'> & { sourceMessageId?: string | null; summary?: string };

export type AgentWorkStatus = 'running' | 'partial' | 'completed' | 'failed' | 'stopped' | 'idle';

export type AgentWorkOutput = {
    id: string;
    type: 'report' | 'chart' | 'result';
    title: string;
    available: boolean;
    origin: { kind: 'report'; documentId: string; visualId?: string } | { kind: 'artifact'; artifactId: string } | { kind: 'message'; messageId: string; toolCallId: string };
};

export type AgentWorkSummary = {
    id: string;
    title: string | null;
    titlePending: boolean;
    status: AgentWorkStatus;
    updatedAt: string;
    counts: { report: number; chart: number; result: number };
    outputs: AgentWorkOutput[];
};

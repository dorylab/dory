import type { AgentWorkOutput, AgentWorkStatus, AgentWorkSummary } from '@dory/shared/types/agent-work';

export function workStatus(status: string | null | undefined, metadata: Record<string, unknown> | null): AgentWorkStatus {
    const turn = metadata?.chatTurn as { outcome?: string; completion?: { status: string } } | undefined;
    if (status === 'active') return 'running';
    if (turn?.completion?.status === 'partial') return 'partial';
    if (turn?.completion?.status === 'completed') return 'completed';
    if (turn?.outcome === 'aborted') return 'stopped';
    return status === 'completed' ? 'completed' : status === 'error' ? 'failed' : 'idle';
}

export function workCounts(outputs: AgentWorkOutput[]): AgentWorkSummary['counts'] {
    return outputs.reduce((counts, output) => ({ ...counts, [output.type]: counts[output.type] + 1 }), { report: 0, chart: 0, result: 0 });
}

export function searchWorks(works: AgentWorkSummary[], query: string) {
    const normalized = query.trim().toLocaleLowerCase();
    return works.flatMap(work => {
        const titleMatch = (work.title ?? '').toLocaleLowerCase().includes(normalized);
        const output = normalized ? work.outputs.find(item => item.title.toLocaleLowerCase().includes(normalized)) : undefined;
        return !normalized || titleMatch || output ? [{ work, matchedOutput: !titleMatch ? output?.title : undefined }] : [];
    });
}

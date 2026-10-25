/** Public local-agent activity. Never includes reasoning or raw process logs. */
export type ChatProgressEntry = {
    id: string;
    sequence: number;
    revision: number;
    kind: 'text' | 'tool';
    phase?: 'commentary' | 'final';
    text?: string;
    toolName?: string;
    state?: 'running' | 'completed' | 'failed';
    eventId?: string;
    coveredActionIds?: string[];
};

export function mergeChatProgress(existing: ChatProgressEntry[], incoming: ChatProgressEntry[]): ChatProgressEntry[] {
    const entries = new Map(existing.map(entry => [entry.id, entry]));
    for (const entry of incoming) {
        const prior = entries.get(entry.id);
        if (!prior || entry.revision > prior.revision) entries.set(entry.id, prior ? { ...entry, sequence: prior.sequence } : entry);
    }
    return [...entries.values()].sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
}

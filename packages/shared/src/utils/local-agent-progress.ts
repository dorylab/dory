import type { ChatProgressEntry } from '../types/chat-progress';

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function activityId(result: unknown): string | undefined {
    const value = record(result);
    if (typeof value.activityEventId === 'string') return value.activityEventId;
    const details = record(record(value.error).details);
    if (typeof details.activityEventId === 'string') return details.activityEventId;
    const structured = record(value.structuredContent);
    if (typeof structured.activityEventId === 'string') return structured.activityEventId;
    const errorDetails = record(record(structured.error).details);
    if (typeof errorDetails.activityEventId === 'string') return errorDetails.activityEventId;
    if (Array.isArray(value.content))
        for (const content of value.content) {
            const text = record(content).text;
            if (typeof text === 'string')
                try {
                    const id = activityId(JSON.parse(text));
                    if (id) return id;
                } catch {
                    /* Non-JSON tool output. */
                }
        }
    return undefined;
}

/** Incremental JSONL decoder for public Codex/Claude messages and tool lifecycle. */
export function createLocalAgentProgressParser(emit: (entry: ChatProgressEntry) => void) {
    let buffer = '';
    let sequence = 0;
    const entries = new Map<string, ChatProgressEntry>();
    const update = (id: string, patch: Omit<ChatProgressEntry, 'id' | 'sequence' | 'revision'>) => {
        const prior = entries.get(id);
        const entry = { ...prior, ...patch, id, sequence: prior?.sequence ?? sequence++, revision: (prior?.revision ?? 0) + 1 };
        entries.set(id, entry);
        emit(entry);
    };
    const accept = (raw: unknown) => {
        const event = record(raw);
        const item = record(event.item);
        if (typeof item.id === 'string' && ['item.started', 'item.updated', 'item.completed'].includes(String(event.type))) {
            if (item.type === 'agent_message' && typeof item.text === 'string') {
                update(item.id, { kind: 'text', text: item.text, phase: item.phase === 'final_answer' ? 'final' : 'commentary' });
            } else if (item.type === 'mcp_tool_call' && typeof item.tool === 'string') {
                // Stage explanations are rendered from the server-owned checkpoint record.
                if (item.tool.endsWith('dory_publish_progress')) return;
                update(item.id, {
                    kind: 'tool',
                    toolName: item.tool,
                    state:
                        event.type !== 'item.completed'
                            ? 'running'
                            : item.status === 'failed' || item.error || record(item.result).isError === true || record(record(item.result).structuredContent).ok === false
                              ? 'failed'
                              : 'completed',
                    eventId: activityId(item.result),
                });
            }
        }
        // Claude's public assistant content; thinking blocks are deliberately ignored.
        if (event.type === 'assistant') {
            const message = record(event.message);
            if (typeof message.id === 'string' && Array.isArray(message.content))
                message.content.forEach((raw, index) => {
                    const block = record(raw);
                    if (block.type === 'text' && typeof block.text === 'string') update(`${message.id}:${index}`, { kind: 'text', text: block.text, phase: 'commentary' });
                });
        }
    };
    return {
        push(chunk: string) {
            buffer += chunk;
            if (buffer.length > 2 * 1024 * 1024) throw new Error('Local agent event exceeded the maximum size.');
            let end: number;
            while ((end = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, end);
                buffer = buffer.slice(end + 1);
                try {
                    accept(JSON.parse(line));
                } catch (error) {
                    if (!(error instanceof SyntaxError)) throw error;
                }
            }
        },
        finish(finalText: string) {
            if (buffer.trim()) {
                try {
                    accept(JSON.parse(buffer));
                } catch (error) {
                    if (!(error instanceof SyntaxError)) throw error;
                }
                buffer = '';
            }
            const last = [...entries.values()].filter(entry => entry.kind === 'text').at(-1);
            if (last && last.text?.trim() === finalText.trim()) update(last.id, { kind: 'text', text: finalText, phase: 'final' });
            else if (finalText.trim()) update('final-answer', { kind: 'text', text: finalText, phase: 'final' });
        },
    };
}

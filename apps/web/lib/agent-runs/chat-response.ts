import { getChartOverride, readStoredChart } from '@dory/shared/utils/chat-chart';
import type { UIMessage } from 'ai';

/** Read the agent-authored final answer, never infer findings from query output. */
export function getChatResponseText(parts: unknown): string {
    if (!Array.isArray(parts)) return '';
    for (const part of [...parts].reverse()) {
        if (!part || typeof part !== 'object') continue;
        const value = part as Record<string, unknown>;
        const output = value.output;
        if ((value.type === 'tool-finishAnalysis' || value.toolName === 'finishAnalysis') && output && typeof output === 'object') {
            const result = output as Record<string, unknown>;
            if (result.ok === true && typeof result.finalAnswer === 'string') return result.finalAnswer;
        }
    }
    const failedIndex = parts.reduce((last, part, index) => (part?.type === 'tool-finishAnalysis' || part?.toolName === 'finishAnalysis' ? index : last), -1);
    const reply = parts
        .slice(failedIndex + 1)
        .filter(part => part?.type === 'text' && typeof part.text === 'string')
        .map(part => part.text)
        .join('\n\n');
    if (reply.trim()) return reply;
    // A failed finalization still contains an agent-authored answer in its input.
    for (const part of [...parts].reverse()) {
        if ((part?.type === 'tool-finishAnalysis' || part?.toolName === 'finishAnalysis') && typeof part.input?.finalAnswer === 'string') return part.input.finalAnswer;
    }
    return parts
        .filter(part => part?.type === 'text' && typeof part.text === 'string')
        .map(part => part.text)
        .join('\n\n');
}

/** Aborted historical calls cannot be replayed as unresolved model tool calls. */
export function prepareChatHistory(messages: UIMessage[]): UIMessage[] {
    return messages
        .map(message => ({
            ...message,
            parts: message.parts
                .flatMap((part): UIMessage['parts'] => {
                    if (!('toolCallId' in part) || typeof part.toolCallId !== 'string' || !readStoredChart(part)) return [part];
                    const saved = getChartOverride(message.metadata, part.toolCallId);
                    return saved.presentation
                        ? [
                              part,
                              {
                                  type: 'text',
                                  text: `User-saved chart presentation for ${part.toolCallId} (display settings only; query data unchanged): ${JSON.stringify(saved.presentation)}`,
                              },
                          ]
                        : [part];
                })
                .filter(part => {
                    if (part.type !== 'dynamic-tool' && !part.type.startsWith('tool-')) return true;
                    // Failed JSON generation has rawInput but no valid input. Replaying
                    // it poisons the next provider request instead of allowing a retry.
                    if (!('input' in part) || !part.input || typeof part.input !== 'object' || Array.isArray(part.input)) return false;
                    return 'state' in part && typeof part.state === 'string' && ['output-available', 'output-error', 'output-denied'].includes(part.state);
                }),
        }))
        .filter(message => message.parts.length > 0);
}

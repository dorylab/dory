import type { UIMessageChunk } from 'ai';

/** MCP providers emit their reply separately from tool execution. Prefer the saved answer. */
export function alignChatAnswerStream(loadSavedAnswer: () => Promise<string | null>) {
    let fallback = '';
    let emitted = false;
    const emit = async (controller: TransformStreamDefaultController<UIMessageChunk>) => {
        if (emitted) return;
        emitted = true;
        const text = (await loadSavedAnswer()) ?? fallback;
        if (!text) return;
        const id = 'agent-final-answer';
        controller.enqueue({ type: 'text-start', id });
        controller.enqueue({ type: 'text-delta', id, delta: text });
        controller.enqueue({ type: 'text-end', id });
    };
    return new TransformStream<UIMessageChunk, UIMessageChunk>({
        async transform(chunk, controller) {
            if (chunk.type === 'text-delta') {
                fallback += chunk.delta;
                return;
            }
            if (chunk.type === 'text-start' || chunk.type === 'text-end') return;
            if (chunk.type === 'finish' || chunk.type === 'abort') await emit(controller);
            controller.enqueue(chunk);
        },
        flush: emit,
    });
}

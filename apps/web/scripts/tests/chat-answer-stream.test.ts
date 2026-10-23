import assert from 'node:assert/strict';
import test from 'node:test';
import type { UIMessageChunk } from 'ai';

import { getChatResponseText, prepareChatHistory } from '@/lib/agent-runs/chat-response';
import { alignChatAnswerStream } from '@/lib/server/chat-answer-stream';

async function answer(saved: string | null, abort = false) {
    const stream = new ReadableStream<UIMessageChunk>({
        start(controller) {
            controller.enqueue({ type: 'text-start', id: 'text' });
            controller.enqueue({ type: 'text-delta', id: 'text', delta: 'Provider wording' });
            controller.enqueue({ type: 'text-end', id: 'text' });
            controller.enqueue(abort ? { type: 'abort' } : { type: 'finish' });
            controller.close();
        },
    }).pipeThrough(alignChatAnswerStream(async () => saved));
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return chunks;
}

test('local MCP providers display the saved final answer verbatim', async () => {
    const chunks = await answer('Saved answer');
    assert.deepEqual(
        chunks.filter(chunk => chunk.type === 'text-delta'),
        [{ type: 'text-delta', id: 'agent-final-answer', delta: 'Saved answer' }],
    );
    assert.equal(chunks.at(-1)?.type, 'finish');
});

test('missing structured completion and cancellation preserve the available answer', async () => {
    const chunks = await answer(null, true);
    assert.ok(chunks.some(chunk => chunk.type === 'text-delta' && chunk.delta === 'Provider wording'));
    assert.equal(chunks.at(-1)?.type, 'abort');
    assert.equal(getChatResponseText([{ type: 'tool-finishAnalysis', state: 'output-error', input: { finalAnswer: 'Unsaved conclusion' } }]), 'Unsaved conclusion');
    assert.equal(getChatResponseText([{ type: 'text', text: 'Historical answer' }]), 'Historical answer');
});

test('historical terminal tools remain available while interrupted calls are excluded from model history', () => {
    const history = prepareChatHistory([
        {
            id: 'old',
            role: 'assistant',
            parts: [
                { type: 'text', text: 'Earlier analysis' },
                { type: 'tool-retiredTool', state: 'output-available', toolCallId: 'done', input: {}, output: {} },
                { type: 'tool-retiredTool', state: 'input-streaming', toolCallId: 'aborted' },
                { type: 'tool-updateWorkReport', state: 'output-error', toolCallId: 'malformed', input: undefined, rawInput: '{"draft":', errorText: 'Invalid JSON' },
            ],
        },
    ]);
    assert.equal(history[0]?.parts.length, 2);
    assert.equal(history[0]?.parts[1]?.type, 'tool-retiredTool');
});

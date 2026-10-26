import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgentUIStreamResponse, ToolLoopAgent, type UIMessage } from 'ai';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';

import { buildChatCompletionMetadata, buildChatResponseMetadata, getAssistantResponseError, getReportSaveError, hasLaterAssistantResponse } from '@/lib/ai/chat-response-state';

const failed: UIMessage = { id: 'failed', role: 'assistant', parts: [] };
const user: UIMessage = { id: 'user', role: 'user', parts: [{ type: 'text', text: 'Retry' }] };
const answer: UIMessage = { id: 'answer', role: 'assistant', parts: [{ type: 'text', text: 'Query returned 12.' }] };

test('a historical empty response is collapsed only after a later usable reply completes', () => {
    assert.equal(hasLaterAssistantResponse([failed], 0, 'ready'), false);
    assert.equal(hasLaterAssistantResponse([failed, user], 0, 'ready'), false);
    assert.equal(hasLaterAssistantResponse([failed, user, answer], 0, 'streaming'), false);
    assert.equal(hasLaterAssistantResponse([failed, user, answer], 0, 'error'), false);
    assert.equal(hasLaterAssistantResponse([failed, user, answer], 0, 'ready'), true);
    assert.equal(hasLaterAssistantResponse([failed, user, answer, user], 0, 'submitted'), true);
});

test('further empty, reasoning-only and failed replies do not imply recovery', () => {
    const reasoning: UIMessage = { id: 'reasoning', role: 'assistant', parts: [{ type: 'reasoning', text: 'Thinking' }] };
    const partialFailure = { ...answer, metadata: buildChatResponseMetadata({}, undefined, 'Connection closed') };
    const legacyFailure = { ...answer, metadata: { finishReason: 'error' } };
    for (const later of [failed, reasoning, partialFailure, legacyFailure]) {
        assert.equal(hasLaterAssistantResponse([failed, user, later], 0, 'ready'), false);
    }
});

test('successful tool output can resolve an earlier empty response without a prose answer', () => {
    const output: UIMessage = {
        id: 'tool',
        role: 'assistant',
        parts: [{ type: 'dynamic-tool', toolCallId: 'sql-1', toolName: 'sqlRunner', state: 'output-available', input: {}, output: { ok: true, rowCount: 1 } }],
    };
    assert.equal(hasLaterAssistantResponse([failed, user, output], 0, 'ready'), true);
    const denied: UIMessage = {
        ...output,
        parts: [{ type: 'dynamic-tool', toolCallId: 'sql-1', toolName: 'sqlRunner', state: 'output-available', input: {}, output: { ok: false, error: 'denied' } }],
    };
    assert.equal(hasLaterAssistantResponse([failed, user, denied], 0, 'ready'), false);
});

test('the actual AI SDK failure stream retains its error in persisted response metadata', async () => {
    const reason = 'Codex CLI rejected approval_mode configuration';
    let responseError: string | null = null;
    let saved: UIMessage | undefined;
    const agent = new ToolLoopAgent({
        model: new MockLanguageModelV4({
            doStream: async () => ({
                stream: simulateReadableStream({ chunks: [{ type: 'error', error: new Error(reason) }] }),
            }),
        }),
    });
    const response = await createAgentUIStreamResponse({
        agent,
        uiMessages: [user],
        onError: error => {
            responseError = error instanceof Error ? error.message : 'AI_SERVICE_UNAVAILABLE';
            return responseError;
        },
        onEnd: event => {
            saved = {
                ...event.responseMessage,
                metadata: { ...buildChatResponseMetadata(event.responseMessage.metadata, event.finishReason, responseError), sessionTitle: 'Keep title' },
            };
        },
    });
    await response.text();
    assert.ok(saved);
    const restored: UIMessage = JSON.parse(JSON.stringify(saved));
    assert.equal(getAssistantResponseError(restored), reason);
    assert.deepEqual(restored.metadata, { sessionTitle: 'Keep title', finishReason: 'error', responseError: reason });
    assert.equal(hasLaterAssistantResponse([failed, user, restored], 0, 'ready'), false);
    assert.equal(hasLaterAssistantResponse([restored, user, answer], 0, 'ready'), true);
    assert.equal(getAssistantResponseError(restored), reason);
});

test('successful responses preserve metadata without an error', () => {
    const metadata = buildChatResponseMetadata({ sessionTitle: 'Keep title' }, 'stop', null);
    assert.deepEqual(metadata, { sessionTitle: 'Keep title', finishReason: 'stop' });
    assert.equal(getAssistantResponseError({ ...answer, metadata }), undefined);
});

test('progress interruption remains a visible failure even when the model ends with SQL text', () => {
    const message: UIMessage = { ...answer, parts: [{ type: 'text', text: 'SELECT COUNT(order_id) FROM orders;' }] };
    const reason = 'Analysis stopped before the query executed. Please retry.';
    const metadata = buildChatCompletionMetadata({ message, finishReason: 'stop', responseError: null, progressError: reason, isAborted: false });
    const restored: UIMessage = JSON.parse(JSON.stringify({ ...message, metadata }));
    assert.equal(metadata.responseStatus, 'failed');
    assert.equal(metadata.finishReason, 'error');
    assert.equal(getAssistantResponseError(restored), reason);
    assert.equal(hasLaterAssistantResponse([failed, user, restored], 0, 'ready'), false);
});

test('recovered tool errors do not turn a successful answer into a failure', () => {
    const options = { message: answer, finishReason: 'stop', responseError: 'Temporary tool error', progressError: null, isAborted: false };
    assert.deepEqual(buildChatCompletionMetadata(options), { finishReason: 'stop', responseStatus: 'completed' });
    assert.equal(buildChatCompletionMetadata({ ...options, isAborted: true }).responseStatus, 'aborted');
});

test('report saving failure is distinct from an empty or failed answer and recognizes old history', () => {
    const partial = { ...answer, metadata: { finishReason: 'stop', reportSave: { status: 'failed', error: 'Storage unavailable' } } };
    assert.equal(getReportSaveError(partial), 'Storage unavailable');
    assert.equal(getAssistantResponseError(partial), undefined);
    assert.equal(getReportSaveError({ ...answer, metadata: { reportSave: { status: 'saved' } } }), undefined);
    assert.equal(
        getReportSaveError({ ...answer, metadata: { responseError: 'Create and save the requested report before completing this turn.' } }),
        'Create and save the requested report before completing this turn.',
    );
    assert.equal(getReportSaveError({ ...answer, metadata: { responseError: 'Connection closed' } }), undefined);
});

test('completion distinguishes partial work, recovered tools, unsaved edits and cancellation', async () => {
    const { summarizeChatCompletion, getChatCompletion } = await import('@/lib/ai/chat-response-state');
    const { chatToolFailure } = await import('@dory/shared/types/chat-tool-error');
    const message = { id: 'answer', role: 'assistant' as const, parts: [{ type: 'text' as const, text: 'The verified count is 42.' }] };
    const failed = { id: 'chart', toolName: 'chartBuilder', state: 'failed' as const, failure: chatToolFailure(new Error('Chart fields do not match'), 'chartBuilder') };
    const partial = summarizeChatCompletion({ message, actions: [failed], aborted: false, report: { documentId: 'report', saved: false } });
    assert.equal(partial.status, 'partial');
    assert.ok(partial.unfinished.includes('REPORT_NOT_SAVED'));
    assert.equal(partial.canContinue, true);
    assert.deepEqual(getChatCompletion({ ...message, metadata: { completion: partial } }), partial);
    const recovered = summarizeChatCompletion({ message, actions: [failed, { id: 'fixed', toolName: 'chartBuilder', state: 'completed' }], aborted: false });
    assert.equal(recovered.status, 'completed');
    assert.deepEqual(recovered.unfinished, []);
    assert.equal(summarizeChatCompletion({ message, actions: [], aborted: true }).status, 'aborted');
});

test('completion includes preflight failures and recognizes their later recovery', async () => {
    const { summarizeChatCompletion } = await import('@/lib/ai/chat-response-state');
    const parts: UIMessage['parts'] = [{ type: 'dynamic-tool', toolCallId: 'invalid', toolName: 'chartBuilder', state: 'output-error', input: {}, errorText: 'Invalid fields' }];
    const completion = () => summarizeChatCompletion({ message: { id: 'preflight', role: 'assistant', parts }, actions: [], aborted: false });
    assert.equal(completion().status, 'failed');
    assert.deepEqual(completion().unfinished, ['INVALID_FIELDS']);
    parts.push({ type: 'dynamic-tool', toolCallId: 'repaired', toolName: 'chartBuilder', state: 'output-available', input: {}, output: { ok: true } });
    assert.equal(completion().status, 'completed');
    assert.deepEqual(completion().unfinished, []);
});

test('a verified report save resolves an earlier report creation failure', async () => {
    const { summarizeChatCompletion } = await import('@/lib/ai/chat-response-state');
    const completion = summarizeChatCompletion({
        message: answer,
        aborted: false,
        report: { documentId: 'saved', revision: 3, saved: true },
        actions: [
            { id: 'create', toolName: 'createWorkReport', state: 'failed' },
            { id: 'update', toolName: 'updateWorkReport', state: 'completed' },
        ],
    });
    assert.equal(completion.status, 'completed');
    assert.deepEqual(completion.unfinished, []);
});

test('repeated continuation retains the original chart request and rejects unavailable history', async () => {
    const { getChatResumeRequest } = await import('@/lib/ai/chat-response-state');
    const root: UIMessage = { id: 'original', role: 'user', parts: [{ type: 'text', text: 'Add a pie chart to this report.' }] };
    const continuation: UIMessage = { id: 'continue', role: 'user', parts: [{ type: 'text', text: 'Continue unfinished steps' }] };
    const completion = { status: 'partial', completed: [], unfinished: ['REPORT_NOT_SAVED'], canContinue: true };
    const first: UIMessage = { id: 'first', role: 'assistant', parts: [], metadata: { userMessageId: root.id, completion } };
    const second: UIMessage = { id: 'second', role: 'assistant', parts: [], metadata: { userMessageId: continuation.id, resumeUserMessageId: root.id, completion } };
    const history = [root, first, continuation, second];
    assert.equal(getChatResumeRequest(history, first.id)?.id, root.id);
    assert.equal(getChatResumeRequest(history, second.id)?.id, root.id);
    assert.equal(getChatResumeRequest(history.slice(1), second.id), null);
    assert.equal(getChatResumeRequest(history, 'unknown'), null);
});

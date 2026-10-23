import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

import { formatChatToolError, repairWorkToolInput } from '@/lib/ai/agents/work-tool-input';
import { workDraftSchema, workPatchSchema } from '@/lib/work-documents/schema';

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve('server-only');
require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as NodeJS.Module;
const { buildDoryChatAgent } = await import('@/lib/ai/agents/chat-agent');
const update = {
    documentId: 'doc_01a1678c-6258-770a-a337-1b7d597ccae6',
    expectedRevision: 2,
    patch: {
        edits: [{ oldText: '## 核心指标概览\n\n| 指标 | 数值 |', newText: '## 核心指标概览\n\n![核心指标](dory://visual/table_01a16787-30bb-7618-aff3-774a8b8cedfd)' }],
        status: 'ready' as const,
        visuals: [
            { id: 'table_01a16787-30bb-7618-aff3-774a8b8cedfd', type: 'table' as const, title: '核心指标汇总', evidenceId: 'artifact_rs_01a16787-30bb-7618-aff3-774a8b8cedfd' },
        ],
    },
};

test('repair only missing container endings in otherwise complete, valid report arguments', () => {
    const valid = JSON.stringify(update);
    assert.equal(repairWorkToolInput('updateWorkReport', valid.slice(0, -1)), valid);
    assert.equal(repairWorkToolInput('updateWorkReport', valid.slice(0, -2)), valid);
    assert.equal(repairWorkToolInput('updateWorkReport', valid), null);
    for (const input of [
        '{}',
        '{',
        '{"documentId":',
        '{"documentId":"unfinished',
        valid.slice(0, -2) + ',',
        valid.replace('"expectedRevision":2', '"expectedRevision":0').slice(0, -1),
    ]) {
        assert.equal(repairWorkToolInput('updateWorkReport', input), null, input);
    }
    assert.equal(repairWorkToolInput('sqlRunner', valid.slice(0, -1)), null);
    const withQuotedBraces = { ...update, patch: { ...update.patch, edits: [{ oldText: '{"value":"a\\b"}', newText: '中文 “quotes” } ] \\ " unchanged' }] } };
    const quoted = JSON.stringify(withQuotedBraces);
    assert.equal(repairWorkToolInput('updateWorkReport', quoted.slice(0, -1)), quoted);
    assert.equal(
        workDraftSchema.safeParse({ title: 'Report', markdown: '', status: 'draft', visuals: [{ id: 'chart', type: 'chart', title: 'Chart', evidenceId: 'real' }] }).success,
        false,
    );
    assert.equal(
        formatChatToolError({ name: 'AI_InvalidToolInputError', message: 'Invalid input', cause: { message: 'Chart configuration is required.' } }).includes(
            'Chart configuration is required.',
        ),
        true,
    );
    assert.equal(formatChatToolError({ message: 'Report not found.' }), 'Report not found.');
    assert.equal(formatChatToolError(new Error('Report changed. Read the latest version.')), 'Report changed. Read the latest version.');
});

test('the agent repairs provider-shaped report calls once, validates and records original input', async () => {
    let calls = 0;
    let saved = 0;
    const recorded: unknown[] = [];
    const malformed = JSON.stringify(update).slice(0, -1);
    const agent = buildDoryChatAgent({
        model: new MockLanguageModelV4({
            doGenerate: async () => ({
                content: [
                    calls++ === 0
                        ? { type: 'tool-call' as const, toolCallId: 'update', toolName: 'updateWorkReport', input: malformed }
                        : { type: 'tool-call' as const, toolCallId: 'finish', toolName: 'finishAnalysis', input: '{}' },
                ],
                finishReason: { unified: 'tool-calls' as const, raw: 'tool_calls' },
                usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 10, text: 10, reasoning: 0 } },
                warnings: [],
            }),
        }),
        tools: {
            updateWorkReport: tool({
                inputSchema: z.object({ documentId: z.string(), expectedRevision: z.number(), patch: workPatchSchema }),
                execute: async input => {
                    saved++;
                    assert.deepEqual(input, update);
                    return { revision: 3, status: 'ready' };
                },
            }),
            finishAnalysis: tool({ inputSchema: z.object({}), execute: async () => ({ ok: true }) }),
        },
        instructions: 'Update the report and finish.',
        requestId: 'repair-test',
        context: {},
        recordUsage: async event => {
            recorded.push(event);
        },
    });
    const result = await agent.generate({ prompt: 'Complete report' });
    assert.equal(saved, 1);
    assert.equal(result.steps.length, 2);
    assert.ok(JSON.stringify(recorded).includes('tool_input_repaired'));
    assert.ok(recorded.some(event => (event as { outputJson?: { originalInput?: string } }).outputJson?.originalInput === malformed));
});

test('streaming validation failures retain actionable field errors instead of reporting a service outage', async () => {
    const { createAgentUIStream } = await import('ai');
    let step = 0;
    let writes = 0;
    const model = new MockLanguageModelV4({
        doGenerate: async () => {
            const calls = [
                {
                    toolName: 'createWorkReport',
                    input: JSON.stringify({ title: 'Report', markdown: '', status: 'draft', visuals: [{ id: 'chart', type: 'chart', title: 'Trend', evidenceId: 'real' }] }),
                },
                { toolName: 'updateWorkReport', input: '{}' },
                { toolName: 'finishAnalysis', input: '{}' },
            ];
            return {
                content: [{ type: 'tool-call' as const, toolCallId: `call-${step}`, ...calls[step++] }],
                finishReason: { unified: 'tool-calls' as const, raw: 'tool_calls' },
                usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 10, text: 10, reasoning: 0 } },
                warnings: [],
            };
        },
    });
    model.doStream = async options => {
        const generated = await model.doGenerate(options);
        return {
            stream: new ReadableStream({
                start(controller) {
                    controller.enqueue({ type: 'stream-start', warnings: [] });
                    for (const content of generated.content) if (content.type === 'tool-call') controller.enqueue(content);
                    controller.enqueue({ type: 'finish', finishReason: generated.finishReason, usage: generated.usage });
                    controller.close();
                },
            }),
        };
    };
    const agent = buildDoryChatAgent({
        model,
        tools: {
            createWorkReport: tool({
                inputSchema: workDraftSchema,
                execute: async () => {
                    writes++;
                    return {};
                },
            }),
            updateWorkReport: tool({
                inputSchema: z.object({ documentId: z.string(), expectedRevision: z.number(), patch: workPatchSchema }),
                execute: async () => {
                    writes++;
                    return {};
                },
            }),
            finishAnalysis: tool({ inputSchema: z.object({}), execute: async () => ({ ok: true }) }),
        },
        instructions: 'Save report.',
        requestId: 'invalid-stream',
        context: {},
        recordUsage: async () => {},
    });
    const stream = await createAgentUIStream({
        agent,
        uiMessages: [{ id: 'question', role: 'user', parts: [{ type: 'text', text: 'Save report' }] }],
        onError: formatChatToolError,
    });
    const errors: string[] = [];
    for await (const chunk of stream) if (chunk.type === 'tool-output-error') errors.push(chunk.errorText);
    assert.equal(writes, 0);
    assert.equal(errors.length, 2);
    assert.ok(errors.every(error => error.includes('TOOL_INPUT_INVALID') && !error.includes('AI_SERVICE_UNAVAILABLE')));
    assert.match(errors[0], /Chart configuration is required/);
    assert.match(errors[1], /documentId/);
});

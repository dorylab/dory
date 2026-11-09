import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const serverOnly = require.resolve('server-only');
require.cache[serverOnly] = { id: serverOnly, filename: serverOnly, loaded: true, exports: {} } as NodeJS.Module;
const { buildDoryAgentContext } = await import('@/lib/ai/agents/context');
const { buildDoryChatAgent } = await import('@/lib/ai/agents/chat-agent');

test('chart policy is capability-based, including attachment-only chats', async () => {
    const base = { baseSystem: 'Analyze data', userLanguageInstruction: 'Use Chinese', sqlToolEnabled: false };
    const enabled = await buildDoryAgentContext({ ...base, chartToolEnabled: true });
    const disabled = await buildDoryAgentContext({ ...base, chartToolEnabled: false });
    assert.match(enabled.instructions, /Proactively visualize/);
    assert.match(enabled.instructions, /Never substitute YTD/);
    assert.match(enabled.instructions, /SQL-only request/);
    assert.doesNotMatch(disabled.instructions, /Proactively visualize/);
});

for (const name of ['sqlRunner', 'queryAttachment']) {
    for (const ok of [true, false])
        test(`${name}: chart decision reminder follows successful queries only (${ok})`, async () => {
            const prompts: string[] = [];
            let calls = 0;
            const model = new MockLanguageModelV4({
                doGenerate: async options => {
                    prompts.push(JSON.stringify(options.prompt));
                    const first = calls++ === 0;
                    return {
                        content: first
                            ? [{ type: 'tool-call' as const, toolCallId: 'query', toolName: name, input: '{}' }]
                            : [{ type: 'text' as const, text: 'Available result.' }],
                        finishReason: { unified: first ? ('tool-calls' as const) : ('stop' as const), raw: first ? 'tool_calls' : 'stop' },
                        usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 10, text: 10, reasoning: 0 } },
                        warnings: [],
                    };
                },
            });
            const agent = buildDoryChatAgent({
                model,
                tools: {
                    [name]: tool({
                        inputSchema: z.object({}),
                        execute: async () => ({
                            ok,
                            type: 'sql-result',
                            columns: [{ name: 'year' }, { name: 'revenue' }],
                            previewRows: ok
                                ? [
                                      { year: 2025, revenue: 2 },
                                      { year: 2025, revenue: 1 },
                                  ]
                                : [],
                            artifactId: 'fixture',
                        }),
                    }),
                    chartBuilder: tool({ inputSchema: z.object({}), execute: async () => ({}) }),
                },
                instructions: 'Analyze the result.',
                context: {},
                requestId: `chart-${name}-${ok}`,
                recordUsage: async () => {},
                structuredCompletion: true,
            });
            await agent.generate({ prompt: 'Compare the periods' });
            assert.equal(prompts.length, 2);
            assert.equal(prompts[1].includes('Before answering, consider whether'), ok);
            if (ok) assert.match(prompts[1], /Respect SQL-only\/no-chart requests/);
            assert.equal(prompts[1].includes('Chart data check: Repeated X values'), ok);
        });
}

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const enabled = process.env.E2E_KNOWLEDGE_EXTRACTION_LIVE === '1';
const knowledgeModelId = process.env.E2E_KNOWLEDGE_EXTRACTION_MODEL_ID ?? '';
const organizationId = process.env.E2E_KNOWLEDGE_EXTRACTION_ORGANIZATION_ID;
const sourceChanged = process.env.E2E_KNOWLEDGE_EXTRACTION_PHASE === 'source-changed';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test('real commerce extraction publishes metrics and rules with Agent citations', async ({ request }) => {
    test.skip(!enabled, 'Explicitly enable after reviewing the real commerce drafts in Dory. No real Linear Key is read by this test.');
    test.setTimeout(240_000);
    expect(knowledgeModelId).toBeTruthy();
    expect(['localhost', '127.0.0.1']).toContain(new URL(process.env.PLAYWRIGHT_BASE_URL!).hostname);
    async function action<T>(actionId: string, input: Record<string, unknown> = {}): Promise<T> {
        const r = await request.post('/api/actions/execute', { data: { actionId, organizationId, input: { knowledgeModelId, ...input } } });
        const payload = await r.json();
        expect(payload.ok, `${actionId}: ${payload.message ?? r.status()}`).toBe(true);
        return payload.data;
    }
    type Definition = { id: string; name: string; kind: string; status: string };
    type Rule = { id: string; payload: { name: string; description: string }; evidence: Array<{ sourceHash: string; sourceUrl: string; quote: string }> };
    const model = await action<{ model: { definitions: Definition[] }; dataSources: Array<{ connectionId: string; name: string }> }>('knowledge.get');
    const connection = model.dataSources.find(s => s.name === 'Commerce Agent Evaluation');
    expect(connection).toBeTruthy();
    const metrics = ['净收入', '支付成功率'].map(name => model.model.definitions.find(d => d.kind === 'metric' && d.name === name && d.status === 'verified'));
    expect(metrics.every(Boolean), 'Review both real metric drafts first').toBe(true);
    const { rules } = await action<{ rules: Rule[] }>('knowledge.listBusinessRules');
    for (const value of ['UTC', 'USD']) {
        const rule = rules.find(r => r.payload.description.includes(value));
        expect(rule, `Review the ${value} business rule first`).toBeTruthy();
        expect(rule!.evidence.some(e => e.quote.includes(value) && e.sourceHash && new URL(e.sourceUrl).hostname === 'linear.app')).toBe(true);
    }
    const graph = await action<{ sourceAssetEdges: Array<{ assetId: string; assetType: string }> }>('knowledge.getGraph');
    for (const metric of metrics) expect(graph.sourceAssetEdges.some(e => e.assetId === metric!.id && e.assetType === 'definition')).toBe(true);
    for (const rule of rules) expect(graph.sourceAssetEdges.some(e => e.assetId === rule.id && e.assetType === 'business_rule')).toBe(true);
    const messageId = randomUUID();
    const response = await request.post('/api/chat', {
        timeout: 210_000,
        data: {
            id: messageId,
            connectionId: connection!.connectionId,
            connectionType: 'sqlite',
            database: 'main',
            webSearch: false,
            messages: [
                {
                    id: messageId,
                    role: 'user',
                    parts: [
                        {
                            type: 'text',
                            text: [
                                `进行已审核知识验收。knowledgeModelId=${knowledgeModelId}，connectionId=${connection!.connectionId}，两者不得混淆。`,
                                '依次用 search_assets 搜索净收入和支付成功率，kinds=["knowledge_definition"]；搜索统计时区，kinds=["business_rule"]。每次搜索都限制上述 knowledgeModelId 和 connectionId。',
                                '然后用 read_asset 实际读取这三个已审核资产，回答净收入如何计算、支付成功率如何计数、统计时区是什么，并分别附 Linear 原文 URL。',
                                '必须读取已审核定义和业务口径，不能只读搜索摘要或用原始文档代替。仅检索读取，不执行 SQL、图表或写入。',
                            ].join('\n'),
                        },
                    ],
                },
            ],
        },
    });
    expect(response.ok()).toBe(true);
    const events = (await response.text())
        .split('\n')
        .filter(line => line.startsWith('data: ') && line !== 'data: [DONE]')
        .map(line => JSON.parse(line.slice(6)));
    const outputs = events.filter(e => e.type === 'tool-output-available').map(e => e.output);
    const reads = outputs.filter(output => output?.citation && output?.content);
    const answer = events
        .filter(e => e.type === 'text-delta')
        .map(e => e.delta ?? '')
        .join('');
    const citations: Array<{ title: string; ref: string; sourceUrl: string; sourceState: string }> = [];
    for (const name of ['净收入', '支付成功率', '统计时区']) {
        const read = reads.find(r => r.citation.title === name);
        expect(read, `Agent must actually read the published ${name}`).toBeTruthy();
        expect(new URL(read.citation.sourceUrl).hostname).toBe('linear.app');
        expect(read.citation.sourceState).toBe(sourceChanged && name === '净收入' ? 'outdated' : 'current');
        expect(decodeURI(answer)).toContain(decodeURI(read.citation.sourceUrl));
        citations.push(read.citation);
    }
    expect(answer).toContain('UTC');
    const output = path.resolve('apps/web/localdata/linear-commerce-acceptance');
    await mkdir(output, { recursive: true });
    await writeFile(
        path.join(output, sourceChanged ? 'extraction-agent-source-changed.json' : 'extraction-agent-live.json'),
        JSON.stringify(
            {
                result: 'passed',
                checkedAt: new Date().toISOString(),
                knowledgeModelId,
                metricIds: metrics.map(m => m!.id),
                ruleIds: rules.map(r => r.id),
                chatId: response.headers()['x-chat-id'] ?? null,
                citations,
            },
            null,
            2,
        ),
    );
});

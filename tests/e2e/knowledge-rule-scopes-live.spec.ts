import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const modelId = process.env.E2E_KNOWLEDGE_RULE_MODEL_ID ?? '';
const enabled = process.env.E2E_KNOWLEDGE_RULE_LIVE === '1';
test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test('real commerce classification and reviewed rules preserve the payment denominator and Agent citations', async ({ request }) => {
    test.skip(!enabled, 'Opt in explicitly for the synthetic commerce model; no Linear Key is read.');
    test.setTimeout(240_000);
    expect(['localhost', '127.0.0.1']).toContain(new URL(process.env.PLAYWRIGHT_BASE_URL!).hostname);
    expect(modelId).toBeTruthy();
    async function action(actionId: string, input: Record<string, unknown> = {}) {
        const response = await request.post('/api/actions/execute', { data: { actionId, input: { knowledgeModelId: modelId, ...input } } });
        const body = await response.json();
        expect(body.ok, `${actionId}: ${body.message ?? response.status()}`).toBe(true);
        return body.data;
    }
    const before = await action('knowledge.get');
    const netBefore = before.model.definitions.find((d: { name: string }) => d.name === '净收入');
    const paymentBefore = before.model.definitions.find((d: { name: string }) => d.name === '支付成功率');
    const allRulesBefore = (await action('knowledge.listBusinessRules', { includeArchived: true })).rules;
    const timezoneBefore = allRulesBefore.find((r: { payload: { name: string } }) => r.payload.name === '统计时区');
    if (timezoneBefore) expect(timezoneBefore.applicationScope).toBe('model');
    const currencyBefore = allRulesBefore.find((r: { payload: { name: string } }) => r.payload.name === '币种');
    expect(currencyBefore.applicationScope).toBe('model');
    if (process.env.E2E_KNOWLEDGE_RULE_REVIEW === '1') {
        const drafts = await action('knowledge.listCandidates');
        expect(drafts.candidates.some((c: { payload: { name: string } }) => c.payload.name === '测试订单排除规则')).toBe(false);
        const metric = drafts.candidates.find((c: { action: string; payload: { name: string } }) => c.payload.name === '净收入' && c.action !== 'source_changed');
        const rule = drafts.candidates.find((c: { id: string }) => metric.payload.ruleCandidateIds?.includes(c.id));
        expect(metric.payload.specificConditions.join(' ')).toContain('测试订单');
        expect(metric.targetAssetId).toBe(netBefore.id);
        expect(rule.payload.applicationScope).toBe('metrics');
        expect(rule.payload.metricIds).not.toContain(paymentBefore.id);
        await action('knowledge.reviewCandidateBundle', {
            items: [
                {
                    candidateId: metric.id,
                    payload: metric.payload,
                    targetAssetId: metric.targetAssetId,
                    expectedTargetRevision: metric.targetRevision,
                    expectedRuleRevisions: Object.fromEntries(drafts.rules.map((r: { id: string; revision: number }) => [r.id, r.revision])),
                },
                {
                    candidateId: rule.id,
                    payload: rule.payload,
                    createNew: true,
                    expectedMetricRevisions: Object.fromEntries(
                        drafts.targets.filter((t: { kind: string }) => t.kind === 'metric').map((t: { id: string; revision: string }) => [t.id, t.revision]),
                    ),
                },
            ],
        });
    }
    const after = await action('knowledge.get');
    const net = after.model.definitions.find((d: { id: string }) => d.id === netBefore.id);
    const payment = after.model.definitions.find((d: { id: string }) => d.id === paymentBefore.id);
    expect(net.expression).toBe(netBefore.expression);
    expect(net.filters).toEqual(netBefore.filters);
    expect(net.description).toContain('测试订单');
    expect(payment).toEqual(paymentBefore);
    const rules = (await action('knowledge.listBusinessRules')).rules;
    expect(rules.find((r: { id: string }) => r.id === currencyBefore.id)).toEqual(currencyBefore);
    if (timezoneBefore)
        expect((await action('knowledge.listBusinessRules', { includeArchived: true })).rules.find((r: { id: string }) => r.id === timezoneBefore.id)).toEqual(timezoneBefore);
    const shared = rules.find((r: { payload: { name: string } }) => r.payload.name === '支付失败订单排除规则');
    expect(shared.applicationScope).toBe('metrics');
    expect(shared.metricIds).toContain(net.id);
    expect(shared.metricIds).not.toContain(payment.id);
    const graph = await action('knowledge.getGraph');
    expect(graph.metricRuleEdges.some((e: { metricId: string; ruleId: string }) => e.metricId === net.id && e.ruleId === shared.id)).toBe(true);
    const messageId = randomUUID();
    const response = await request.post('/api/chat', {
        timeout: 210_000,
        data: {
            id: messageId,
            connectionId: net.sourceConnectionId,
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
                            text: `只做只读知识验收，不执行 SQL。knowledgeModelId=${modelId}。用 search_assets 搜索净收入和支付成功率，kinds=["knowledge_definition"]，限制上述模型与 connectionId=${net.sourceConnectionId}；随后必须用 read_asset 读取这两个指标的完整结果。说明净收入专属测试订单条件及引用规则，支付成功率分母如何计数，并附 Linear 原文 URL。不要用原始文档代替正式指标。`,
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
    const reads = events
        .filter(e => e.type === 'tool-output-available')
        .map(e => e.output)
        .filter(o => o?.citation && o?.content);
    const netRead = reads.find(r => r.citation.title === '净收入');
    const paymentRead = reads.find(r => r.citation.title === '支付成功率');
    expect(netRead).toBeTruthy();
    expect(paymentRead).toBeTruthy();
    expect(netRead.content.effectiveRules.some((r: { id: string }) => r.id === shared.id)).toBe(true);
    expect(paymentRead.content.effectiveRules.some((r: { id: string }) => r.id === shared.id)).toBe(false);
    expect(netRead.content.effectiveRules.find((r: { id: string }) => r.id === shared.id).revision).toBe(shared.revision);
    expect(new URL(netRead.citation.sourceUrl).hostname).toBe('linear.app');
    const outputDir = path.resolve('apps/web/localdata/linear-commerce-acceptance');
    await mkdir(outputDir, { recursive: true });
    await writeFile(
        path.join(outputDir, 'rule-scopes-live.json'),
        JSON.stringify(
            {
                result: 'passed',
                checkedAt: new Date().toISOString(),
                modelId,
                metricIds: [net.id, payment.id],
                ruleId: shared.id,
                ruleRevision: shared.revision,
                sourceUrls: [netRead.citation.sourceUrl, ...shared.evidence.map((e: { sourceUrl: string }) => e.sourceUrl)],
                netRevision: netRead.citation.revision,
                paymentRevision: paymentRead.citation.revision,
                sqlUnchanged: true,
                currencyUnchanged: true,
                paymentDenominatorUnchanged: true,
            },
            null,
            2,
        ),
    );
});

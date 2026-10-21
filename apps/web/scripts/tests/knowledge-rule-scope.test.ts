import assert from 'node:assert/strict';
import test from 'node:test';

import { parseKnowledgeOrganization, reconcileOrganizedItems } from '../../lib/server/knowledge-organization-core';
import { ruleAppliesToMetric, ruleConnectionIds } from '../../lib/server/knowledge-rule-scope';

const rule = {
    id: 'failed',
    revision: 1,
    applicationScope: 'metrics' as const,
    payload: { kind: 'business_rule' as const, name: 'Exclude failed orders', description: 'Exclude failed orders.', aliases: [], sourceConnectionId: null },
    metricIds: ['revenue'],
    metrics: [{ id: 'revenue', name: 'Revenue', sourceConnectionId: 'commerce' }],
};
test('metric scope never leaks into another denominator or another data source', () => {
    assert.equal(ruleAppliesToMetric(rule, { id: 'revenue', sourceConnectionId: 'commerce' }), true);
    assert.equal(ruleAppliesToMetric(rule, { id: 'payment-success', sourceConnectionId: 'commerce' }), false);
    assert.equal(ruleAppliesToMetric({ ...rule, status: 'archived' }, { id: 'revenue', sourceConnectionId: 'commerce' }), false);
    assert.equal(ruleAppliesToMetric({ ...rule, metricIds: [] }, { id: 'revenue', sourceConnectionId: 'commerce' }), false);
    assert.deepEqual(ruleConnectionIds(rule, [{ connectionId: 'commerce' }, { connectionId: 'secret' }]), ['commerce']);
    assert.deepEqual(ruleConnectionIds({ ...rule, metrics: [] }, [{ connectionId: 'commerce' }]), []);
    assert.equal(ruleAppliesToMetric({ ...rule, applicationScope: 'model' }, { id: 'payment-success', sourceConnectionId: 'commerce' }), true);
    assert.equal(
        ruleAppliesToMetric(
            { ...rule, applicationScope: 'data_source', payload: { ...rule.payload, sourceConnectionId: 'commerce' } },
            { id: 'revenue', sourceConnectionId: 'secret' },
        ),
        false,
    );
});
test('organization preserves every input and requires evidence before promoting a rule to global', () => {
    const inputs = [{ id: 'i', payload: rule.payload, evidence: [{ quote: 'Exclude failed orders.', sourceId: 's', sourceHash: 'h', sourceTitle: 's', sourceUrl: null }] }];
    const parse = (payload: Record<string, unknown>) =>
        parseKnowledgeOrganization(JSON.stringify({ items: [{ payload: { ...rule.payload, ...payload }, inputIds: ['i'] }] }), inputs);
    assert.equal(parse({ applicationScope: 'model' })[0].payload.applicationScope, 'metrics');
    assert.equal(parse({ applicationScope: 'model', sharingEvidence: 'Exclude failed orders.' })[0].payload.applicationScope, 'model');
    assert.throws(() => parseKnowledgeOrganization('{"items":[]}', inputs), /preserve/);
    assert.throws(() => parseKnowledgeOrganization(JSON.stringify({ items: [{ payload: rule.payload, inputIds: ['invented'] }] }), inputs), /preserve/);
    assert.throws(() => parse({ sql: 'DELETE FROM orders' }));
    const merged = reconcileOrganizedItems([
        { payload: rule.payload, inputIds: ['a'] },
        { payload: rule.payload, inputIds: ['b'] },
    ]);
    assert.equal(merged.length, 1);
    assert.deepEqual(merged[0].inputIds, ['a', 'b']);
});

test('single-metric conditions fold into a review preserving official ID mappings; named shared rules cannot become global', () => {
    const metric = {
        id: 'net',
        kind: 'metric' as const,
        name: 'Net revenue',
        status: 'verified' as const,
        sourceConnectionId: 'commerce',
        expression: 'SUM(net_amount)',
        filters: ["status <> 'payment_failed'"],
        description: 'Sum net revenue.',
    };
    const result = reconcileOrganizedItems(
        [
            {
                payload: {
                    ...rule.payload,
                    name: 'Test order exclusion',
                    description: 'Net revenue excludes test orders.',
                    applicationScope: 'model',
                    applicableMetricNames: ['Net revenue'],
                },
                inputIds: ['specific'],
            },
            { payload: { ...rule.payload, applicationScope: 'model', applicableMetricNames: ['Net revenue', 'Order count'] }, inputIds: ['shared'] },
        ],
        [metric],
    );
    const net = result.find(i => i.payload.kind === 'metric')!;
    assert.equal(result.length, 2);
    assert.equal(net.payload.expression, metric.expression);
    assert.deepEqual(net.payload.filters, metric.filters);
    assert.ok(net.payload.description.includes('test orders'));
    assert.ok(net.sharedRuleKeys?.length);
    const shared = result.find(i => i.payload.kind === 'business_rule')!;
    assert.equal(shared.payload.applicationScope, 'metrics');
    assert.deepEqual(shared.payload.metricIds, ['net']);
});

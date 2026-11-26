import assert from 'node:assert/strict';
import test from 'node:test';

import { reviewKnowledgeDefinitions } from '../../lib/server/knowledge-definition-review';

const sources = [
    { id: 'product', name: '产品运营（口径验收）', rules: '活跃按登录统计。', revision: 'a', deepLink: '/product' },
    { id: 'revenue', name: '收入运营（口径验收）', rules: '活跃按购买统计。', revision: 'b', deepLink: '/revenue' },
];
const ask = { kind: 'ask', question: '采用哪个口径？', options: sources.map(s => ({ id: s.id, quote: s.rules })) };
const input = { sources, previous: null, question: '十月活跃客户数？', conversation: [], generate: async () => JSON.stringify(ask) };

test('clear definitions proceed, and a single source needs no review call', async () => {
    assert.equal(await reviewKnowledgeDefinitions({ ...input, generate: async () => '{"kind":"clear"}' }), null);
    assert.equal(await reviewKnowledgeDefinitions({ ...input, sources: [sources[0]], generate: async () => assert.fail() }), null);
});

test('pending definitions require an affirmative choice grounded in the current user reply', async () => {
    const previous = await reviewKnowledgeDefinitions(input);
    for (const verdict of [{ kind: 'repeat' }, { kind: 'clear' }, { kind: 'choose', id: 'product', choiceText: '产品运营' }]) {
        const result = await reviewKnowledgeDefinitions({ ...input, previous, question: '继续', generate: async () => JSON.stringify(verdict) });
        assert.equal(result?.selectedId, undefined);
        assert.deepEqual(result?.options, previous?.options);
    }
    for (const question of ['1', '选产品运营口径', '产品运营（口径验收）']) {
        const selected = await reviewKnowledgeDefinitions({ ...input, previous, question, generate: async () => assert.fail() });
        assert.equal(selected?.selectedId, 'product');
        assert.equal(selected.question, input.question);
    }
});

test('a changed rule invalidates the menu and the original metric is reviewed again', async () => {
    const previous = await reviewKnowledgeDefinitions(input);
    const revised = sources.map(s => ({ ...s, revision: 'c' }));
    const result = await reviewKnowledgeDefinitions({
        ...input,
        previous,
        sources: revised,
        question: '1',
        generate: async (_, prompt) => {
            assert.equal(JSON.parse(prompt).question, input.question);
            return JSON.stringify(ask);
        },
    });
    assert.equal(result?.selectedId, undefined);
    assert.equal(result?.options[0].revision, 'c');
});

test('invalid model output and unverified citations cannot authorize SQL', async () => {
    for (const raw of ['bad JSON', JSON.stringify({ ...ask, options: [ask.options[0], { id: 'revenue', quote: '登录' }] })]) {
        await assert.rejects(reviewKnowledgeDefinitions({ ...input, generate: async () => raw }));
    }
});

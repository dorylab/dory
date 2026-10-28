import assert from 'node:assert/strict';
import { test } from 'node:test';

import { generateKnowledgeSuggestions, parseKnowledgeSuggestions } from '../../lib/actions/server/domains/knowledge/suggestions';

const suggestion = { name: 'Active users', kind: 'metric', sourceConnectionId: 'connection-1', filters: ['active = true'] };

test('valid suggestions preserve string filters and reject unknown data sources', () => {
    const result = parseKnowledgeSuggestions(JSON.stringify({ suggestions: [suggestion, { ...suggestion, sourceConnectionId: 'unknown' }] }), new Set(['connection-1']));
    assert.equal(result.length, 1);
    assert.deepEqual(result[0]?.filters, ['active = true']);
    assert.equal(result[0]?.id, 'suggestion:0');
});

test('object filters and malformed responses are rejected for retry', () => {
    assert.throws(() => parseKnowledgeSuggestions(JSON.stringify({ suggestions: [{ ...suggestion, filters: [{ expression: 'active = true' }] }] }), new Set(['connection-1'])));
    assert.throws(() => parseKnowledgeSuggestions('not JSON', new Set()));
    assert.throws(() => parseKnowledgeSuggestions('{}', new Set()));
});

test('invalid AI output is retried once and valid output is returned', async () => {
    const attempts: boolean[] = [];
    const result = await generateKnowledgeSuggestions(
        async retry => {
            attempts.push(retry);
            return { text: JSON.stringify({ suggestions: [{ ...suggestion, filters: retry ? ['active = true'] : [{}] }] }) };
        },
        new Set(['connection-1']),
    );
    assert.deepEqual(attempts, [false, true]);
    assert.deepEqual(result[0]?.filters, ['active = true']);
});

test('repeated invalid AI output produces a readable error', async () => {
    let attempts = 0;
    await assert.rejects(
        generateKnowledgeSuggestions(
            async () => {
                attempts++;
                return { text: JSON.stringify({ suggestions: [{ ...suggestion, filters: [{}] }] }) };
            },
            new Set(['connection-1']),
        ),
        /invalid format/,
    );
    assert.equal(attempts, 2);
});

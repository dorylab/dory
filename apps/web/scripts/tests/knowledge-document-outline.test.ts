import assert from 'node:assert/strict';
import test from 'node:test';
import { generateText, Output } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

import { generateValidatedDocumentDraft } from '../../lib/server/knowledge-document-outline';
import { DocumentDraftValidationError, renderDraft, type TableFacts } from '../../lib/server/knowledge-document-draft';

const tables: TableFacts[] = ['orders', 'refunds'].map(name => ({ name, comment: null, columns: [], foreignKeys: null }));
const document = {
    title: 'Guide',
    introduction: 'Read the selected tables.',
    tables: [0, 1],
    citations: [] as { reference: number; quote: string; explanation: string }[],
    questions: [],
};
const outline = (changes: Partial<typeof document> = {}) => JSON.stringify({ topics: [{ name: 'Commerce', documents: [{ ...document, ...changes }] }] });
const base = {
    source: { name: 'Shop', database: 'shop' },
    locale: 'en',
    goal: '',
    tables,
    references: [],
    label: (key: string) => key,
    progress: async () => {},
};

test('schema-only generation repairs hallucinated citations with explicit reference feedback and indexed inputs', async () => {
    const requests: Parameters<Parameters<typeof generateValidatedDocumentDraft>[0]['generate']>[0][] = [];
    const phases: string[] = [];
    const bad = outline({ citations: [{ reference: 0, quote: 'orders', explanation: 'Invented schema citation' }] });
    const result = await generateValidatedDocumentDraft({
        ...base,
        progress: async phase => {
            phases.push(phase);
        },
        generate: async request => {
            requests.push(request);
            return { text: requests.length === 1 ? bad : outline(), finishReason: 'stop' };
        },
    });
    assert.equal(requests.length, 2);
    assert.deepEqual(
        JSON.parse(requests[0].prompt).tables.map((table: { index: number }) => table.index),
        [0, 1],
    );
    assert.deepEqual(JSON.parse(requests[0].prompt).references, []);
    const repair = JSON.parse(requests[1].prompt);
    assert.equal(repair.validationFeedback.code, 'unsupported_citation');
    assert.match(repair.validationFeedback.message, /citations array must be empty/);
    assert.equal(repair.previousDraft, bad);
    assert.deepEqual(result[0].documents[0].evidence.references, []);
    assert.deepEqual(phases, ['organizing', 'validating', 'organizing', 'validating']);
});

test('JSON mode recovers from an SDK parse failure instead of bypassing the repair loop', async () => {
    const model = new MockLanguageModelV4({
        doGenerate: [
            {
                content: [{ type: 'text', text: '{}{}' }],
                finishReason: { unified: 'stop', raw: 'stop' },
                warnings: [],
                usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
            },
            {
                content: [{ type: 'text', text: outline() }],
                finishReason: { unified: 'stop', raw: 'stop' },
                warnings: [],
                usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
            },
        ],
    });
    const result = await generateValidatedDocumentDraft({ ...base, generate: request => generateText({ ...request, model, output: Output.json() }) });
    assert.equal(model.doGenerateCalls.length, 2);
    assert.equal(model.doGenerateCalls[0].responseFormat?.type, 'json');
    assert.equal(result[0].documents.length, 1);
    assert.match(JSON.stringify(model.doGenerateCalls[1].prompt), /invalid_json/);
});

test('missing tables and invalid indexes get specific feedback and remain required after repair', async () => {
    for (const [invalid, code] of [
        [outline({ tables: [0] }), 'missing_tables'],
        [outline({ tables: [0, 2] }), 'unknown_table'],
    ] as const) {
        let calls = 0;
        await generateValidatedDocumentDraft({
            ...base,
            generate: async request => {
                if (calls++) assert.equal(JSON.parse(request.prompt).validationFeedback.code, code);
                return { text: calls === 1 ? invalid : outline() };
            },
        });
        assert.equal(calls, 2);
    }
});

test('failed repairs expose a safe specific error and never return a draft with invented citations', async () => {
    let calls = 0;
    await assert.rejects(
        generateValidatedDocumentDraft({
            ...base,
            generate: async () => {
                calls++;
                return { text: outline({ citations: [{ reference: 0, quote: 'secret source text', explanation: 'Unsupported' }] }) };
            },
        }),
        error => error instanceof DocumentDraftValidationError && error.code === 'unsupported_citation' && error.message === 'InvalidDraftReferences',
    );
    assert.equal(calls, 2);
    await assert.rejects(
        generateValidatedDocumentDraft({ ...base, generate: async () => ({ text: '{}{}' }) }),
        error => error instanceof DocumentDraftValidationError && error.code === 'invalid_json' && error.message === 'InvalidDraftFormat',
    );
    await assert.rejects(
        generateValidatedDocumentDraft({ ...base, generate: async () => ({ text: '{"topics":[]}' }) }),
        error => error instanceof DocumentDraftValidationError && error.code === 'invalid_structure' && error.message === 'InvalidDraftStructure',
    );
});

test('truncated output is retried as a compact outline and persistent truncation is reported explicitly', async () => {
    const budgets: number[] = [];
    await generateValidatedDocumentDraft({
        ...base,
        generate: async request => {
            budgets.push(request.maxOutputTokens);
            return { text: outline(), finishReason: budgets.length === 1 ? 'length' : 'stop' };
        },
    });
    assert.deepEqual(budgets, [7000, 7000]);
    await assert.rejects(
        generateValidatedDocumentDraft({ ...base, generate: async () => ({ text: outline(), finishReason: 'length' }) }),
        error => error instanceof DocumentDraftValidationError && error.code === 'truncated_output' && error.message === 'DraftTruncated',
    );
});

test('JSON wrapping preserves exact quotes while concatenated objects and paraphrased evidence are rejected', () => {
    const references = [{ kind: 'document' as const, id: 'policy', title: 'Policy', text: 'Use “requested_date” for refunds.' }];
    const text = outline({ citations: [{ reference: 0, quote: references[0].text, explanation: 'Reporting date' }] });
    const result = renderDraft('```json\n' + text + '\n```', base.source, tables, references, base.label);
    assert.deepEqual(result[0].documents[0].evidence.references, [{ kind: 'document', id: 'policy' }]);
    assert.throws(
        () => renderDraft(text + text, base.source, tables, references, base.label),
        error => error instanceof DocumentDraftValidationError && error.code === 'invalid_json',
    );
    assert.throws(
        () => renderDraft(outline({ citations: [{ reference: 0, quote: 'Use payment date.', explanation: 'Incorrect' }] }), base.source, tables, references, base.label),
        /exact substring/,
    );
});

test('transport failures are not misreported as validation errors and oversized inputs make no model calls', async () => {
    const failure = new Error('provider unavailable');
    let calls = 0;
    await assert.rejects(
        generateValidatedDocumentDraft({
            ...base,
            generate: async () => {
                calls++;
                throw failure;
            },
        }),
        error => error === failure,
    );
    assert.equal(calls, 1);
    await assert.rejects(
        generateValidatedDocumentDraft({
            ...base,
            goal: 'x'.repeat(150_000),
            generate: async () => {
                throw new Error('must not call');
            },
        }),
        /TooLarge/,
    );
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMentionDocument, serializeMentionDocument } from '@/lib/chat-context/mention-document';
import { defaultReferences, mentionLabel, rankReferences, referenceInScope, textWithMentionIds, validMentionSpans, type ReferenceOption } from '@/lib/chat-context/mentions';
import { readRecentReferences, recentStorageKey, updateRecentReferences } from '@/lib/chat-context/recent-references';
import { chatContextSchema, referenceKey, type ChatReference } from '@/lib/chat-context/types';

const report: ChatReference = { kind: 'report', id: 'revenue', title: '月度收入', revision: 6 };
const table: ChatReference = { kind: 'table', connectionId: 'commerce', database: 'main', schema: 'public', table: 'orders', title: 'orders' };

test('inline mentions round-trip Chinese, emoji, line breaks, duplicate references and surrounding text', () => {
    const text = `📈 对比 ${mentionLabel(report)}\n和 ${mentionLabel(table)}，再检查 ${mentionLabel(report)}。`;
    const spans = [report, table, report].map((ref, index) => {
        const start = index === 2 ? text.lastIndexOf(mentionLabel(ref)) : text.indexOf(mentionLabel(ref));
        return { start, end: start + mentionLabel(ref).length, referenceKey: referenceKey(ref) };
    });
    const draft = serializeMentionDocument(buildMentionDocument(text, [report, table], spans));
    assert.equal(draft.text, text);
    assert.deepEqual(draft.mentionSpans, spans);
    assert.deepEqual(draft.references, [report, table]);
    assert.match(textWithMentionIds(text, spans), /report:revenue:v6/);
    assert.equal(serializeMentionDocument(buildMentionDocument('@orders')).references.length, 0);
});

test('overlapping, out-of-bounds, forged and unknown mention positions are rejected', () => {
    const text = mentionLabel(report);
    const span = { start: 0, end: text.length, referenceKey: referenceKey(report) };
    assert.ok(validMentionSpans(text, [report], [span]));
    for (const spans of [[span, span], [{ ...span, start: -1 }], [{ ...span, end: text.length + 1 }], [{ ...span, referenceKey: 'missing' }]]) {
        assert.equal(validMentionSpans(text, [report], spans), false);
    }
    assert.equal(validMentionSpans('something else', [report], [span]), false);
    assert.equal(chatContextSchema.safeParse({ mentionSpans: [{ ...span, start: -1 }] }).success, false);
});

test('resource identity distinguishes sources, schemas and immutable report revisions', () => {
    assert.notEqual(referenceKey(report), referenceKey({ ...report, revision: 7 }));
    assert.notEqual(referenceKey(table), referenceKey({ ...table, connectionId: 'warehouse' }));
    assert.notEqual(referenceKey(table), referenceKey({ ...table, schema: 'archive' }));
    assert.equal(referenceInScope(table, { connectionIds: ['commerce'], databasesByConnection: { commerce: ['analytics'] } }), false);
    assert.equal(referenceInScope(table, { connectionIds: [], connectionMode: 'auto' }), true);
});

test('search ranks exact titles across types before context and does not interpret type words', () => {
    const options: ReferenceOption[] = [
        { reference: table, detail: 'Commerce / main' },
        { reference: { ...report, title: 'orders' }, detail: 'Report · v6', current: true },
        { reference: { kind: 'artifact', id: 'result', title: 'orders by month' }, detail: 'Result Set · 12 rows', current: true, artifactType: 'result_set' },
        { reference: { ...table, table: 'other', title: 'previous orders' }, detail: 'Commerce / main', recentAt: 5 },
        { reference: { ...table, table: 'fallback', title: 'customers' }, detail: 'orders warehouse' },
    ];
    assert.deepEqual(
        rankReferences(options, 'orders').map(item => item.reference.title),
        ['orders', 'orders', 'orders by month', 'previous orders', 'customers'],
    );
    assert.equal(rankReferences(options, 'orders')[0].reference.kind, 'report');
    assert.equal(rankReferences(options, '', 'result_set').length, 1);
    assert.equal(rankReferences(options, 'report')[0].reference.kind, 'report');
    assert.equal(rankReferences(options, 'table').length, 0);
});

test('default groups use current resources first, hide duplicate report versions, and cap each group', () => {
    const options: ReferenceOption[] = [
        { reference: report, detail: '', current: true, timestamp: '2026-10-27' },
        { reference: { ...report, revision: 5 }, detail: '', recentAt: 999 },
        ...Array.from({ length: 6 }, (_, i) => ({ reference: { ...table, table: String(i) }, detail: '', recentAt: i + 1 })),
    ];
    const result = defaultReferences(rankReferences(options, ''));
    assert.equal(result.length, 4);
    assert.equal(result[0].group, 'current');
    assert.equal(result[1].recentAt, 6);
    assert.ok(result.slice(1).every(item => item.group === 'recent' && item.reference.kind === 'table'));
});

test('recent references isolate accounts, deduplicate, retain versions and cap at 30', () => {
    assert.notEqual(recentStorageKey('a', 'org'), recentStorageKey('b', 'org'));
    assert.notEqual(recentStorageKey('a', 'org'), recentStorageKey('a', 'other'));
    const previous = updateRecentReferences([], [report, table], 1);
    const next = updateRecentReferences(previous, [report, { ...report, revision: 7 }], 2);
    assert.equal(next.length, 3);
    assert.equal(next.find(item => referenceKey(item.reference) === referenceKey(report))?.usedAt, 2);
    assert.equal(
        updateRecentReferences(
            next,
            Array.from({ length: 40 }, (_, i) => ({ ...table, table: String(i) })),
            3,
        ).length,
        30,
    );
    assert.deepEqual(
        readRecentReferences(
            {
                getItem: () => {
                    throw new Error('disabled');
                },
            },
            'key',
        ),
        [],
    );
    assert.deepEqual(readRecentReferences({ getItem: () => '{broken' }, 'key'), []);
});

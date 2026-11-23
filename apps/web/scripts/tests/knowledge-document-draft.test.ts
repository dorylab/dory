import assert from 'node:assert/strict';
import test from 'node:test';
import SqliteDatabase from 'better-sqlite3';
import { getSqliteSchemaGraph, getSqliteTableColumns } from '../../../../packages/drivers/src/database/sqlite/runtime';
import { addConstraints, renderDraft, type Reference, type TableFacts } from '../../lib/server/knowledge-document-draft';

const facts: TableFacts[] = ['orders', 'refunds'].map(name => ({
    name,
    comment: null,
    columns: [{ columnName: 'order_id', columnType: 'integer', nullable: false }],
    foreignKeys: null,
}));
const doc = {
    title: 'Orders and refunds',
    introduction: 'Start with orders.',
    tables: [0, 1],
    citations: [] as { reference: number; quote: string; explanation: string }[],
    questions: ['Does order_id refer to orders?'],
};
const draft = (refs: Reference[], changes: Partial<typeof doc> = {}) =>
    renderDraft(JSON.stringify({ topics: [{ name: 'Commerce', documents: [{ ...doc, ...changes }] }] }), { database: 'shop', name: 'Commerce' }, facts, refs, k => k)[0]
        .documents[0];
test('schema only draft renders real columns, unknown keys and stable table digests', () => {
    const file = draft([]);
    assert.match(file.contentText, /order\\_id \| integer \| ✗ \| \?/);
    assert.match(file.contentText, /ForeignKeys · Unknown/);
    assert.match(file.contentText, /Questions/);
    assert.deepEqual(
        file.evidence.tables.map(t => t.name),
        ['orders', 'refunds'],
    );
    assert.equal(file.evidence.tables[0].digest.length, 64);
    assert.deepEqual(file.evidence, draft([]).evidence);
    assert.throws(() => draft([], { tables: [0] }), /omitted/);
    assert.throws(() => draft([], { tables: [0, 2] }), /Unknown table/);
});
test('selected document and query evidence stay attributable when they disagree', () => {
    const refs: Reference[] = [
        { kind: 'document', id: 'doc', title: 'Refund policy', text: 'Count by requested date.' },
        { kind: 'query', id: 'query', title: 'Refund SQL', text: 'SELECT paid_date\nGROUP BY paid_date' },
    ];
    const citations = refs.map((ref, reference) => ({ reference, quote: ref.text, explanation: ref.title }));
    const one = draft(refs.slice(0, 1), { citations: citations.slice(0, 1) });
    assert.match(one.contentText, /tab=documents&file=doc/);
    const file = draft(refs, { citations, questions: ['Which date defines a refund?'] });
    assert.match(file.contentText, /Count by requested date/);
    assert.match(file.contentText, /GROUP BY paid\\_date/);
    assert.match(file.contentText, /\n> GROUP BY paid/);
    assert.match(file.contentText, /tab=queries&query=query/);
    assert.match(file.contentText, /Which date defines a refund/);
    assert.throws(() => draft(refs, { citations: [{ ...citations[0], quote: 'Made up' }] }), /Unsupported citation/);
    assert.throws(() => draft([], { citations }), /Unsupported citation/);
});

test('real SQLite metadata preserves declared joins without inventing a join for a matching column', () => {
    const db = new SqliteDatabase(':memory:');
    try {
        db.exec('CREATE TABLE orders (id INTEGER PRIMARY KEY); CREATE TABLE refunds (order_id INTEGER REFERENCES orders(id)); CREATE TABLE payments (order_id INTEGER);');
        const names = ['orders', 'refunds', 'payments'];
        const tables: TableFacts[] = names.map(name => ({ name, comment: null, columns: getSqliteTableColumns(db, 'main', name), foreignKeys: null }));
        const focus = names.map(name => ({ schema: null, name }));
        addConstraints(tables, focus, getSqliteSchemaGraph(db, { database: 'main', focusTables: focus, depth: 0, columnMode: 'keys' }));
        assert.ok(tables[1].foreignKeys?.some(f => f.includes('refunds(order_id) → orders(id)')));
        assert.deepEqual(tables[2].foreignKeys, []);
        assert.equal(tables[0].columns[0].isPrimaryKey, true);
    } finally {
        db.close();
    }
});

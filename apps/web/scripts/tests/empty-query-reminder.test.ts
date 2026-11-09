import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyQueryReminder } from '@/lib/ai/agents/empty-query-reminder';

const step = (id: string, toolName: string, input: unknown, output: unknown) => ({
    toolCalls: [{ toolCallId: id, toolName, input }],
    toolResults: [{ toolCallId: id, toolName, output }],
});
test('empty lookup points to uninspected tables in the same source, without assuming missing data', () => {
    const scope = { connectionId: 'financials', database: 'main' };
    const steps = [
        step(
            'list',
            'exploreSchema',
            { ...scope, operation: 'list_tables' },
            { ok: true, tables: [{ name: 'companies' }, { name: 'regional_companies' }, { name: 'regional_financials' }] },
        ),
        step('other', 'exploreSchema', { connectionId: 'other', database: 'main', operation: 'list_tables' }, { tables: [{ name: 'unrelated' }] }),
        step('describe', 'exploreSchema', { ...scope, operation: 'describe_table', table: 'companies' }, { ok: true, columns: [] }),
        step('empty', 'sqlRunner', scope, { result: [], columns: [], rowCount: 0 }),
    ];
    const reminder = emptyQueryReminder(steps);
    assert.match(reminder, /"regional_companies","regional_financials"/);
    assert.doesNotMatch(reminder, /"companies"|unrelated/);
    assert.match(reminder, /not row values/);
    assert.match(reminder, /LOWER\(column\) must compare to a lowercase literal/);
    assert.match(reminder, /verify the relevant fact table directly/);
    assert.equal(emptyQueryReminder([...steps, step('found', 'sqlRunner', scope, { result: [{ value: 1 }], columns: [], rowCount: 1 })]), '');
    assert.equal(emptyQueryReminder([...steps, step('failed', 'sqlRunner', scope, { ok: false, rowCount: 0 })]), '');
});

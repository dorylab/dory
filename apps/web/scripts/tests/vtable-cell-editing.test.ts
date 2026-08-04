import assert from 'node:assert/strict';

import {
    getCellEditorKind,
    getDateInputType,
    parseEditDraft,
    toDateEditDraft,
    toEditDraft,
} from '../../app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/cell-editing';

const messages = {
    chooseBoolean: 'choose boolean',
    invalidNumber: 'invalid number',
};

assert.equal(getCellEditorKind('TEXT'), 'text');
assert.equal(getCellEditorKind('INTEGER'), 'number');
assert.equal(getCellEditorKind('NUMERIC(38, 10)'), 'precise-number');
assert.equal(getCellEditorKind('BOOLEAN'), 'boolean');
assert.equal(getCellEditorKind('TIMESTAMP WITH TIME ZONE'), 'date');
assert.equal(getCellEditorKind('JSONB'), 'complex');

assert.equal(toEditDraft(null), '');
assert.equal(toEditDraft({ nested: true }), '{"nested":true}');
assert.equal(toDateEditDraft('2026-08-03 12:34:56', 'timestamp'), '2026-08-03T12:34:56');
assert.equal(toDateEditDraft('12:34:56', 'time'), '12:34:56');
assert.equal(getDateInputType('date'), 'date');
assert.equal(getDateInputType('datetime'), 'datetime-local');
assert.equal(getDateInputType('time'), 'time');

assert.equal(parseEditDraft('number', '42.5', messages), 42.5);
assert.equal(parseEditDraft('precise-number', '9007199254740993', messages), '9007199254740993');
assert.equal(parseEditDraft('boolean', 'true', messages), true);
assert.equal(parseEditDraft('text', '', messages), '');
assert.throws(() => parseEditDraft('number', '', messages), /invalid number/);
assert.throws(() => parseEditDraft('precise-number', '1.2.3', messages), /invalid number/);
assert.throws(() => parseEditDraft('boolean', '', messages), /choose boolean/);

console.log('vtable cell editing tests passed');

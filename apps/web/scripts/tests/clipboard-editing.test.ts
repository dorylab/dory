import assert from 'node:assert/strict';

import { mapClipboardMatrix, parseClipboardMatrix } from '../../app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable/clipboard-editing';

assert.deepEqual(parseClipboardMatrix('a\tb\r\nc\td\r\n'), [
    ['a', 'b'],
    ['c', 'd'],
]);
assert.deepEqual(parseClipboardMatrix('"Ada, Lovelace",active\n"Grace\nHopper",inactive'), [
    ['Ada, Lovelace', 'active'],
    ['Grace\nHopper', 'inactive'],
]);
assert.deepEqual(parseClipboardMatrix('Shanghai, China'), [['Shanghai, China']]);
assert.deepEqual(parseClipboardMatrix('one\ntwo\nthree'), [['one'], ['two'], ['three']]);
assert.deepEqual(parseClipboardMatrix(''), [['']]);

assert.deepEqual(
    mapClipboardMatrix({
        matrix: [['same']],
        selectedCells: [
            { rowIndex: 0, columnIndex: 1 },
            { rowIndex: 1, columnIndex: 1 },
            { rowIndex: 2, columnIndex: 1 },
        ],
        focusedCell: { rowIndex: 2, columnIndex: 1 },
        rowCount: 3,
        columnCount: 3,
    }),
    {
        ok: true,
        assignments: [
            { rowIndex: 0, columnIndex: 1, value: 'same' },
            { rowIndex: 1, columnIndex: 1, value: 'same' },
            { rowIndex: 2, columnIndex: 1, value: 'same' },
        ],
    },
);

assert.deepEqual(
    mapClipboardMatrix({
        matrix: [
            ['a', ''],
            ['b', 'c'],
        ],
        selectedCells: [{ rowIndex: 1, columnIndex: 0 }],
        focusedCell: { rowIndex: 1, columnIndex: 0 },
        rowCount: 4,
        columnCount: 3,
    }),
    {
        ok: true,
        assignments: [
            { rowIndex: 1, columnIndex: 0, value: 'a' },
            { rowIndex: 1, columnIndex: 1, value: '' },
            { rowIndex: 2, columnIndex: 0, value: 'b' },
            { rowIndex: 2, columnIndex: 1, value: 'c' },
        ],
    },
);

assert.deepEqual(
    mapClipboardMatrix({
        matrix: [
            ['a', 'b'],
            ['c', 'd'],
        ],
        selectedCells: [{ rowIndex: 2, columnIndex: 2 }],
        focusedCell: { rowIndex: 2, columnIndex: 2 },
        rowCount: 3,
        columnCount: 3,
    }),
    { ok: false, reason: 'out-of-bounds' },
);

assert.deepEqual(
    mapClipboardMatrix({
        matrix: [['a'], ['b']],
        selectedCells: [
            { rowIndex: 0, columnIndex: 0 },
            { rowIndex: 1, columnIndex: 1 },
        ],
        focusedCell: { rowIndex: 0, columnIndex: 0 },
        rowCount: 3,
        columnCount: 3,
    }),
    { ok: false, reason: 'non-rectangular' },
);

console.log('clipboard editing tests passed');

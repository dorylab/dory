import assert from 'node:assert/strict';

import {
    applyTableCellEdit,
    applyTableCellEdits,
    clearTableEdits,
    createEmptyTableEditSession,
    getPendingEditCounts,
    getRowKey,
    getTableEditLimitViolation,
    overlayPendingRow,
    pendingRowsToUpdates,
    redoTableEdit,
    removeCommittedTableEdits,
    revertTableCellEdit,
    revertTableCells,
    revertTableRowEdit,
    undoTableEdit,
    type TableEditViewSnapshot,
} from '../../app/(app)/[organization]/components/table-browser/components/data-preview/table-editor-store';

const sourceView: TableEditViewSnapshot = {
    pageIndex: 2,
    pageSize: 50,
    search: 'alice',
    filters: [{ col: 'status', kind: 'string', op: 'equals', value: 'active' }],
    sort: { column: 'created_at', direction: 'desc' },
};

const identity = getRowKey({ tenant_id: 'acme', id: 42 }, ['tenant_id', 'id']);
assert.ok(identity);
assert.equal(
    identity.rowKey,
    JSON.stringify([
        ['tenant_id', 'acme'],
        ['id', 42],
    ]),
);
assert.deepEqual(identity.key, { tenant_id: 'acme', id: 42 });
assert.equal(getRowKey({ tenant_id: 'acme', id: { unsupported: true } }, ['tenant_id', 'id']), null);

let session = createEmptyTableEditSession();
session = applyTableCellEdit(session, {
    ...identity,
    column: 'name',
    originalValue: 'Alice',
    nextValue: 'Alicia',
    sourceRowIndex: 3,
    sourceView,
});
assert.deepEqual(getPendingEditCounts(session), { rowCount: 1, cellCount: 1 });

session = applyTableCellEdit(session, {
    ...identity,
    column: 'name',
    originalValue: 'Alicia',
    nextValue: 'Ally',
    sourceRowIndex: 3,
    sourceView,
});
assert.deepEqual(pendingRowsToUpdates(session), [
    {
        key: identity.key,
        changes: [{ column: 'name', originalValue: 'Alice', nextValue: 'Ally' }],
    },
]);

session = applyTableCellEdit(session, {
    ...identity,
    column: 'active',
    originalValue: true,
    nextValue: false,
    sourceRowIndex: 3,
    sourceView,
});
assert.deepEqual(overlayPendingRow({ tenant_id: 'acme', id: 42, name: 'Alice', active: true }, identity.rowKey, session), {
    tenant_id: 'acme',
    id: 42,
    name: 'Ally',
    active: false,
});
assert.deepEqual(getPendingEditCounts(session), { rowCount: 1, cellCount: 2 });

const twoChanges = session;
session = revertTableCellEdit(session, identity.rowKey, 'active');
assert.deepEqual(getPendingEditCounts(session), { rowCount: 1, cellCount: 1 });
session = undoTableEdit(session);
assert.deepEqual(session.rows, twoChanges.rows);
session = redoTableEdit(session);
assert.deepEqual(getPendingEditCounts(session), { rowCount: 1, cellCount: 1 });

session = applyTableCellEdit(session, {
    ...identity,
    column: 'name',
    originalValue: 'Ally',
    nextValue: 'Alice',
    sourceRowIndex: 3,
    sourceView,
});
assert.deepEqual(getPendingEditCounts(session), { rowCount: 0, cellCount: 0 });

session = undoTableEdit(session);
assert.deepEqual(getPendingEditCounts(session), { rowCount: 1, cellCount: 1 });
session = revertTableRowEdit(session, identity.rowKey);
assert.deepEqual(getPendingEditCounts(session), { rowCount: 0, cellCount: 0 });
session = undoTableEdit(session);
assert.deepEqual(getPendingEditCounts(session), { rowCount: 1, cellCount: 1 });
session = clearTableEdits(session);
assert.deepEqual(getPendingEditCounts(session), { rowCount: 0, cellCount: 0 });

let nullableSession = createEmptyTableEditSession();
nullableSession = applyTableCellEdit(nullableSession, {
    ...identity,
    column: 'nickname',
    originalValue: null,
    nextValue: 'Ali',
    sourceRowIndex: 3,
    sourceView,
});
nullableSession = applyTableCellEdit(nullableSession, {
    ...identity,
    column: 'nickname',
    originalValue: 'Ali',
    nextValue: 'Al',
    sourceRowIndex: 3,
    sourceView,
});
assert.deepEqual(pendingRowsToUpdates(nullableSession)[0]?.changes, [{ column: 'nickname', originalValue: null, nextValue: 'Al' }]);
nullableSession = applyTableCellEdit(nullableSession, {
    ...identity,
    column: 'nickname',
    originalValue: 'Al',
    nextValue: null,
    sourceRowIndex: 3,
    sourceView,
});
assert.deepEqual(getPendingEditCounts(nullableSession), { rowCount: 0, cellCount: 0 });

const isolatedSessions = {
    'tab-a:data-preview': twoChanges,
    'tab-b:data-preview': createEmptyTableEditSession(),
};
assert.equal(getPendingEditCounts(isolatedSessions['tab-a:data-preview']).cellCount, 2);
assert.equal(getPendingEditCounts(isolatedSessions['tab-b:data-preview']).cellCount, 0);

const secondIdentity = getRowKey({ tenant_id: 'acme', id: 43 }, ['tenant_id', 'id']);
assert.ok(secondIdentity);
let partialSession = applyTableCellEdit(twoChanges, {
    ...secondIdentity,
    column: 'name',
    originalValue: 'Bob',
    nextValue: 'Bobby',
    sourceRowIndex: 4,
    sourceView,
});
partialSession = removeCommittedTableEdits(partialSession, [0]);
assert.deepEqual(pendingRowsToUpdates(partialSession), [
    {
        key: secondIdentity.key,
        changes: [{ column: 'name', originalValue: 'Bob', nextValue: 'Bobby' }],
    },
]);
assert.equal(partialSession.past.length, 0);

const thirdIdentity = getRowKey({ tenant_id: 'acme', id: 44 }, ['tenant_id', 'id']);
assert.ok(thirdIdentity);
let batchSession = applyTableCellEdits(createEmptyTableEditSession(), [
    {
        ...identity,
        column: 'name',
        originalValue: 'Alice',
        nextValue: 'Updated',
        sourceRowIndex: 3,
        sourceView,
    },
    {
        ...secondIdentity,
        column: 'name',
        originalValue: 'Bob',
        nextValue: 'Updated',
        sourceRowIndex: 4,
        sourceView,
    },
    {
        ...thirdIdentity,
        column: 'name',
        originalValue: 'Carol',
        nextValue: 'Updated',
        sourceRowIndex: 5,
        sourceView,
    },
]);
assert.deepEqual(getPendingEditCounts(batchSession), { rowCount: 3, cellCount: 3 });
assert.equal(batchSession.past.length, 1);
batchSession = undoTableEdit(batchSession);
assert.deepEqual(getPendingEditCounts(batchSession), { rowCount: 0, cellCount: 0 });
batchSession = redoTableEdit(batchSession);
assert.deepEqual(getPendingEditCounts(batchSession), { rowCount: 3, cellCount: 3 });

batchSession = applyTableCellEdits(batchSession, [
    {
        ...identity,
        column: 'name',
        originalValue: 'Updated',
        nextValue: 'Final',
        sourceRowIndex: 3,
        sourceView,
    },
]);
assert.deepEqual(pendingRowsToUpdates(batchSession)[0]?.changes, [{ column: 'name', originalValue: 'Alice', nextValue: 'Final' }]);

const historyBeforeNoop = batchSession.past.length;
batchSession = applyTableCellEdits(batchSession, [
    {
        ...identity,
        column: 'name',
        originalValue: 'Final',
        nextValue: 'Final',
        sourceRowIndex: 3,
        sourceView,
    },
]);
assert.equal(batchSession.past.length, historyBeforeNoop);

batchSession = revertTableCells(batchSession, [
    { rowKey: identity.rowKey, column: 'name' },
    { rowKey: secondIdentity.rowKey, column: 'name' },
    { rowKey: thirdIdentity.rowKey, column: 'name' },
]);
assert.deepEqual(getPendingEditCounts(batchSession), { rowCount: 0, cellCount: 0 });
assert.equal(batchSession.past.length, historyBeforeNoop + 1);
batchSession = undoTableEdit(batchSession);
assert.deepEqual(getPendingEditCounts(batchSession), { rowCount: 3, cellCount: 3 });

const oversizedSession = applyTableCellEdits(
    createEmptyTableEditSession(),
    Array.from({ length: 101 }, (_, index) => {
        const rowIdentity = getRowKey({ id: index + 1 }, ['id']);
        assert.ok(rowIdentity);
        return {
            ...rowIdentity,
            column: 'name',
            originalValue: `name-${index + 1}`,
            nextValue: 'bulk',
            sourceRowIndex: index,
            sourceView,
        };
    }),
);
assert.equal(getTableEditLimitViolation(oversizedSession, { maxRows: 100, maxChangesPerRow: 200 }), 'rows');
const tooManyFieldsSession = applyTableCellEdits(
    createEmptyTableEditSession(),
    Array.from({ length: 201 }, (_, index) => ({
        ...identity,
        column: `field_${index}`,
        originalValue: `before-${index}`,
        nextValue: `after-${index}`,
        sourceRowIndex: 3,
        sourceView,
    })),
);
assert.equal(getTableEditLimitViolation(tooManyFieldsSession, { maxRows: 100, maxChangesPerRow: 200 }), 'fields');

console.log('table editor store tests passed');

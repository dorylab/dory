import { atom } from 'jotai';
import type { TableMutationValue, TablePreviewFilter, TablePreviewSort, TableUpdateRow } from '@dory/drivers/types';

export type TableEditViewSnapshot = {
    pageIndex: number;
    pageSize: number;
    search: string;
    filters: TablePreviewFilter[];
    sort: TablePreviewSort | null;
};

export type PendingCellChange = {
    column: string;
    originalValue: TableMutationValue;
    nextValue: TableMutationValue;
    sourceRowIndex: number;
    sourceView: TableEditViewSnapshot;
};

export type PendingRowChange = {
    rowKey: string;
    key: Record<string, TableMutationValue>;
    changes: Record<string, PendingCellChange>;
};

type PendingRows = Record<string, PendingRowChange>;

export type TableEditSession = {
    rows: PendingRows;
    past: PendingRows[];
    future: PendingRows[];
};

export type TableEditSessions = Record<string, TableEditSession>;
export type TableIdentitySelections = Record<string, string[]>;

export const tableEditSessionsAtom = atom<TableEditSessions>({});
export const tableIdentitySelectionsAtom = atom<TableIdentitySelections>({});

const HISTORY_LIMIT = 100;

export function createEmptyTableEditSession(): TableEditSession {
    return {
        rows: {},
        past: [],
        future: [],
    };
}

function commitRows(session: TableEditSession, rows: PendingRows): TableEditSession {
    if (rows === session.rows) return session;
    return {
        rows,
        past: [...session.past.slice(-(HISTORY_LIMIT - 1)), session.rows],
        future: [],
    };
}

function withoutEmptyRow(rows: PendingRows, rowKey: string, row: PendingRowChange) {
    if (Object.keys(row.changes).length > 0) {
        return { ...rows, [rowKey]: row };
    }
    const next = { ...rows };
    delete next[rowKey];
    return next;
}

export function applyTableCellEdit(
    session: TableEditSession,
    input: {
        rowKey: string;
        key: Record<string, TableMutationValue>;
        column: string;
        originalValue: TableMutationValue;
        nextValue: TableMutationValue;
        sourceRowIndex: number;
        sourceView: TableEditViewSnapshot;
    },
): TableEditSession {
    const currentRow = session.rows[input.rowKey];
    const currentCell = currentRow?.changes[input.column];
    const originalValue = currentCell ? currentCell.originalValue : input.originalValue;
    const currentValue = currentCell ? currentCell.nextValue : input.originalValue;

    if (Object.is(currentValue, input.nextValue)) {
        return session;
    }

    const row: PendingRowChange = currentRow ?? {
        rowKey: input.rowKey,
        key: input.key,
        changes: {},
    };
    const nextChanges = { ...row.changes };
    if (Object.is(originalValue, input.nextValue)) {
        delete nextChanges[input.column];
    } else {
        nextChanges[input.column] = {
            column: input.column,
            originalValue,
            nextValue: input.nextValue,
            sourceRowIndex: input.sourceRowIndex,
            sourceView: input.sourceView,
        };
    }

    return commitRows(
        session,
        withoutEmptyRow(session.rows, input.rowKey, {
            ...row,
            changes: nextChanges,
        }),
    );
}

export function revertTableCellEdit(session: TableEditSession, rowKey: string, column: string): TableEditSession {
    const row = session.rows[rowKey];
    if (!row?.changes[column]) return session;
    const changes = { ...row.changes };
    delete changes[column];
    return commitRows(session, withoutEmptyRow(session.rows, rowKey, { ...row, changes }));
}

export function revertTableRowEdit(session: TableEditSession, rowKey: string): TableEditSession {
    if (!session.rows[rowKey]) return session;
    const rows = { ...session.rows };
    delete rows[rowKey];
    return commitRows(session, rows);
}

export function clearTableEdits(session: TableEditSession): TableEditSession {
    if (!Object.keys(session.rows).length) return session;
    return commitRows(session, {});
}

export function removeCommittedTableEdits(session: TableEditSession, committedRowIndexes: number[]): TableEditSession {
    const rowKeys = Object.keys(session.rows);
    const keysToRemove = new Set(committedRowIndexes.map(index => rowKeys[index]).filter((key): key is string => Boolean(key)));
    if (!keysToRemove.size) return session;
    return {
        rows: Object.fromEntries(Object.entries(session.rows).filter(([rowKey]) => !keysToRemove.has(rowKey))),
        past: [],
        future: [],
    };
}

export function undoTableEdit(session: TableEditSession): TableEditSession {
    const previous = session.past.at(-1);
    if (!previous) return session;
    return {
        rows: previous,
        past: session.past.slice(0, -1),
        future: [session.rows, ...session.future].slice(0, HISTORY_LIMIT),
    };
}

export function redoTableEdit(session: TableEditSession): TableEditSession {
    const next = session.future[0];
    if (!next) return session;
    return {
        rows: next,
        past: [...session.past.slice(-(HISTORY_LIMIT - 1)), session.rows],
        future: session.future.slice(1),
    };
}

export function pendingRowsToUpdates(session: TableEditSession): TableUpdateRow[] {
    return Object.values(session.rows).map(row => ({
        key: row.key,
        changes: Object.values(row.changes).map(change => ({
            column: change.column,
            originalValue: change.originalValue,
            nextValue: change.nextValue,
        })),
    }));
}

export function getPendingEditCounts(session: TableEditSession) {
    const rows = Object.values(session.rows);
    return {
        rowCount: rows.length,
        cellCount: rows.reduce((total, row) => total + Object.keys(row.changes).length, 0),
    };
}

export function getRowKey(
    row: Record<string, unknown>,
    identityColumns: string[],
): {
    rowKey: string;
    key: Record<string, TableMutationValue>;
} | null {
    const key: Record<string, TableMutationValue> = {};
    for (const column of identityColumns) {
        const value = toTableMutationValue(row[column]);
        if (value === undefined) return null;
        key[column] = value;
    }
    return {
        key,
        rowKey: JSON.stringify(identityColumns.map(column => [column, key[column]])),
    };
}

export function toTableMutationValue(value: unknown): TableMutationValue | undefined {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Date) return value.toISOString();
    return undefined;
}

export function overlayPendingRow(row: Record<string, unknown>, rowKey: string, session: TableEditSession) {
    const pending = session.rows[rowKey];
    if (!pending) return row;
    const overlaid = { ...row };
    Object.values(pending.changes).forEach(change => {
        overlaid[change.column] = change.nextValue;
    });
    return overlaid;
}

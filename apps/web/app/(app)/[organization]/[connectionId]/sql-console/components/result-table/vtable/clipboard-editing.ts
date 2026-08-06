import { csvParseRows, tsvParseRows } from 'd3-dsv';

export type ClipboardCell = {
    rowIndex: number;
    columnIndex: number;
};

export type ClipboardAssignment = ClipboardCell & {
    value: string;
};

export type ClipboardMappingResult = { ok: true; assignments: ClipboardAssignment[] } | { ok: false; reason: 'empty' | 'no-target' | 'non-rectangular' | 'out-of-bounds' };

export function parseClipboardMatrix(text: string): string[][] {
    const normalized = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    if (!normalized.length) return [['']];
    if (normalized.includes('\t')) return tsvParseRows(normalized);
    if (normalized.includes('\n') && normalized.includes(',')) return csvParseRows(normalized);
    return normalized
        .replace(/\n$/, '')
        .split('\n')
        .map(value => [value]);
}

function getRectBounds(cells: ClipboardCell[]) {
    if (!cells.length) return null;
    let minRow = Number.POSITIVE_INFINITY;
    let maxRow = Number.NEGATIVE_INFINITY;
    let minColumn = Number.POSITIVE_INFINITY;
    let maxColumn = Number.NEGATIVE_INFINITY;
    const unique = new Set<string>();

    for (const cell of cells) {
        minRow = Math.min(minRow, cell.rowIndex);
        maxRow = Math.max(maxRow, cell.rowIndex);
        minColumn = Math.min(minColumn, cell.columnIndex);
        maxColumn = Math.max(maxColumn, cell.columnIndex);
        unique.add(`${cell.rowIndex}:${cell.columnIndex}`);
    }

    const expectedSize = (maxRow - minRow + 1) * (maxColumn - minColumn + 1);
    return {
        minRow,
        maxRow,
        minColumn,
        maxColumn,
        rectangular: unique.size === expectedSize,
    };
}

export function mapClipboardMatrix({
    matrix,
    selectedCells,
    focusedCell,
    rowCount,
    columnCount,
}: {
    matrix: string[][];
    selectedCells: ClipboardCell[];
    focusedCell: ClipboardCell | null;
    rowCount: number;
    columnCount: number;
}): ClipboardMappingResult {
    if (!matrix.length || matrix.every(row => row.length === 0)) return { ok: false, reason: 'empty' };

    const singleValue = matrix.length === 1 && matrix[0]?.length === 1;
    if (singleValue) {
        const targets = selectedCells.length > 0 ? selectedCells : focusedCell ? [focusedCell] : [];
        if (!targets.length) return { ok: false, reason: 'no-target' };
        if (targets.some(cell => cell.rowIndex < 0 || cell.rowIndex >= rowCount || cell.columnIndex < 0 || cell.columnIndex >= columnCount)) {
            return { ok: false, reason: 'out-of-bounds' };
        }
        return {
            ok: true,
            assignments: targets.map(cell => ({ ...cell, value: matrix[0]?.[0] ?? '' })),
        };
    }

    const bounds = getRectBounds(selectedCells);
    if (selectedCells.length > 1 && !bounds?.rectangular) return { ok: false, reason: 'non-rectangular' };
    const anchor = bounds ? { rowIndex: bounds.minRow, columnIndex: bounds.minColumn } : (selectedCells[0] ?? focusedCell);
    if (!anchor) return { ok: false, reason: 'no-target' };

    const assignments: ClipboardAssignment[] = [];
    for (let rowOffset = 0; rowOffset < matrix.length; rowOffset += 1) {
        const row = matrix[rowOffset] ?? [];
        for (let columnOffset = 0; columnOffset < row.length; columnOffset += 1) {
            const rowIndex = anchor.rowIndex + rowOffset;
            const columnIndex = anchor.columnIndex + columnOffset;
            if (rowIndex >= rowCount || columnIndex >= columnCount) return { ok: false, reason: 'out-of-bounds' };
            assignments.push({ rowIndex, columnIndex, value: row[columnOffset] ?? '' });
        }
    }

    return assignments.length ? { ok: true, assignments } : { ok: false, reason: 'empty' };
}

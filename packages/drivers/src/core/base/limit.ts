import { DEFAULT_MAX_RESULT_ROWS } from '../../types';

export function enforceSelectLimit(sql: string, maxRows = DEFAULT_MAX_RESULT_ROWS): string {
    const original = sql;
    let trimmed = sql.trim();

    if (trimmed.endsWith(';')) {
        trimmed = trimmed.slice(0, -1);
    }

    if (trimmed.includes(';')) {
        return original;
    }

    const lower = trimmed.toLowerCase();

    if (!lower.startsWith('select ') && !lower.startsWith('with ')) {
        return original;
    }

    const simpleLimitRegex = /\blimit\s+(\d+)(?:\s*,\s*(\d+))?(?:\s+offset\s+(\d+))?\s*$/i;
    const hasLimit = /\blimit\b/i.test(trimmed);
    const match = trimmed.match(simpleLimitRegex);

    if (hasLimit && !match) {
        return trimmed;
    }

    if (!hasLimit && !match) {
        return `${trimmed} LIMIT ${maxRows}`;
    }

    const originalLimitSegment = match![0];
    const index = match!.index ?? trimmed.length - originalLimitSegment.length;
    const first = match![1] ? parseInt(match![1], 10) : null;
    const second = match![2] ? parseInt(match![2], 10) : null;
    const offset = match![3] ? parseInt(match![3], 10) : null;

    let newLimitSegment = originalLimitSegment;

    if (offset !== null) {
        const n = first ?? maxRows;
        if (n > maxRows) {
            newLimitSegment = `LIMIT ${maxRows} OFFSET ${offset}`;
        }
    } else if (second !== null) {
        const offsetVal = first ?? 0;
        const countVal = second;
        if (countVal > maxRows) {
            newLimitSegment = `LIMIT ${offsetVal}, ${maxRows}`;
        }
    } else if (first !== null) {
        const n = first;
        if (n > maxRows) {
            newLimitSegment = `LIMIT ${maxRows}`;
        }
    }

    if (newLimitSegment === originalLimitSegment) {
        return trimmed;
    }

    return trimmed.slice(0, index) + newLimitSegment;
}

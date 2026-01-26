import { MAX_RESULT_ROWS } from '@/app/config/sql-console';

export function enforceSelectLimit(sql: string, maxRows = MAX_RESULT_ROWS): string {
    const original = sql;
    let trimmed = sql.trim();

    // Strip trailing semicolon
    if (trimmed.endsWith(';')) {
        trimmed = trimmed.slice(0, -1);
    }

    // Multiple statements: skip
    if (trimmed.includes(';')) {
        return original;
    }

    const lower = trimmed.toLowerCase();

    // Only handle simple SELECT / WITH ... SELECT
    if (!lower.startsWith('select ') && !lower.startsWith('with ')) {
        return original;
    }

    const simpleLimitRegex =
        /\blimit\s+(\d+)(?:\s*,\s*(\d+))?(?:\s+offset\s+(\d+))?\s*$/i;

    const hasLimit = /\blimit\b/i.test(trimmed);
    const match = trimmed.match(simpleLimitRegex);

    // LIMIT exists but not simple (LIMIT ... BY / WITH TIES / placeholders / subqueries) → skip
    if (hasLimit && !match) {
        return trimmed;
    }

    // No LIMIT → append directly
    if (!hasLimit && !match) {
        return `${trimmed} LIMIT ${maxRows}`;
    }

    // Only adjust in "simple trailing LIMIT" cases
    const originalLimitSegment = match![0];
    const index = match!.index ?? trimmed.length - originalLimitSegment.length;

    const first = match![1] ? parseInt(match![1], 10) : null; // First number in LIMIT n / LIMIT offset, count
    const second = match![2] ? parseInt(match![2], 10) : null; // Second number in LIMIT offset, count
    const offset = match![3] ? parseInt(match![3], 10) : null; // LIMIT n OFFSET offset

    let newLimitSegment = originalLimitSegment;

    if (offset !== null) {
        // LIMIT n OFFSET offset
        const n = first ?? maxRows;
        if (n > maxRows) {
            newLimitSegment = `LIMIT ${maxRows} OFFSET ${offset}`;
        }
    } else if (second !== null) {
        // LIMIT offset, count
        const offsetVal = first ?? 0;
        const countVal = second;
        if (countVal > maxRows) {
            newLimitSegment = `LIMIT ${offsetVal}, ${maxRows}`;
        }
    } else if (first !== null) {
        // LIMIT n
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

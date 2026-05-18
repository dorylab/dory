export const DEFAULT_MAX_RESULT_ROWS = 10000;

export type SelectLimitDialect = 'default' | 'sqlserver';

function normalizeDialect(dialect?: SelectLimitDialect): SelectLimitDialect {
    return dialect === 'sqlserver' ? 'sqlserver' : 'default';
}

export function hasSelectLimit(sql: string, dialect: SelectLimitDialect = 'default'): boolean {
    const normalizedDialect = normalizeDialect(dialect);
    const trimmed = sql.trim();

    if (normalizedDialect === 'sqlserver') {
        return /\btop\s*(?:\(\s*\d+\s*\)|\d+)\b/i.test(trimmed) || /\bfetch\s+next\s+\d+\s+rows\s+only\b/i.test(trimmed);
    }

    return /\blimit\b/i.test(trimmed);
}

function enforceSqlServerSelectLimit(sql: string, maxRows: number): string {
    const original = sql;
    let trimmed = sql.trim();

    if (trimmed.endsWith(';')) {
        trimmed = trimmed.slice(0, -1);
    }

    if (trimmed.includes(';')) {
        return original;
    }

    const simpleLimitRegex = /\blimit\s+(\d+)\s*$/i;
    const limitMatch = trimmed.match(simpleLimitRegex);
    if (limitMatch) {
        trimmed = trimmed.slice(0, limitMatch.index).trimEnd();
    }

    if (!/^\s*select\b/i.test(trimmed)) {
        return limitMatch ? trimmed : original;
    }

    if (/\boffset\s+\d+\s+rows\b/i.test(trimmed)) {
        return trimmed;
    }

    const requestedRows = limitMatch?.[1] ? Math.min(parseInt(limitMatch[1], 10), maxRows) : maxRows;
    const simpleTopRegex = /\btop\s*(?:\(\s*(\d+)\s*\)|(\d+))/i;
    const topMatch = trimmed.match(simpleTopRegex);

    if (topMatch) {
        const topRows = parseInt(topMatch[1] ?? topMatch[2], 10);
        if (topRows <= requestedRows) {
            return trimmed;
        }

        const originalTopSegment = topMatch[0];
        const index = topMatch.index ?? 0;
        return `${trimmed.slice(0, index)}TOP (${requestedRows})${trimmed.slice(index + originalTopSegment.length)}`;
    }

    return trimmed.replace(/^\s*select\s+(distinct\s+)?/i, match => `${match}TOP (${requestedRows}) `);
}

export function enforceSelectLimit(sql: string, maxRows = DEFAULT_MAX_RESULT_ROWS, dialect: SelectLimitDialect = 'default'): string {
    if (normalizeDialect(dialect) === 'sqlserver') {
        return enforceSqlServerSelectLimit(sql, maxRows);
    }

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

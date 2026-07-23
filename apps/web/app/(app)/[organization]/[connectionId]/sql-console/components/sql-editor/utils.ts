export const normalizeTableName = (raw: string) => {
    const trimmed = raw.trim();
    const parts = trimmed.split('.');
    const tableName = parts[parts.length - 1]?.trim() || trimmed;

    if ((tableName.startsWith('`') && tableName.endsWith('`')) || (tableName.startsWith('"') && tableName.endsWith('"'))) {
        return tableName.slice(1, -1);
    }

    if (tableName.startsWith('[') && tableName.endsWith(']')) {
        return tableName.slice(1, -1);
    }

    return tableName;
};

export type SqlCompletionFallbackContext = {
    tablePrefix: string | null;
    columnPrefix: string | null;
};

/**
 * Keeps completion useful while the full statement is temporarily invalid.
 * SQL parsers can lose their syntax context when text after the caret still
 * belongs to a table or column expression that is currently being edited.
 */
export const resolveSqlCompletionFallbackContext = (sql: string, caretOffset: number): SqlCompletionFallbackContext => {
    const textBeforeCaret = sql.slice(0, Math.max(0, caretOffset));
    const tableMatch = textBeforeCaret.match(/\b(?:FROM|JOIN)\s+([a-zA-Z0-9_$.'"`\[\]-]*)$/i);
    const columnMatch = textBeforeCaret.match(/\b([a-zA-Z_][a-zA-Z0-9_$]*)\.([a-zA-Z0-9_$]*)$/);

    return {
        tablePrefix: tableMatch?.[1] ?? null,
        columnPrefix: columnMatch ? `${columnMatch[1]}.${columnMatch[2]}` : null,
    };
};

export const buildColumnPrefix = (syntaxList: { syntaxContextType: string; wordRanges?: { text?: string }[] }[], fallback: string) => {
    const colSyntax = syntaxList.find(s => s.syntaxContextType === 'column');
    const wordRanges = Array.isArray(colSyntax?.wordRanges) ? colSyntax.wordRanges : [];
    const typed = wordRanges.map(w => (typeof w?.text === 'string' ? w.text : '').trim()).join('');
    return typed || fallback;
};

/**
 *   FROM default.cell_towers c
 *   JOIN default.nyc_taxi AS r
 */
export function resolveTableFromAliasInSql(sql: string, alias: string): string | null {
    const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b(FROM|JOIN)\\s+([a-zA-Z0-9_$.'"\`\\[\\]\\-]+)(?:\\s+AS)?\\s+${escapedAlias}\\b`, 'i');
    const match = sql.match(pattern);
    if (!match) return null;
    const rawTable = match[2]; // default.cell_towers / "default"."cell_towers"
    return normalizeTableName(rawTable);
}

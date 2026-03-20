export const normalizeTableName = (raw: string) => {
    const trimmed = raw.trim().replace(/^`|`$/g, '').replace(/^"|"$/g, '');
    const parts = trimmed.split('.');
    return parts[parts.length - 1] || trimmed;
};

export const buildColumnPrefix = (
    syntaxList: { syntaxContextType: string; wordRanges?: { text?: string }[] }[],
    fallback: string,
) => {
    const colSyntax = syntaxList.find(s => s.syntaxContextType === 'column');
    const typed = (colSyntax?.wordRanges ?? [])
        .map(w => (w?.text ?? '').trim())
        .join('');
    return typed || fallback;
};

/**
 *   FROM default.cell_towers c
 *   JOIN default.nyc_taxi AS r
 */
export function resolveTableFromAliasInSql(sql: string, alias: string): string | null {
    const pattern = new RegExp(
        `\\b(FROM|JOIN)\\s+([a-zA-Z0-9_."\\-]+)(?:\\s+AS)?\\s+${alias}\\b`,
        'i',
    );
    const match = sql.match(pattern);
    if (!match) return null;
    const rawTable = match[2]; // default.cell_towers / "default"."cell_towers"
    return normalizeTableName(rawTable);
}

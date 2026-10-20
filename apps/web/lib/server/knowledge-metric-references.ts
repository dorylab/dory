const keywords = new Set(
    'case when then else end null true false and or not is in like between distinct as decimal numeric integer float double precision date timestamp interval day month year'.split(
        ' ',
    ),
);
const functions = new Set('sum count avg min max coalesce nullif round abs cast floor ceil ceiling lower upper length date_trunc extract'.split(' '));
export function validateMetricReferences(expressions: string[], table: string, columns: string[]) {
    const available = new Set(columns.map(c => c.toLocaleLowerCase()));
    for (const expression of expressions) {
        const tokens = expression.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|`[^`]*`|\[[^\]]+\]|[\p{L}_][\p{L}\p{N}_$]*|\d+(?:\.\d+)?|\s+|[().,+*/%<>=!|:-]/gu) ?? [];
        if (tokens.join('') !== expression || /;|--|\/\*/.test(expression))
            throw new Error('Metric expression is unsupported. Keep the calculation as text until its mapping can be validated.');
        const parts = tokens.filter(t => !/^\s+$/.test(t));
        for (let i = 0; i < parts.length; i++) {
            const token = parts[i];
            if (token.startsWith("'") || !/^[\p{L}_"`\[]/u.test(token)) continue;
            const quoted = /^["`\[]/.test(token),
                word = token.replace(/^["`\[]|["`\]]$/g, '').toLocaleLowerCase();
            if (!quoted && keywords.has(word)) continue;
            if (parts[i + 1] === '(') {
                if (!functions.has(word)) throw new Error(`Metric function cannot be validated: ${word}`);
                continue;
            }
            if (parts[i + 1] === '.') {
                if (word !== table.split('.').at(-1)?.toLocaleLowerCase()) throw new Error('Metric references a different table.');
                continue;
            }
            if (!available.has(word)) throw new Error(`Metric column was not found in the selected table: ${word}`);
        }
    }
}

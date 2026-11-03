import type { ReportEvidenceInspection } from '@dory/shared/types/report-workspace';

export function hasCompleteReportSnapshot({ evidence, fullResultAvailable }: ReportEvidenceInspection) {
    return fullResultAvailable && evidence.truncated === false && evidence.rowCount !== null && evidence.rowCount === evidence.rows.length;
}

/** Inspect only top-level SQL tokens; comments, literals, quoted identifiers and subqueries are not clauses. */
export function hasQueryLimit(sql: string): boolean {
    const tokens: string[] = [];
    let depth = 0;
    for (let i = 0; i < sql.length; ) {
        const tail = sql.slice(i);
        if (tail.startsWith('--') || tail.startsWith('#')) {
            const end = sql.indexOf('\n', i);
            i = end < 0 ? sql.length : end + 1;
        } else if (tail.startsWith('/*')) {
            let comments = 1;
            i += 2;
            while (i < sql.length && comments) {
                if (sql.slice(i, i + 2) === '/*') {
                    comments++;
                    i += 2;
                } else if (sql.slice(i, i + 2) === '*/') {
                    comments--;
                    i += 2;
                } else i++;
            }
        } else if (/^\$(?:[A-Za-z_][\w]*)?\$/.test(tail)) {
            const delimiter = /^\$(?:[A-Za-z_][\w]*)?\$/.exec(tail)![0];
            const end = sql.indexOf(delimiter, i + delimiter.length);
            i = end < 0 ? sql.length : end + delimiter.length;
        } else if (`'"\x60[`.includes(sql[i])) {
            const endQuote = sql[i] === '[' ? ']' : sql[i];
            i++;
            while (i < sql.length) {
                if (sql[i] === '\\') {
                    i += 2;
                    continue;
                }
                if (sql[i++] === endQuote) {
                    if (sql[i] === endQuote) {
                        i++;
                        continue;
                    }
                    break;
                }
            }
            if (!depth) tokens.push('quoted');
        } else if (sql[i] === '(') {
            depth++;
            i++;
        } else if (sql[i] === ')') {
            depth = Math.max(0, depth - 1);
            i++;
        } else {
            const token = /^[A-Za-z_][\w$]*|^\d+|^[$:?][\w]*/.exec(tail)?.[0];
            if (token) {
                if (!depth) tokens.push(token.toLowerCase());
                i += token.length;
            } else {
                if (!depth && sql[i] === ';') tokens.push(';');
                i++;
            }
        }
    }
    return tokens.some((token, index) => token === 'limit' && /^(?:\d+|all|[$:?][\w]*)$/.test(tokens[index + 1] ?? ''));
}

export type NamingSource = 'default' | 'rule' | 'pending' | 'ai' | 'manual';

export type NamingMetadata = {
    namingSource?: NamingSource;
    namingRequestId?: string | null;
};

export function isNamingSource(value: unknown): value is NamingSource {
    return typeof value === 'string' && ['default', 'rule', 'pending', 'ai', 'manual'].includes(value);
}

export function cleanSqlName(value: string): string {
    return Array.from(
        value
            .replace(/^[`"'\s]+|[`"'\s]+$/g, '')
            .replace(/\s+/g, ' ')
            .trim(),
    )
        .slice(0, 40)
        .join('');
}

export function isDefaultSqlName(value: string | null | undefined): boolean {
    return (
        !value?.trim() ||
        /^(?:new query|untitled query|新查询|新建查询|未命名查询|新規クエリ|新しいクエリ|無題のクエリ|nueva consulta|consulta sin título)(?:[\s-]+\d+)?$/i.test(value.trim())
    );
}

type Token = { text: string; identifier: boolean; literal?: boolean };

// Tokenize rather than stripping comments with regexes: quoted strings may contain
// comment markers, SQL keywords, dots and escaped identifier delimiters.
function tokens(sql: string): Token[] {
    const result: Token[] = [];
    let i = 0;
    while (i < sql.length) {
        const char = sql[i]!;
        if (/\s/.test(char)) {
            i++;
            continue;
        }
        if (sql.startsWith('--', i) || char === '#') {
            while (i < sql.length && sql[i] !== '\n') i++;
            continue;
        }
        if (sql.startsWith('/*', i)) {
            i += 2;
            let depth = 1;
            while (i < sql.length && depth) {
                if (sql.startsWith('/*', i)) {
                    depth++;
                    i += 2;
                } else if (sql.startsWith('*/', i)) {
                    depth--;
                    i += 2;
                } else i++;
            }
            continue;
        }
        const dollar = char === '$' ? sql.slice(i).match(/^\$(?:[a-z_][a-z0-9_]*)?\$/i)?.[0] : null;
        if (dollar) {
            const end = sql.indexOf(dollar, i + dollar.length);
            i = end < 0 ? sql.length : end + dollar.length;
            result.push({ text: '', identifier: false, literal: true });
            continue;
        }
        if (char === "'" || char === '"' || char === '`' || char === '[') {
            const end = char === '[' ? ']' : char;
            let text = '';
            i++;
            while (i < sql.length) {
                if (sql[i] === end) {
                    if (sql[i + 1] === end) {
                        text += end;
                        i += 2;
                        continue;
                    }
                    i++;
                    break;
                }
                if (char === "'" && sql[i] === '\\') {
                    i += 2;
                    continue;
                }
                text += sql[i++];
            }
            result.push({ text, identifier: char !== "'", literal: char === "'" });
            continue;
        }
        const word = sql.slice(i).match(/^[\p{L}\p{N}_$]+/u)?.[0];
        if (word) {
            result.push({ text: word, identifier: false });
            i += word.length;
        } else {
            result.push({ text: char, identifier: false });
            i++;
        }
    }
    return result;
}

export function buildSqlFallbackName(sql: string, locale?: string | null): string {
    const all = tokens(sql);
    const keyword = (index: number, word: string) => !all[index]?.identifier && !all[index]?.literal && all[index]?.text.toLowerCase() === word;
    let depth = 0;
    let operation = '';
    for (const token of all) {
        if (token.text === '(') depth++;
        if (token.text === ')') depth--;
        if (depth === 0 && !token.identifier && /^(select|insert|update|delete|create|alter|drop|truncate|show|describe|explain|pragma)$/i.test(token.text)) {
            operation = token.text.toLowerCase();
            break;
        }
    }
    let table = '';
    for (let index = 0; index < all.length; index++) {
        if (!['from', 'join', 'into', 'update', 'table'].some(word => keyword(index, word))) continue;
        let next = index + 1;
        if (keyword(next, 'if')) next += keyword(next + 1, 'not') ? 3 : 2;
        const token = all[next];
        if (!token || token.literal || (!token.identifier && !/^[\p{L}_]/u.test(token.text)) || /^(select|only|lateral)$/i.test(token.text)) continue;
        table = token.text;
        while (all[next + 1]?.text === '.' && all[next + 2]) {
            next += 2;
            table = all[next]!.text;
        }
        break;
    }
    const subject = table.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    const language = locale?.split('-')[0] ?? 'en';
    const words = {
        en: {
            query: 'query',
            list: 'list',
            count: 'count',
            summary: 'summary',
            insert: 'Insert',
            update: 'Update',
            delete: 'Delete',
            create: 'Create',
            alter: 'Alter',
            drop: 'Drop',
            truncate: 'Clear',
            show: 'Inspect',
            describe: 'Describe',
            explain: 'Explain',
            pragma: 'Inspect',
        },
        zh: {
            query: '查询',
            list: '列表',
            count: '数量',
            summary: '汇总',
            insert: '新增',
            update: '更新',
            delete: '删除',
            create: '创建',
            alter: '修改',
            drop: '删除',
            truncate: '清空',
            show: '查看',
            describe: '结构',
            explain: '执行计划',
            pragma: '查看',
        },
        ja: {
            query: 'クエリ',
            list: '一覧',
            count: '件数',
            summary: '集計',
            insert: '追加',
            update: '更新',
            delete: '削除',
            create: '作成',
            alter: '変更',
            drop: '削除',
            truncate: 'クリア',
            show: '確認',
            describe: '構造',
            explain: '実行計画',
            pragma: '確認',
        },
        es: {
            query: 'consulta',
            list: 'lista',
            count: 'recuento',
            summary: 'resumen',
            insert: 'Insertar',
            update: 'Actualizar',
            delete: 'Eliminar',
            create: 'Crear',
            alter: 'Modificar',
            drop: 'Eliminar',
            truncate: 'Vaciar',
            show: 'Inspeccionar',
            describe: 'Describir',
            explain: 'Explicar',
            pragma: 'Inspeccionar',
        },
    };
    const labels = words[language as keyof typeof words] ?? words.en;
    const count = all.some((_token, index) => keyword(index, 'count') && all[index + 1]?.text === '(');
    const grouped = all.some((_token, index) => keyword(index, 'group') && keyword(index + 1, 'by'));
    const detail = operation === 'select' ? (grouped ? labels.summary : count ? labels.count : labels.list) : (labels[operation as keyof typeof labels] ?? labels.query);
    if (!subject) return cleanSqlName(operation === 'select' ? `SQL ${grouped ? labels.summary : count ? labels.count : labels.query}` : `SQL ${detail}`);
    return cleanSqlName(language === 'zh' || language === 'ja' ? `${subject}${detail}` : operation === 'select' ? `${subject} ${detail}` : `${detail} ${subject}`);
}

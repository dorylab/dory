import { ConnectionDialect } from '@/types';
import type { CopilotContextSQL } from './types/copilot-context-sql';
import { MySQL, PostgreSQL } from 'dt-sql-parser';

type ParserInstance = {
    getAllEntities: (sql: string) => Array<{ entityContextType?: string; text?: string }> | null;
};

const parserCache: Partial<Record<ConnectionDialect, ParserInstance>> = {};

const getParser = (dialect: ConnectionDialect): ParserInstance => {
    if (parserCache[dialect]) return parserCache[dialect]!;

    let parser: ParserInstance;
    switch (dialect) {
        case 'postgres':
            parser = new PostgreSQL() as ParserInstance;
            break;
        case 'mysql':
        case 'clickhouse':
        case 'duckdb':
        case 'unknown':
        default:
            parser = new MySQL() as ParserInstance;
            break;
    }

    parserCache[dialect] = parser;
    return parser;
};

const stripWrapping = (value: string) => {
    const pairs: Array<[string, string]> = [
        ['`', '`'],
        ['"', '"'],
        ['[', ']'],
        ["'", "'"],
    ];

    let next = value.trim();
    for (const [start, end] of pairs) {
        if (next.startsWith(start) && next.endsWith(end) && next.length >= start.length + end.length) {
            next = next.slice(start.length, next.length - end.length);
        }
    }

    return next.trim();
};

const parseTableIdentifier = (raw: string) => {
    const cleaned = raw.trim();
    if (!cleaned) return null;

    const parts = cleaned.split('.').map(part => stripWrapping(part));
    const name = parts[parts.length - 1]?.trim();
    if (!name) return null;

    const database = parts.length > 1 ? parts[parts.length - 2]?.trim() : null;

    return {
        database: database || null,
        name,
        raw,
    };
};

const fallbackInferred = (
    baselineDatabase?: string | null,
): CopilotContextSQL['draft']['inferred'] => ({
    tables: [],
    database: baselineDatabase ?? null,
    confidence: 'low',
});

export function inferSqlDraftContext(params: {
    dialect: ConnectionDialect;
    editorText: string;
    baselineDatabase?: string | null;
}): CopilotContextSQL['draft']['inferred'] {
    const { dialect, editorText, baselineDatabase } = params;

    if (!editorText.trim()) {
        return {
            tables: [],
            database: baselineDatabase ?? null,
            confidence: 'mid',
        };
    }

    let entities: Array<{ entityContextType?: string; text?: string }> | null = null;
    try {
        const parser = getParser(dialect);
        entities = parser.getAllEntities(editorText) ?? null;
    } catch (error) {
        return fallbackInferred(baselineDatabase);
    }

    if (!Array.isArray(entities)) {
        return fallbackInferred(baselineDatabase);
    }

    const seen = new Set<string>();
    const tables: CopilotContextSQL['draft']['inferred']['tables'] = [];

    for (const entity of entities) {
        const type = String(entity?.entityContextType ?? '').toLowerCase();
        if (type !== 'table' && type !== 'view') continue;

        const parsed = parseTableIdentifier(String(entity?.text ?? '').trim());
        if (!parsed) continue;

        const key = `${parsed.database ?? ''}:${parsed.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        tables.push(parsed);
    }

    const databases = Array.from(
        new Set(
            tables
                .map(table => table.database ?? '')
                .filter(db => db.trim().length > 0),
        ),
    );

    const inferredDatabase =
        databases.length === 1 ? databases[0] : baselineDatabase ?? null;

    return {
        tables,
        database: inferredDatabase,
        confidence: tables.length ? 'high' : 'mid',
    };
}

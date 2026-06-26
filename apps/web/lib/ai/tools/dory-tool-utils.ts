import Fuse, { type IFuseOptions } from 'fuse.js';
import type { DatabaseObjectRow, QueryInsightsFilters, QueryType, TableColumnInfo, TimeRange } from '@dory/drivers/types';

export const MAX_DORY_TOOL_RESULT_ROWS = 100;
export const MAX_DORY_SCHEMA_SEARCH_DATABASES = 20;
export const DEFAULT_DORY_SCHEMA_SEARCH_LIMIT = 25;
export const MAX_DORY_SCHEMA_SEARCH_LIMIT = 100;
export const DEFAULT_DORY_MONITORING_PAGE_SIZE = 10;
export const MAX_DORY_MONITORING_PAGE_SIZE = 100;

export type SchemaSearchItem =
    | {
          kind: 'table' | 'view';
          database: string;
          name: string;
          comment?: string | null;
          totalBytes?: number | null;
          totalRows?: number | null;
          lastModified?: string | null;
      }
    | {
          kind: 'column';
          database: string;
          table: string;
          name: string;
          type?: string | null;
          comment?: string | null;
          isPrimaryKey?: boolean | number | string | null;
      };

type SchemaSearchDocument = {
    item: SchemaSearchItem;
    originalIndex: number;
    kind: string;
    database: string;
    table: string;
    name: string;
    type: string;
    comment: string;
    searchText: string;
};

type RankedSchemaSearchItem = {
    item: SchemaSearchItem;
    score: number;
    originalIndex: number;
};

const SCHEMA_SEARCH_STOP_WORDS = new Set([
    'a',
    'an',
    'and',
    'by',
    'column',
    'columns',
    'data',
    'database',
    'databases',
    'db',
    'field',
    'fields',
    'for',
    'in',
    'of',
    'on',
    'or',
    'schema',
    'schemas',
    'table',
    'tables',
    'the',
    'view',
    'views',
]);
const SINGULAR_EXCEPTIONS = new Set(['analysis', 'news', 'status']);
const SCHEMA_SEARCH_FUSE_OPTIONS: IFuseOptions<SchemaSearchDocument> = {
    keys: [
        { name: 'name', weight: 0.42 },
        { name: 'table', weight: 0.24 },
        { name: 'database', weight: 0.1 },
        { name: 'type', weight: 0.06 },
        { name: 'comment', weight: 0.06 },
        { name: 'kind', weight: 0.02 },
        { name: 'searchText', weight: 0.1 },
    ],
    threshold: 0.3,
    ignoreLocation: true,
    includeScore: true,
};

export function clampDoryToolLimit(limit: number | null | undefined, defaultValue: number, maxValue: number) {
    if (!Number.isFinite(limit ?? NaN)) return defaultValue;
    return Math.max(1, Math.min(maxValue, Math.floor(limit!)));
}

function isTimeRange(value: unknown): value is TimeRange {
    return value === '1h' || value === '6h' || value === '24h' || value === '7d';
}

function isQueryType(value: unknown): value is QueryType {
    return value === 'all' || value === 'select' || value === 'insert' || value === 'ddl' || value === 'other';
}

export function normalizeMonitoringFilters(input?: Partial<QueryInsightsFilters> | null): QueryInsightsFilters {
    return {
        search: typeof input?.search === 'string' ? input.search : '',
        user: typeof input?.user === 'string' && input.user ? input.user : 'all',
        database: typeof input?.database === 'string' && input.database ? input.database : 'all',
        queryType: isQueryType(input?.queryType) ? input.queryType : 'all',
        minDurationMs: Number.isFinite(input?.minDurationMs) ? Math.max(0, Math.floor(input!.minDurationMs!)) : 0,
        timeRange: isTimeRange(input?.timeRange) ? input.timeRange : '1h',
    };
}

function includesQuery(value: unknown, query: string) {
    return typeof value === 'string' && value.toLowerCase().includes(query);
}

function singularizeSchemaSearchToken(token: string) {
    if (SINGULAR_EXCEPTIONS.has(token)) return token;
    if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
    if (token.length > 4 && token.endsWith('ses')) return token.slice(0, -2);
    if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
    return token;
}

function tokenizeSchemaSearchText(value: unknown) {
    if (typeof value !== 'string') return [];
    return (
        value
            .toLowerCase()
            .match(/[a-z0-9]+/g)
            ?.filter(Boolean) ?? []
    );
}

export function normalizeSchemaSearchQuery(query: string) {
    const tokens = new Set<string>();

    for (const token of tokenizeSchemaSearchText(query)) {
        if (SCHEMA_SEARCH_STOP_WORDS.has(token)) continue;
        tokens.add(token);

        const singular = singularizeSchemaSearchToken(token);
        if (!SCHEMA_SEARCH_STOP_WORDS.has(singular)) {
            tokens.add(singular);
        }
    }

    return [...tokens];
}

function schemaSearchDocumentForItem(item: SchemaSearchItem, originalIndex: number): SchemaSearchDocument {
    const table = item.kind === 'column' ? item.table : '';
    const type = item.kind === 'column' ? (item.type ?? '') : '';
    const comment = item.comment ?? '';

    return {
        item,
        originalIndex,
        kind: item.kind,
        database: item.database,
        table,
        name: item.name,
        type,
        comment,
        searchText: [item.kind, item.database, table, item.name, type, comment].filter(Boolean).join(' '),
    };
}

function fieldMatchScore(value: string, token: string, exactTokenScore: number, substringScore: number) {
    if (!value) return 0;

    const normalizedValue = value.toLowerCase();
    const valueTokens = tokenizeSchemaSearchText(normalizedValue);
    if (valueTokens.includes(token)) return exactTokenScore;
    if (valueTokens.some(valueToken => valueToken.startsWith(token) || token.startsWith(valueToken))) return Math.floor(exactTokenScore * 0.75);
    if (normalizedValue.includes(token)) return substringScore;
    return 0;
}

function directSchemaSearchScore(document: SchemaSearchDocument, token: string) {
    return (
        fieldMatchScore(document.name, token, 16, 12) +
        fieldMatchScore(document.table, token, 10, 8) +
        fieldMatchScore(document.database, token, 5, 4) +
        fieldMatchScore(document.type, token, 3, 2) +
        fieldMatchScore(document.comment, token, 3, 2) +
        fieldMatchScore(document.kind, token, 2, 1)
    );
}

export function rankSchemaSearchItems(items: SchemaSearchItem[], query: string) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return items.map((item, originalIndex) => ({ item, score: 0, originalIndex }));

    const documents = items.map(schemaSearchDocumentForItem);
    const queryTokens = normalizeSchemaSearchQuery(query);
    const searchTokens = queryTokens.length > 0 ? queryTokens : [normalized];
    const fuse = new Fuse(documents, SCHEMA_SEARCH_FUSE_OPTIONS);
    const ranked = new Map<number, RankedSchemaSearchItem & { matchedTokens: Set<string> }>();

    for (const token of searchTokens) {
        for (const result of fuse.search(token)) {
            const directScore = directSchemaSearchScore(result.item, token);
            const fuseScore = 1 - Math.min(result.score ?? 1, 1);
            const tokenScore = directScore + fuseScore * 10;
            if (tokenScore <= 0) continue;

            const existing =
                ranked.get(result.item.originalIndex) ??
                ({
                    item: result.item.item,
                    score: 0,
                    originalIndex: result.item.originalIndex,
                    matchedTokens: new Set<string>(),
                } satisfies RankedSchemaSearchItem & { matchedTokens: Set<string> });

            existing.score += tokenScore;
            existing.matchedTokens.add(token);
            ranked.set(result.item.originalIndex, existing);
        }
    }

    return [...ranked.values()]
        .map(result => ({
            item: result.item,
            score: result.score + result.matchedTokens.size * 100,
            originalIndex: result.originalIndex,
        }))
        .sort((left, right) => right.score - left.score || left.originalIndex - right.originalIndex);
}

export function searchSchemaItems(items: SchemaSearchItem[], query: string, limit?: number | null) {
    const maxResults = Number.isFinite(limit ?? NaN) ? Math.max(1, Math.floor(limit!)) : items.length;
    return rankSchemaSearchItems(items, query)
        .slice(0, maxResults)
        .map(result => result.item);
}

export function matchSchemaSearch(item: SchemaSearchItem, query: string) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;

    if (item.kind === 'column' && includesQuery(item.table, normalized)) return true;
    if (includesQuery(item.database, normalized) || includesQuery(item.name, normalized) || includesQuery(item.comment, normalized)) return true;
    if (item.kind === 'column' && includesQuery(item.type, normalized)) return true;
    if (item.kind !== 'column' && includesQuery(item.lastModified, normalized)) return true;

    return rankSchemaSearchItems([item], query).length > 0;
}

export function toSchemaObject(kind: 'table' | 'view', database: string, item: DatabaseObjectRow): SchemaSearchItem {
    return {
        kind,
        database,
        name: item.name,
        comment: item.comment ?? null,
        totalBytes: item.totalBytes ?? null,
        totalRows: item.totalRows ?? null,
        lastModified: item.lastModified ?? null,
    };
}

export function toSchemaColumn(database: string, table: string, column: TableColumnInfo): SchemaSearchItem {
    return {
        kind: 'column',
        database,
        table,
        name: column.columnName,
        type: column.columnType ?? null,
        comment: column.comment ?? null,
        isPrimaryKey: column.isPrimaryKey ?? null,
    };
}

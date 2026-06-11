import type { DriverQueryParams } from '@dory/drivers/core';
import type { TablePreviewFilter, TablePreviewOptions } from '@dory/drivers/types';

type PreviewDialect = 'postgres' | 'mysql' | 'sqlite' | 'duckdb' | 'sqlserver' | 'oracle' | 'clickhouse';

type PreviewQueryOptions = TablePreviewOptions & {
    dialect: PreviewDialect;
    quoteIdentifier: (value: string) => string;
    parameterStart?: number;
};

export type PreviewQueryClauses = {
    whereSql: string;
    orderBySql: string;
    params: DriverQueryParams;
    nextParameterIndex: number;
};

function normalizeIdentifier(value?: string | null) {
    const normalized = value?.trim();
    return normalized || null;
}

function isNamedDialect(dialect: PreviewDialect) {
    return dialect === 'sqlserver' || dialect === 'oracle' || dialect === 'clickhouse';
}

function placeholder(dialect: PreviewDialect, name: string, index: number, clickhouseType: 'String' | 'Float64' = 'String') {
    if (dialect === 'postgres') return `$${index}`;
    if (dialect === 'sqlserver') return `@${name}`;
    if (dialect === 'oracle') return `:${name}`;
    if (dialect === 'clickhouse') return `{${name}:${clickhouseType}}`;
    return '?';
}

function likeOperator(dialect: PreviewDialect, caseSensitive?: boolean) {
    if (dialect === 'postgres') return caseSensitive ? 'LIKE' : 'ILIKE';
    if (dialect === 'clickhouse') return caseSensitive ? 'LIKE' : 'ILIKE';
    return 'LIKE';
}

function lowerExpression(dialect: PreviewDialect, expression: string) {
    if (dialect === 'postgres') return `LOWER(${expression}::text)`;
    if (dialect === 'sqlserver') return `LOWER(CAST(${expression} AS nvarchar(max)))`;
    if (dialect === 'oracle') return `LOWER(TO_CHAR(${expression}))`;
    if (dialect === 'clickhouse') return `lower(toString(${expression}))`;
    if (dialect === 'mysql') return `LOWER(CAST(${expression} AS CHAR))`;
    return `LOWER(CAST(${expression} AS TEXT))`;
}

function textExpression(dialect: PreviewDialect, expression: string) {
    if (dialect === 'postgres') return `${expression}::text`;
    if (dialect === 'sqlserver') return `CAST(${expression} AS nvarchar(max))`;
    if (dialect === 'oracle') return `TO_CHAR(${expression})`;
    if (dialect === 'clickhouse') return `toString(${expression})`;
    if (dialect === 'mysql') return `CAST(${expression} AS CHAR)`;
    return `CAST(${expression} AS TEXT)`;
}

function regexExpression(dialect: PreviewDialect, expression: string, valuePlaceholder: string, caseSensitive?: boolean) {
    if (dialect === 'postgres') return `${textExpression(dialect, expression)} ${caseSensitive ? '~' : '~*'} ${valuePlaceholder}`;
    if (dialect === 'mysql') return `${textExpression(dialect, expression)} REGEXP ${valuePlaceholder}`;
    if (dialect === 'clickhouse') return `match(${caseSensitive ? textExpression(dialect, expression) : lowerExpression(dialect, expression)}, ${valuePlaceholder})`;
    if (dialect === 'duckdb') return `regexp_matches(${caseSensitive ? textExpression(dialect, expression) : lowerExpression(dialect, expression)}, ${valuePlaceholder})`;
    throw new Error(`Table preview regex filters are not supported for ${dialect}`);
}

function normalizeSearchValue(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
}

function addParam(
    dialect: PreviewDialect,
    params: Record<string, unknown> | unknown[],
    value: unknown,
    index: number,
    clickhouseType: 'String' | 'Float64' = 'String',
) {
    const name = `previewParam${index}`;
    if (Array.isArray(params)) {
        params.push(value);
    } else {
        params[name] = value;
    }
    return placeholder(dialect, name, index, clickhouseType);
}

function buildStringPredicate(
    dialect: PreviewDialect,
    columnSql: string,
    filter: TablePreviewFilter,
    add: (value: unknown, type?: 'String' | 'Float64') => string,
) {
    const rawValue = filter.value ?? '';
    const textSql = textExpression(dialect, columnSql);
    const comparableSql = filter.caseSensitive ? textSql : lowerExpression(dialect, columnSql);
    const comparableValue = filter.caseSensitive ? rawValue : rawValue.toLowerCase();

    switch (filter.op) {
        case 'contains':
            return `${comparableSql} ${likeOperator(dialect, filter.caseSensitive)} ${add(`%${comparableValue}%`)}`;
        case 'equals':
            return `${comparableSql} = ${add(comparableValue)}`;
        case 'startsWith':
            return `${comparableSql} ${likeOperator(dialect, filter.caseSensitive)} ${add(`${comparableValue}%`)}`;
        case 'endsWith':
            return `${comparableSql} ${likeOperator(dialect, filter.caseSensitive)} ${add(`%${comparableValue}`)}`;
        case 'empty':
            return `(${columnSql} IS NULL OR ${textSql} = '')`;
        case 'notEmpty':
            return `(${columnSql} IS NOT NULL AND ${textSql} <> '')`;
        case 'regex':
            return regexExpression(dialect, columnSql, add(filter.caseSensitive ? rawValue : rawValue.toLowerCase()), filter.caseSensitive);
        default:
            return null;
    }
}

function buildNumberPredicate(columnSql: string, filter: TablePreviewFilter, add: (value: unknown, type?: 'String' | 'Float64') => string) {
    const value = Number(filter.value);
    if (!Number.isFinite(value)) return null;

    const valueSql = add(value, 'Float64');
    switch (filter.op) {
        case 'eq':
            return `${columnSql} = ${valueSql}`;
        case 'ne':
            return `${columnSql} <> ${valueSql}`;
        case 'gt':
            return `${columnSql} > ${valueSql}`;
        case 'ge':
            return `${columnSql} >= ${valueSql}`;
        case 'lt':
            return `${columnSql} < ${valueSql}`;
        case 'le':
            return `${columnSql} <= ${valueSql}`;
        default:
            return null;
    }
}

function buildRangePredicate(columnSql: string, filter: TablePreviewFilter, add: (value: unknown, type?: 'String' | 'Float64') => string) {
    if (filter.op !== 'range' || !filter.value || !filter.valueTo) return null;
    if (filter.rangeValueType === 'number') {
        const from = Number(filter.value);
        const to = Number(filter.valueTo);
        if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
        return `(${columnSql} >= ${add(from, 'Float64')} AND ${columnSql} < ${add(to, 'Float64')})`;
    }
    return `(${columnSql} >= ${add(filter.value)} AND ${columnSql} < ${add(filter.valueTo)})`;
}

export function buildTablePreviewClauses(options: PreviewQueryOptions): PreviewQueryClauses {
    const params: Record<string, unknown> | unknown[] = isNamedDialect(options.dialect) ? {} : [];
    let parameterIndex = options.parameterStart ?? 1;
    const add = (value: unknown, type?: 'String' | 'Float64') => addParam(options.dialect, params, value, parameterIndex++, type);

    const predicates: string[] = [];
    for (const filter of options.filters ?? []) {
        const column = normalizeIdentifier(filter.col);
        if (!column) continue;

        const columnSql = options.quoteIdentifier(column);
        const predicate =
            filter.kind === 'number'
                ? buildNumberPredicate(columnSql, filter, add)
                : filter.kind === 'range'
                  ? buildRangePredicate(columnSql, filter, add)
                  : buildStringPredicate(options.dialect, columnSql, filter, add);

        if (predicate) predicates.push(predicate);
    }

    const search = normalizeSearchValue(options.search);
    const searchColumns = Array.from(new Set((options.searchColumns ?? []).map(normalizeIdentifier).filter((column): column is string => Boolean(column))));
    if (search && searchColumns.length > 0) {
        const searchValue = `%${search.toLowerCase()}%`;
        const searchPredicates = searchColumns.map(column => `${lowerExpression(options.dialect, options.quoteIdentifier(column))} ${likeOperator(options.dialect, false)} ${add(searchValue)}`);
        predicates.push(`(${searchPredicates.join(' OR ')})`);
    }

    const sortColumn = normalizeIdentifier(options.sort?.column);
    const orderBySql = sortColumn ? ` ORDER BY ${options.quoteIdentifier(sortColumn)} ${options.sort?.direction === 'desc' ? 'DESC' : 'ASC'}` : '';

    return {
        whereSql: predicates.length ? ` WHERE ${predicates.join(' AND ')}` : '',
        orderBySql,
        params: Array.isArray(params) ? params : params,
        nextParameterIndex: parameterIndex,
    };
}

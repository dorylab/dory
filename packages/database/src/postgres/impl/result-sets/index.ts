import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { and, asc, eq, lte, ne, notInArray, sql } from 'drizzle-orm';

import { getDoryArtifactStore, joinObjectPath, safeObjectPathPart, type DoryArtifactStore } from '@dory/artifacts';
import { getClient } from '@dory/database/postgres/client';
import { agentRunResultSets, connections, organizations, queryRuns, resultSetExports, resultSets as resultSetsTable, workQueryResultSets } from '@dory/database/postgres/schemas';
import {
    DEFAULT_RESULT_SET_MAX_STORAGE_BYTES,
    DEFAULT_RESULT_SET_RETENTION_DAYS,
    getResultSetMaxStorageBytesFromOrganizationMetadata,
    getResultSetRetentionDaysFromOrganizationMetadata,
} from '@dory/database/postgres/impl/organization';
import {
    buildResultSetPreview,
    configureResultSetDuckDb,
    createDefaultResultSetDataWriter,
    inferResultSetColumns,
    resultSetDataAvailability,
    type ResultSetArtifactRef,
    type ResultSetColumn,
    type ResultSetDataAvailability,
    type ResultSetDataWriter,
    type ResultSetManifest,
    type ResultSetRowIterable,
} from '@dory/resultset';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import { newEntityId } from '@dory/shared/id';
import type { PostgresDBClient } from '@dory/shared';

const DEFAULT_PREVIEW_ROWS = 200;
const DEFAULT_ROW_LIMIT = 1000;
const MAX_ROW_LIMIT = 5000;
const ROW_PAGE_CACHE_TTL_MS = 60_000;
const ROW_PAGE_CACHE_MAX_ENTRIES = 128;
const EXPORT_RETENTION_MS = 24 * 60 * 60 * 1000;
const STORAGE_CLEANUP_BATCH_SIZE = 100;
export const RESULT_SET_STORAGE_LIMIT_WARNING = 'Workspace storage limit reached; only the result preview was retained.';

type RowPageCacheEntry = {
    createdAt: number;
    output: ReadResultRowsOutput;
};

const rowPageCache = new Map<string, RowPageCacheEntry>();

type QueryResultSetInput = Record<string, unknown> & {
    sessionId: string;
    setIndex: number;
    sqlText: string;
    status: 'success' | 'error' | string;
};

export type PersistQueryResultSetInput = {
    organizationId: string;
    userId: string;
    connectionId?: string | null;
    sourceConnectionType?: string | null;
    sourceDatabaseName?: string | null;
    workspaceId?: string | null;
    tabId?: string | null;
    workId?: string | null;
    agentRunId?: string | null;
    sessionId: string;
    database?: string | null;
    sessionSqlText: string;
    source?: string | null;
    resultSet: QueryResultSetInput;
    rows: unknown[];
    previewRows?: number;
};

export type PersistQueryErrorInput = Omit<PersistQueryResultSetInput, 'database' | 'previewRows' | 'rows' | 'sourceConnectionType' | 'sourceDatabaseName'>;

export type PersistQueryResultSetStreamInput = Omit<PersistQueryResultSetInput, 'rows'> & {
    rows: ResultSetRowIterable;
    columns?: ResultSetColumn[];
    rowCount?: number | null;
    resultSetId?: string | null;
    queryRunId?: string | null;
};

export type PersistQueryResultSetStreamOptions = {
    onPreviewPersisted?: (output: PersistQueryResultSetOutput) => Promise<void> | void;
};

export type PersistQueryResultSetOutput = {
    resultSetId: string;
    queryRunId: string;
    artifactRef: ResultSetArtifactRef;
    dataAvailability: ResultSetDataAvailability;
    previewRows: Record<string, unknown>[];
    previewRowCount: number;
    rowCount: number;
    schema: ResultSetColumn[];
    byteSize: number;
    artifactStore: string | null;
    storageFormat: 'parquet' | 'json' | null;
    sourceConnectionType: string | null;
    sourceDatabaseName: string | null;
    createdAt: number;
    expiresAt: number;
    storageLimitApplied?: boolean;
    warning?: string;
};

export type ReadResultRowsOutput = {
    resultSetId: string;
    rows: Record<string, unknown>[];
    offset: number;
    limit: number;
    rowCount: number | null;
    unfilteredRowCount: number | null;
    columns: ResultSetColumn[];
    dataAvailability: ResultSetDataAvailability;
};

export type ResultSetSort = {
    column: string;
    direction: 'asc' | 'desc';
};

export type ResultSetFilter = {
    col: string;
    kind: 'string' | 'number' | 'range';
    op: 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'empty' | 'notEmpty' | 'regex' | 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le' | 'range';
    value?: string;
    valueTo?: string;
    rangeValueType?: 'number' | 'date';
    caseSensitive?: boolean;
};

export type ResultSetSearch = {
    text: string;
    columns?: string[];
};

export type ResultSetQueryOperations = {
    sorts?: ResultSetSort[];
    filters?: ResultSetFilter[];
    search?: ResultSetSearch | null;
};

export type ResultSetChartReadInput = ResultSetQueryOperations & {
    organizationId: string;
    resultSetId: string;
    xKey: string;
    yKey: string;
    groupKey?: string | null;
    chartType?: string | null;
};

export type ResultSetExportCreateOutput = {
    exportId: string;
    format: 'csv' | 'parquet';
    fileName: string;
    byteSize?: number;
    downloadUrl: string;
};

export type ResultSetExportObject = {
    stream: NodeJS.ReadableStream;
    fileName: string;
    contentType: string;
    byteSize?: number;
};

export type ResultSetStorageUsage = {
    resultSetsBytes: number;
    exportsBytes: number;
    totalBytes: number;
};

export type CleanupExpiredResultSetsOutput = {
    scanned: number;
    deleted: number;
    deletedResultSets: number;
    deletedExports: number;
    bytesFreed: number;
    usageAfter: ResultSetStorageUsage;
    hasMore: boolean;
    failures: number;
};

export type ResultSetProfileReadOutput = {
    columns: ResultSetColumn[];
    stats: {
        summary: Record<string, unknown>;
        columns: Record<string, unknown>;
        sample: Record<string, unknown>;
        autoChartProfile?: unknown;
    };
    sampleRows: Record<string, unknown>[];
};

export type QuerySessionReadOutput = {
    sessionId: string;
    status: string;
    errorMessage: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    durationMs: number | null;
    resultSetCount: number;
    source: string | null;
};

export type SessionResultSetMeta = {
    sessionId: string;
    setIndex: number;
    sqlText: string;
    sqlOp: string | null;
    title: string | null;
    columns: ResultSetColumn[];
    stats: ResultSetProfileReadOutput['stats'] | null;
    viewState: unknown | null;
    aiProfileVersion: number | null;
    rowCount: number | null;
    limited: boolean;
    limit: number | null;
    resultSetId: string | null;
    dataAvailability: string;
    previewRowCount: number | null;
    affectedRows: number | null;
    status: string;
    errorMessage: string | null;
    errorCode: string | null;
    errorSqlState: string | null;
    errorMeta: unknown | null;
    warnings: unknown | null;
    startedAt: number | null;
    finishedAt: number | null;
    durationMs: number | null;
    byteSize: number | null;
    artifactStore: string | null;
    storageFormat: 'parquet' | 'json' | null;
    sourceConnectionType: string | null;
    sourceDatabaseName: string | null;
    createdAt: number | null;
    expiresAt: number | null;
};

type QueryClause = {
    whereSql: string;
    orderSql: string;
    params: unknown[];
    hasOperations: boolean;
};

type ResultSetRecord = typeof resultSetsTable.$inferSelect;
type ProfileColumnType = 'string' | 'integer' | 'number' | 'boolean' | 'date' | 'datetime' | 'json' | 'array' | 'unknown';
type ProfileSemanticRole = 'identifier' | 'dimension' | 'measure' | 'time' | 'text' | 'json' | 'unknown';

function quoteLiteral(value: string) {
    return `'${value.replace(/'/g, "''")}'`;
}

function quoteIdentifier(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
}

function escapeLike(value: string) {
    return value.replace(/[\\%_]/g, match => `\\${match}`);
}

function columnKey(value: string) {
    return value.toLowerCase();
}

function buildColumnAllowlist(columns: ResultSetColumn[]) {
    const seen = new Map<string, ResultSetColumn>();
    const duplicates = new Set<string>();
    for (const column of columns) {
        if (!column?.name) continue;
        const key = columnKey(column.name);
        if (seen.has(key)) {
            duplicates.add(key);
            continue;
        }
        seen.set(key, column);
    }
    for (const key of duplicates) {
        seen.delete(key);
    }
    return seen;
}

function getAllowedColumn(allowlist: Map<string, ResultSetColumn>, name: unknown) {
    if (typeof name !== 'string' || !name) return null;
    return allowlist.get(columnKey(name)) ?? null;
}

function columnSql(column: ResultSetColumn) {
    return quoteIdentifier(column.name);
}

function stringColumnSql(column: ResultSetColumn, caseSensitive?: boolean) {
    const expr = `CAST(${columnSql(column)} AS VARCHAR)`;
    return caseSensitive ? expr : `LOWER(${expr})`;
}

function stringParam(value: unknown, caseSensitive?: boolean) {
    const text = value == null ? '' : String(value);
    return caseSensitive ? text : text.toLowerCase();
}

function numberParam(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
}

function hasResultSetOperations(operations?: ResultSetQueryOperations | null) {
    return Boolean((operations?.sorts?.length ?? 0) > 0 || (operations?.filters?.length ?? 0) > 0 || operations?.search?.text?.trim());
}

function buildResultSetQueryClause(columns: ResultSetColumn[], operations?: ResultSetQueryOperations | null): QueryClause {
    const allowlist = buildColumnAllowlist(columns);
    const whereParts: string[] = [];
    const params: unknown[] = [];

    for (const filter of operations?.filters ?? []) {
        const column = getAllowedColumn(allowlist, filter.col);
        if (!column) continue;

        if (filter.kind === 'number') {
            const value = numberParam(filter.value);
            if (value == null) continue;
            const expr = `TRY_CAST(${columnSql(column)} AS DOUBLE)`;
            const opByFilter: Record<string, string> = {
                eq: '=',
                ne: '<>',
                gt: '>',
                ge: '>=',
                lt: '<',
                le: '<=',
            };
            const op = opByFilter[filter.op];
            if (!op) continue;
            whereParts.push(`${expr} ${op} ?`);
            params.push(value);
            continue;
        }

        if (filter.kind === 'range' || filter.op === 'range') {
            const isDate = filter.rangeValueType === 'date';
            const expr = isDate ? `TRY_CAST(${columnSql(column)} AS TIMESTAMP)` : `TRY_CAST(${columnSql(column)} AS DOUBLE)`;
            const from = isDate ? (filter.value ?? '').trim() : numberParam(filter.value);
            const to = isDate ? (filter.valueTo ?? '').trim() : numberParam(filter.valueTo);
            if (from !== null && from !== '') {
                whereParts.push(`${expr} >= ?`);
                params.push(from);
            }
            if (to !== null && to !== '') {
                whereParts.push(`${expr} <= ?`);
                params.push(to);
            }
            continue;
        }

        const textExpr = stringColumnSql(column, filter.caseSensitive);
        const rawValue = stringParam(filter.value, filter.caseSensitive);
        switch (filter.op) {
            case 'contains':
                whereParts.push(`${textExpr} LIKE ? ESCAPE '\\'`);
                params.push(`%${escapeLike(rawValue)}%`);
                break;
            case 'equals':
                whereParts.push(`${textExpr} = ?`);
                params.push(rawValue);
                break;
            case 'startsWith':
                whereParts.push(`${textExpr} LIKE ? ESCAPE '\\'`);
                params.push(`${escapeLike(rawValue)}%`);
                break;
            case 'endsWith':
                whereParts.push(`${textExpr} LIKE ? ESCAPE '\\'`);
                params.push(`%${escapeLike(rawValue)}`);
                break;
            case 'empty':
                whereParts.push(`(${columnSql(column)} IS NULL OR CAST(${columnSql(column)} AS VARCHAR) = '')`);
                break;
            case 'notEmpty':
                whereParts.push(`(${columnSql(column)} IS NOT NULL AND CAST(${columnSql(column)} AS VARCHAR) <> '')`);
                break;
            case 'regex':
                if (rawValue) {
                    try {
                        new RegExp(rawValue);
                    } catch {
                        break;
                    }
                    whereParts.push(`regexp_matches(${textExpr}, ?)`);
                    params.push(rawValue);
                }
                break;
            default:
                break;
        }
    }

    const searchText = operations?.search?.text?.trim();
    if (searchText) {
        const requestedColumns = operations?.search?.columns?.length ? operations.search.columns : columns.map(column => column.name);
        const searchColumns = requestedColumns.map(name => getAllowedColumn(allowlist, name)).filter((column): column is ResultSetColumn => Boolean(column));
        if (searchColumns.length > 0) {
            const pattern = `%${escapeLike(searchText)}%`;
            whereParts.push(`(${searchColumns.map(column => `CAST(${columnSql(column)} AS VARCHAR) ILIKE ? ESCAPE '\\'`).join(' OR ')})`);
            params.push(...searchColumns.map(() => pattern));
        }
    }

    const orderParts: string[] = [];
    for (const sort of operations?.sorts ?? []) {
        const column = getAllowedColumn(allowlist, sort.column);
        if (!column) continue;
        orderParts.push(`${columnSql(column)} ${sort.direction === 'desc' ? 'DESC' : 'ASC'} NULLS LAST`);
    }

    return {
        whereSql: whereParts.length ? ` WHERE ${whereParts.join(' AND ')}` : '',
        orderSql: orderParts.length ? ` ORDER BY ${orderParts.join(', ')}` : '',
        params,
        hasOperations: hasResultSetOperations(operations),
    };
}

function exportContentType(format: 'csv' | 'parquet') {
    return format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.apache.parquet';
}

function organizationPathPart(organizationId: string) {
    const safe = safeObjectPathPart(organizationId);
    return safe.startsWith('org_') ? safe : `org_${safe}`;
}

function localDataPartPath(tempDir: string, partPath: string) {
    const root = path.resolve(tempDir);
    const target = path.resolve(tempDir, ...partPath.split('/'));
    if (!target.startsWith(`${root}${path.sep}`)) {
        throw new DatabaseError('Invalid result set data part path', 500);
    }
    return target;
}

function getString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

function getErrorMessage(error: unknown) {
    if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === 'string' && message) return message;
    }
    return String(error);
}

function getNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getBoolean(value: unknown): boolean {
    return value === true;
}

function addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function storageFormatFor(dataAvailability: ResultSetDataAvailability): 'parquet' | 'json' | null {
    if (dataAvailability === 'full') return 'parquet';
    if (dataAvailability === 'preview-only') return 'json';
    return null;
}

function toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value !== 'string') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeProfileColumnType(column: ResultSetColumn, sampleValues: unknown[]): ProfileColumnType {
    const logicalType = column.logicalType;
    if (logicalType === 'boolean' || logicalType === 'date' || logicalType === 'datetime' || logicalType === 'json') return logicalType;
    if (logicalType === 'number') return sampleValues.some(value => typeof value === 'number' && !Number.isInteger(value)) ? 'number' : 'integer';
    if (logicalType === 'string') return 'string';

    const databaseType = String(column.databaseType ?? '').toLowerCase();
    if (/(json|jsonb|variant|object)/.test(databaseType)) return 'json';
    if (/(array|\[\])/.test(databaseType)) return 'array';
    if (/bool/.test(databaseType)) return 'boolean';
    if (/(timestamp|datetime|timestamptz)/.test(databaseType)) return 'datetime';
    if (/(^date$)/.test(databaseType)) return 'date';
    if (/(int|integer|bigint|smallint|tinyint|serial)/.test(databaseType)) return 'integer';
    if (/(float|double|decimal|numeric|real|money)/.test(databaseType)) return 'number';
    if (/(char|text|uuid|enum|citext|string)/.test(databaseType)) return 'string';

    const first = sampleValues.find(value => value != null && value !== '');
    if (typeof first === 'number') return Number.isInteger(first) ? 'integer' : 'number';
    if (typeof first === 'boolean') return 'boolean';
    if (Array.isArray(first)) return 'array';
    if (first && typeof first === 'object') return 'json';
    if (typeof first === 'string') {
        if (Number.isFinite(Number(first))) return Number.isInteger(Number(first)) ? 'integer' : 'number';
        if (Date.parse(first) && /^\d{4}-\d{1,2}-\d{1,2}/.test(first)) return first.includes('T') ? 'datetime' : 'date';
        return 'string';
    }

    return 'unknown';
}

function inferProfileSemanticRole(params: { columnName: string; normalizedType: ProfileColumnType; distinctCount: number; nonNullCount: number }): ProfileSemanticRole {
    const lowerName = params.columnName.toLowerCase();
    const distinctRatio = params.nonNullCount > 0 ? params.distinctCount / params.nonNullCount : 0;
    const idHint = /(^id$|_id$|^id_|identifier|uuid|guid|key$)/.test(lowerName);
    const timeHint = /(date|time|timestamp|created|updated|_at$|at$|day|week|month|year)/.test(lowerName);
    const measureHint = /(^|[_\W])(count|sum|amount|total|price|revenue|cost|score|avg|average|qty|quantity|size|rate)([_\W]|$)/.test(lowerName);

    if (idHint) return 'identifier';
    if (params.normalizedType === 'date' || params.normalizedType === 'datetime' || timeHint) return 'time';
    if ((params.normalizedType === 'integer' || params.normalizedType === 'number') && (measureHint || !idHint)) return 'measure';
    if (distinctRatio >= 0.95 && params.normalizedType === 'string' && params.nonNullCount >= 20) return 'identifier';
    if (params.normalizedType === 'string') {
        if (measureHint) return 'measure';
        if (params.distinctCount <= 24 || distinctRatio <= 0.3) return 'dimension';
        return 'text';
    }
    if (params.normalizedType === 'json' || params.normalizedType === 'array') return 'json';
    return 'unknown';
}

function shannonEntropy(counts: number[]) {
    const total = counts.reduce((sum, value) => sum + value, 0);
    if (total <= 0) return 0;
    return counts.reduce((sum, count) => {
        if (count <= 0) return sum;
        const probability = count / total;
        return sum - probability * Math.log2(probability);
    }, 0);
}

function informationDensityFor(params: { nonNullCount: number; distinctCount: number; distinctRatio: number; entropy: number; topValueShare: number | null }) {
    if (params.nonNullCount <= 0 || params.distinctCount <= 1 || params.entropy <= 0 || params.topValueShare === 1) return 'none';
    if (params.topValueShare != null && params.topValueShare >= 0.9) return 'low';
    if (params.distinctRatio < 0.02 || params.entropy < 1) return 'low';
    if (params.distinctRatio < 0.35 || params.entropy < 3) return 'medium';
    return 'high';
}

function buildSampleTopK(values: unknown[]) {
    const counts = new Map<string, number>();
    for (const value of values) {
        if (value == null || value === '') continue;
        const key = typeof value === 'string' ? value : JSON.stringify(value);
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
        .slice(0, 8);
}

function getDurationMs(value: unknown, startedAt: unknown, finishedAt: Date): number | null {
    if (startedAt instanceof Date) return Math.max(0, Math.round(finishedAt.getTime() - startedAt.getTime()));
    const direct = getNumber(value);
    if (direct != null && direct > 0) return direct;
    return null;
}

function inferActorType(source?: string | null) {
    if (source === 'ai') return 'agent';
    if (source === 'automation') return 'automation';
    if (source === 'mcp') return 'mcp';
    return 'user';
}

function normalizeOffset(value: number | null | undefined) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normalizeLimit(value: number | null | undefined) {
    const candidate = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : DEFAULT_ROW_LIMIT;
    return Math.max(1, Math.min(MAX_ROW_LIMIT, candidate));
}

function stableJson(value: unknown): string {
    if (typeof value === 'undefined') return 'undefined';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;

    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
        .sort()
        .map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`)
        .join(',')}}`;
}

function makeRowPageCacheKey(params: {
    organizationId: string;
    resultSetId: string;
    offset: number;
    limit: number;
    dataAvailability: ResultSetDataAvailability;
    manifestUpdatedAt?: string | null;
    rowCount?: number | null;
    operations?: ResultSetQueryOperations | null;
}) {
    return stableJson({
        organizationId: params.organizationId,
        resultSetId: params.resultSetId,
        offset: params.offset,
        limit: params.limit,
        dataAvailability: params.dataAvailability,
        manifestUpdatedAt: params.manifestUpdatedAt ?? null,
        rowCount: params.rowCount ?? null,
        operations: params.operations ?? null,
    });
}

function cloneReadRowsOutput(output: ReadResultRowsOutput): ReadResultRowsOutput {
    return {
        ...output,
        rows: output.rows.map(row => ({ ...row })),
        columns: output.columns.map(column => ({ ...column })),
    };
}

function getCachedRowPage(key: string): ReadResultRowsOutput | null {
    const entry = rowPageCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > ROW_PAGE_CACHE_TTL_MS) {
        rowPageCache.delete(key);
        return null;
    }

    rowPageCache.delete(key);
    rowPageCache.set(key, entry);
    return cloneReadRowsOutput(entry.output);
}

function setCachedRowPage(key: string, output: ReadResultRowsOutput) {
    rowPageCache.set(key, {
        createdAt: Date.now(),
        output: cloneReadRowsOutput(output),
    });

    while (rowPageCache.size > ROW_PAGE_CACHE_MAX_ENTRIES) {
        const oldestKey = rowPageCache.keys().next().value;
        if (typeof oldestKey !== 'string') break;
        rowPageCache.delete(oldestKey);
    }
}

function isAsyncIterableRows(rows: ResultSetRowIterable): rows is AsyncIterable<unknown> {
    return typeof (rows as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function';
}

function withRowCounting(
    rows: ResultSetRowIterable,
    handlers: {
        onRow: (row: unknown) => void;
        onError: (error: unknown) => void;
    },
): ResultSetRowIterable {
    if (isAsyncIterableRows(rows)) {
        return (async function* () {
            try {
                for await (const row of rows) {
                    handlers.onRow(row);
                    yield row;
                }
            } catch (error) {
                handlers.onError(error);
                throw error;
            }
        })();
    }

    return (function* () {
        try {
            for (const row of rows) {
                handlers.onRow(row);
                yield row;
            }
        } catch (error) {
            handlers.onError(error);
            throw error;
        }
    })();
}

async function consumeRows(rows: ResultSetRowIterable): Promise<void> {
    if (isAsyncIterableRows(rows)) {
        for await (const row of rows) {
            void row;
        }
        return;
    }

    for (const row of rows) {
        void row;
    }
}

async function preparePreviewRows(rows: ResultSetRowIterable, maxRows: number): Promise<{ previewRows: unknown[]; remainingRows: ResultSetRowIterable }> {
    const previewRows: unknown[] = [];
    const limit = Math.max(0, Math.floor(maxRows));
    if (limit <= 0) {
        return { previewRows, remainingRows: rows };
    }

    if (isAsyncIterableRows(rows)) {
        const iterator = rows[Symbol.asyncIterator]();
        while (previewRows.length < limit) {
            const next = await iterator.next();
            if (next.done) break;
            previewRows.push(next.value);
        }
        return { previewRows, remainingRows: asyncRowsFromIterator(iterator) };
    }

    const iterator = rows[Symbol.iterator]();
    while (previewRows.length < limit) {
        const next = iterator.next();
        if (next.done) break;
        previewRows.push(next.value);
    }
    return { previewRows, remainingRows: rowsFromIterator(iterator) };
}

function concatRows(prefixRows: unknown[], remainingRows: ResultSetRowIterable): ResultSetRowIterable {
    if (isAsyncIterableRows(remainingRows)) {
        return (async function* () {
            for (const row of prefixRows) yield row;
            for await (const row of remainingRows) yield row;
        })();
    }

    return (function* () {
        for (const row of prefixRows) yield row;
        for (const row of remainingRows) yield row;
    })();
}

function* rowsFromIterator(iterator: Iterator<unknown>) {
    for (;;) {
        const next = iterator.next();
        if (next.done) return;
        yield next.value;
    }
}

async function* asyncRowsFromIterator(iterator: AsyncIterator<unknown>) {
    for (;;) {
        const next = await iterator.next();
        if (next.done) return;
        yield next.value;
    }
}

function rowsBySchema(rows: unknown[][], columns: ResultSetColumn[]) {
    return rows.map(row => {
        const out: Record<string, unknown> = {};
        for (let i = 0; i < columns.length; i += 1) {
            const column = columns[i];
            out[column?.name ?? `column_${i + 1}`] = normalizeReadValue(row[i] ?? null, column);
        }
        return out;
    });
}

function normalizeReadValue(value: unknown, column: ResultSetColumn | undefined) {
    if (typeof value !== 'string') return value;
    if (!column) return value;
    const integerLikeColumn =
        column.logicalType === 'number' || Boolean(column.databaseType && /\b(bigint|int8|integer|int4|smallint|int2|tinyint|number\(38,0\))\b/i.test(column.databaseType));
    if (!integerLikeColumn || !/^-?\d+$/.test(value)) return value;
    const numberValue = Number(value);
    return Number.isSafeInteger(numberValue) ? numberValue : value;
}

export class PostgresResultSetsRepository {
    private db!: PostgresDBClient;

    constructor(
        private readonly artifacts: DoryArtifactStore = getDoryArtifactStore(),
        private readonly fullDataWriter: ResultSetDataWriter = createDefaultResultSetDataWriter(),
    ) {}

    async init() {
        const client = await getClient();
        if (!client) throw new DatabaseError('Database connection failed', 500);
        this.db = client as PostgresDBClient;
    }

    async persistQueryError(input: PersistQueryErrorInput): Promise<{ queryRunId: string }> {
        this.assertInited();

        const resultSet = input.resultSet;
        const queryRunId = `qr_${newEntityId()}`;
        const now = new Date();

        await this.db.insert(queryRuns).values({
            id: queryRunId,
            organizationId: input.organizationId,
            connectionId: input.connectionId ?? null,
            workspaceId: input.workspaceId ?? null,
            tabId: input.tabId ?? null,
            workId: input.workId ?? null,
            agentRunId: input.agentRunId ?? null,
            sessionId: input.sessionId,
            setIndex: resultSet.setIndex,
            actorType: inferActorType(input.source),
            actorId: input.userId,
            sql: resultSet.sqlText || input.sessionSqlText,
            status: 'error',
            durationMs: getNumber(resultSet.durationMs),
            errorMessage: getString(resultSet.errorMessage),
            resultSetId: null,
            createdAt: now,
            updatedAt: now,
        });

        return { queryRunId };
    }

    async persistQueryResultSet(input: PersistQueryResultSetInput): Promise<PersistQueryResultSetOutput> {
        this.assertInited();

        const resultSet = input.resultSet;
        const rows = Array.isArray(input.rows) ? input.rows : [];
        const artifactId = `rs_${newEntityId()}`;
        const queryRunId = `qr_${newEntityId()}`;
        const actorType = inferActorType(input.source);
        const status = getString(resultSet.status) ?? 'success';
        const sourceConnectionType = input.sourceConnectionType ?? null;
        const sourceDatabaseName = input.sourceDatabaseName ?? input.database ?? null;
        const columns = inferResultSetColumns(rows, resultSet.columns);
        const rowCount = getNumber(resultSet.rowCount) ?? rows.length;
        const now = new Date();
        const expiresAt = addDays(now, await this.getRetentionDays(input.organizationId));
        const preview = buildResultSetPreview({
            columns,
            rows,
            rowCount,
            maxRows: input.previewRows ?? DEFAULT_PREVIEW_ROWS,
        });
        const limited = getBoolean(resultSet.limited);
        const manifest: ResultSetManifest = {
            format: 'dory.resultset.v1',
            artifactId,
            organizationId: input.organizationId,
            kind: 'sql-result-set',
            status,
            source: {
                type: 'query-run',
                queryRunId,
                connectionId: input.connectionId ?? null,
                connectionType: sourceConnectionType,
                databaseName: sourceDatabaseName,
                workspaceId: input.workspaceId ?? null,
                tabId: input.tabId ?? null,
                workId: input.workId ?? null,
                agentRunId: input.agentRunId ?? null,
                actorType,
                actorId: input.userId,
            },
            sql: {
                text: resultSet.sqlText || input.sessionSqlText,
                dialect: input.database ?? null,
                operation: getString(resultSet.sqlOp) ?? 'unknown',
            },
            error:
                status === 'error'
                    ? {
                          message: getString(resultSet.errorMessage),
                          code: getString(resultSet.errorCode),
                          sqlState: getString(resultSet.errorSqlState),
                          meta: resultSet.errorMeta ?? undefined,
                      }
                    : undefined,
            schema: columns,
            rowCount,
            previewRowCount: preview.previewRowCount,
            limited,
            limit: getNumber(resultSet.limit),
            files: {},
            lineage: {},
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
            contentHash: null,
        };

        const fullData = await this.writeFullDataArtifact({
            artifactId,
            status,
            columns,
            rows,
        });
        const maxStorageBytes = await this.getMaxStorageBytes(input.organizationId);
        const previewByteSizeEstimate = Buffer.byteLength(JSON.stringify(preview), 'utf8');
        const fullDataByteSize = fullData?.byteSize ?? fullData?.parts.reduce((total, part) => total + (part.byteSize ?? 0), 0) ?? 0;
        const storageLimitApplied = Boolean(fullData && fullDataByteSize + previewByteSizeEstimate > maxStorageBytes);

        const { ref, manifest: persistedManifest } = await this.artifacts.resultSets
            .putResultSet({
                organizationId: input.organizationId,
                artifactId,
                manifest,
                preview: rows.length || status === 'success' ? preview : null,
                dataParts: storageLimitApplied ? null : (fullData?.parts ?? null),
            })
            .finally(() => fullData?.cleanup?.().catch(() => undefined));

        try {
            await this.db.insert(queryRuns).values({
                id: queryRunId,
                organizationId: input.organizationId,
                connectionId: input.connectionId ?? null,
                workspaceId: input.workspaceId ?? null,
                tabId: input.tabId ?? null,
                workId: input.workId ?? null,
                agentRunId: input.agentRunId ?? null,
                sessionId: input.sessionId,
                setIndex: resultSet.setIndex,
                actorType,
                actorId: input.userId,
                sql: resultSet.sqlText || input.sessionSqlText,
                status,
                durationMs: getNumber(resultSet.durationMs),
                errorMessage: getString(resultSet.errorMessage),
                resultSetId: artifactId,
                createdAt: now,
                updatedAt: now,
            });

            await this.db.insert(resultSetsTable).values({
                id: artifactId,
                organizationId: input.organizationId,
                connectionId: input.connectionId ?? null,
                sourceConnectionType,
                sourceDatabaseName,
                workspaceId: input.workspaceId ?? null,
                tabId: input.tabId ?? null,
                workId: input.workId ?? null,
                agentRunId: input.agentRunId ?? null,
                sessionId: input.sessionId,
                setIndex: resultSet.setIndex,
                sourceQueryRunId: queryRunId,
                sourceType: 'query-run',
                kind: 'sql-result-set',
                status,
                rowCount,
                previewRowCount: preview.previewRowCount,
                limited,
                limit: getNumber(resultSet.limit),
                schemaJson: columns,
                sql: resultSet.sqlText || input.sessionSqlText,
                operation: getString(resultSet.sqlOp),
                errorMessage: getString(resultSet.errorMessage),
                artifactRefJson: ref,
                dataAvailability: resultSetDataAvailability(persistedManifest),
                createdByActorType: actorType,
                createdByActorId: input.userId,
                byteSize: (persistedManifest.files.preview?.byteSize ?? 0) + (persistedManifest.files.data?.byteSize ?? 0),
                storageLimitApplied,
                expiresAt,
                createdAt: now,
                updatedAt: now,
            });

            if (input.agentRunId) {
                await this.db.insert(agentRunResultSets).values({
                    agentRunId: input.agentRunId,
                    resultSetId: artifactId,
                    queryRunId,
                    role: 'generated',
                    createdAt: now,
                });
            }
        } catch (error) {
            await this.artifacts.resultSets.deleteResultSet(ref).catch(() => undefined);
            throw error;
        }

        await this.enforceStorageLimit(input.organizationId, { protectedResultSetId: artifactId }).catch(error => {
            console.warn('[resultSets] storage quota cleanup failed after query; query remains successful', {
                artifactId,
                error: getErrorMessage(error),
            });
        });

        const dataAvailability = resultSetDataAvailability(persistedManifest);
        return {
            resultSetId: artifactId,
            queryRunId,
            artifactRef: ref,
            dataAvailability,
            previewRows: preview.rows,
            previewRowCount: preview.previewRowCount,
            rowCount,
            schema: columns,
            byteSize: (persistedManifest.files.preview?.byteSize ?? 0) + (persistedManifest.files.data?.byteSize ?? 0),
            artifactStore: ref.store,
            storageFormat: storageFormatFor(dataAvailability),
            sourceConnectionType,
            sourceDatabaseName,
            createdAt: now.getTime(),
            expiresAt: expiresAt.getTime(),
            storageLimitApplied,
            warning: storageLimitApplied ? RESULT_SET_STORAGE_LIMIT_WARNING : undefined,
        };
    }

    async persistQueryResultSetStream(input: PersistQueryResultSetStreamInput, options: PersistQueryResultSetStreamOptions = {}): Promise<PersistQueryResultSetOutput> {
        this.assertInited();

        const resultSet = input.resultSet;
        const artifactId = input.resultSetId?.trim() || `rs_${newEntityId()}`;
        const queryRunId = input.queryRunId?.trim() || `qr_${newEntityId()}`;
        const actorType = inferActorType(input.source);
        const status = getString(resultSet.status) ?? 'success';
        const sourceConnectionType = input.sourceConnectionType ?? null;
        const sourceDatabaseName = input.sourceDatabaseName ?? input.database ?? null;
        const explicitColumns = input.columns?.length ? input.columns : inferResultSetColumns([], resultSet.columns);
        const now = new Date();
        const expiresAt = addDays(now, await this.getRetentionDays(input.organizationId));
        const maxPreviewRows = input.previewRows ?? DEFAULT_PREVIEW_ROWS;
        const preparedRows = await preparePreviewRows(input.rows, maxPreviewRows);
        const previewRows = preparedRows.previewRows;
        const columns = explicitColumns.length ? explicitColumns : inferResultSetColumns(previewRows);
        const initialRowCount = getNumber(resultSet.rowCount) ?? input.rowCount ?? (previewRows.length < maxPreviewRows ? previewRows.length : null);
        const preview = buildResultSetPreview({
            columns,
            rows: previewRows,
            rowCount: initialRowCount,
            maxRows: maxPreviewRows,
        });
        const limited = getBoolean(resultSet.limited);
        const previewStatus = status === 'success' ? 'running' : status;
        const previewAt = new Date();
        const previewManifestInput: ResultSetManifest = {
            format: 'dory.resultset.v1',
            artifactId,
            organizationId: input.organizationId,
            kind: 'sql-result-set',
            status: previewStatus,
            source: {
                type: 'query-run',
                queryRunId,
                connectionId: input.connectionId ?? null,
                connectionType: sourceConnectionType,
                databaseName: sourceDatabaseName,
                workspaceId: input.workspaceId ?? null,
                tabId: input.tabId ?? null,
                workId: input.workId ?? null,
                agentRunId: input.agentRunId ?? null,
                actorType,
                actorId: input.userId,
            },
            sql: {
                text: resultSet.sqlText || input.sessionSqlText,
                dialect: input.database ?? null,
                operation: getString(resultSet.sqlOp) ?? 'unknown',
            },
            error:
                previewStatus === 'error'
                    ? {
                          message: getString(resultSet.errorMessage),
                          code: getString(resultSet.errorCode),
                          sqlState: getString(resultSet.errorSqlState),
                          meta: resultSet.errorMeta ?? undefined,
                      }
                    : undefined,
            schema: columns,
            rowCount: initialRowCount,
            previewRowCount: preview.previewRowCount,
            limited,
            limit: getNumber(resultSet.limit),
            files: {},
            lineage: {},
            createdAt: now.toISOString(),
            updatedAt: previewAt.toISOString(),
            contentHash: null,
        };

        const { ref: previewRef, manifest: previewManifest } = await this.artifacts.resultSets.putResultSet({
            organizationId: input.organizationId,
            artifactId,
            manifest: previewManifestInput,
            preview: previewRows.length || previewStatus === 'running' || previewStatus === 'success' ? preview : null,
            dataParts: null,
        });

        try {
            await this.db.insert(queryRuns).values({
                id: queryRunId,
                organizationId: input.organizationId,
                connectionId: input.connectionId ?? null,
                workspaceId: input.workspaceId ?? null,
                tabId: input.tabId ?? null,
                workId: input.workId ?? null,
                agentRunId: input.agentRunId ?? null,
                sessionId: input.sessionId,
                setIndex: resultSet.setIndex,
                actorType,
                actorId: input.userId,
                sql: resultSet.sqlText || input.sessionSqlText,
                status: previewStatus,
                durationMs: getDurationMs(resultSet.durationMs, resultSet.startedAt, previewAt),
                errorMessage: getString(resultSet.errorMessage),
                resultSetId: artifactId,
                createdAt: now,
                updatedAt: previewAt,
            });

            await this.db.insert(resultSetsTable).values({
                id: artifactId,
                organizationId: input.organizationId,
                connectionId: input.connectionId ?? null,
                sourceConnectionType,
                sourceDatabaseName,
                workspaceId: input.workspaceId ?? null,
                tabId: input.tabId ?? null,
                workId: input.workId ?? null,
                agentRunId: input.agentRunId ?? null,
                sessionId: input.sessionId,
                setIndex: resultSet.setIndex,
                sourceQueryRunId: queryRunId,
                sourceType: 'query-run',
                kind: 'sql-result-set',
                status: previewStatus,
                rowCount: initialRowCount,
                previewRowCount: preview.previewRowCount,
                limited,
                limit: getNumber(resultSet.limit),
                schemaJson: columns,
                sql: resultSet.sqlText || input.sessionSqlText,
                operation: getString(resultSet.sqlOp),
                errorMessage: getString(resultSet.errorMessage),
                artifactRefJson: previewRef,
                dataAvailability: resultSetDataAvailability(previewManifest),
                createdByActorType: actorType,
                createdByActorId: input.userId,
                byteSize: (previewManifest.files.preview?.byteSize ?? 0) + (previewManifest.files.data?.byteSize ?? 0),
                expiresAt,
                createdAt: now,
                updatedAt: previewAt,
            });

            if (input.agentRunId) {
                await this.db.insert(agentRunResultSets).values({
                    agentRunId: input.agentRunId,
                    resultSetId: artifactId,
                    queryRunId,
                    role: 'generated',
                    createdAt: now,
                });
            }
        } catch (error) {
            await this.artifacts.resultSets.deleteResultSet(previewRef).catch(() => undefined);
            throw error;
        }

        const previewDataAvailability = resultSetDataAvailability(previewManifest);
        const previewOutput: PersistQueryResultSetOutput = {
            resultSetId: artifactId,
            queryRunId,
            artifactRef: previewRef,
            dataAvailability: previewDataAvailability,
            previewRows: preview.rows,
            previewRowCount: preview.previewRowCount,
            rowCount: initialRowCount ?? previewRows.length,
            schema: columns,
            byteSize: (previewManifest.files.preview?.byteSize ?? 0) + (previewManifest.files.data?.byteSize ?? 0),
            artifactStore: previewRef.store,
            storageFormat: storageFormatFor(previewDataAvailability),
            sourceConnectionType,
            sourceDatabaseName,
            createdAt: now.getTime(),
            expiresAt: expiresAt.getTime(),
        };
        await options.onPreviewPersisted?.(previewOutput);

        let streamedRowCount = 0;
        let streamReadError: unknown = null;
        const countedRows = withRowCounting(concatRows(previewRows, preparedRows.remainingRows), {
            onRow: row => {
                void row;
                streamedRowCount += 1;
            },
            onError: error => {
                streamReadError = error;
            },
        });

        const fullData = await this.writeFullDataArtifact({
            artifactId,
            status,
            columns,
            rows: countedRows,
        });
        const maxStorageBytes = await this.getMaxStorageBytes(input.organizationId);
        const previewByteSizeEstimate = Buffer.byteLength(JSON.stringify(preview), 'utf8');
        const fullDataByteSize = fullData?.byteSize ?? fullData?.parts.reduce((total, part) => total + (part.byteSize ?? 0), 0) ?? 0;
        const storageLimitApplied = Boolean(fullData && fullDataByteSize + previewByteSizeEstimate > maxStorageBytes);
        const completedAt = new Date();
        const durationMs = getDurationMs(resultSet.durationMs, resultSet.startedAt, completedAt);
        if (!fullData && streamedRowCount === 0 && status === 'success' && !streamReadError) {
            await consumeRows(countedRows);
        }
        if (streamReadError) {
            const message = getErrorMessage(streamReadError);
            await Promise.all([
                this.db
                    .update(queryRuns)
                    .set({
                        status: 'error',
                        durationMs,
                        errorMessage: message,
                        updatedAt: completedAt,
                    })
                    .where(eq(queryRuns.id, queryRunId)),
                this.db
                    .update(resultSetsTable)
                    .set({
                        status: 'error',
                        errorMessage: message,
                        rowCount: streamedRowCount || initialRowCount,
                        updatedAt: completedAt,
                    })
                    .where(eq(resultSetsTable.id, artifactId)),
            ]);
            throw streamReadError;
        }

        const rowCount = getNumber(resultSet.rowCount) ?? input.rowCount ?? fullData?.rowCount ?? streamedRowCount;
        const manifest: ResultSetManifest = {
            ...previewManifestInput,
            status,
            error:
                status === 'error'
                    ? {
                          message: getString(resultSet.errorMessage),
                          code: getString(resultSet.errorCode),
                          sqlState: getString(resultSet.errorSqlState),
                          meta: resultSet.errorMeta ?? undefined,
                      }
                    : undefined,
            rowCount,
            updatedAt: completedAt.toISOString(),
        };

        let latestRef = previewRef;
        let latestManifest = previewManifest;
        try {
            const { ref, manifest: persistedManifest } = await this.artifacts.resultSets.putResultSet({
                organizationId: input.organizationId,
                artifactId,
                manifest,
                preview: previewRows.length || status === 'success' ? preview : null,
                dataParts: storageLimitApplied ? null : (fullData?.parts ?? null),
            });
            latestRef = ref;
            latestManifest = persistedManifest;
            const dataAvailability = resultSetDataAvailability(persistedManifest);
            const byteSize = (persistedManifest.files.preview?.byteSize ?? 0) + (persistedManifest.files.data?.byteSize ?? 0);

            await Promise.all([
                this.db
                    .update(queryRuns)
                    .set({
                        status,
                        durationMs,
                        errorMessage: getString(resultSet.errorMessage),
                        resultSetId: artifactId,
                        updatedAt: completedAt,
                    })
                    .where(eq(queryRuns.id, queryRunId)),
                this.db
                    .update(resultSetsTable)
                    .set({
                        status,
                        rowCount,
                        previewRowCount: preview.previewRowCount,
                        limited,
                        limit: getNumber(resultSet.limit),
                        schemaJson: columns,
                        errorMessage: getString(resultSet.errorMessage),
                        artifactRefJson: ref,
                        dataAvailability,
                        byteSize,
                        storageLimitApplied,
                        updatedAt: completedAt,
                    })
                    .where(eq(resultSetsTable.id, artifactId)),
            ]);

            await this.enforceStorageLimit(input.organizationId, { protectedResultSetId: artifactId }).catch(error => {
                console.warn('[resultSets] storage quota cleanup failed after streamed query; query remains successful', {
                    artifactId,
                    error: getErrorMessage(error),
                });
            });

            return {
                resultSetId: artifactId,
                queryRunId,
                artifactRef: ref,
                dataAvailability,
                previewRows: preview.rows,
                previewRowCount: preview.previewRowCount,
                rowCount,
                schema: columns,
                byteSize,
                artifactStore: ref.store,
                storageFormat: storageFormatFor(dataAvailability),
                sourceConnectionType,
                sourceDatabaseName,
                createdAt: now.getTime(),
                expiresAt: expiresAt.getTime(),
                storageLimitApplied,
                warning: storageLimitApplied ? RESULT_SET_STORAGE_LIMIT_WARNING : undefined,
            };
        } catch (error) {
            const message = getErrorMessage(error);
            await Promise.all([
                this.db
                    .update(queryRuns)
                    .set({
                        status: 'success',
                        durationMs,
                        errorMessage: null,
                        resultSetId: artifactId,
                        updatedAt: completedAt,
                    })
                    .where(eq(queryRuns.id, queryRunId)),
                this.db
                    .update(resultSetsTable)
                    .set({
                        status: 'success',
                        errorMessage: null,
                        rowCount: streamedRowCount || rowCount,
                        dataAvailability: resultSetDataAvailability(latestManifest),
                        artifactRefJson: latestRef,
                        updatedAt: completedAt,
                    })
                    .where(eq(resultSetsTable.id, artifactId)),
            ]).catch(() => undefined);
            console.warn('[resultSets] full data finalize failed; keeping preview-only result set', {
                artifactId,
                error: message,
            });
            return {
                ...previewOutput,
                rowCount: streamedRowCount || rowCount,
            };
        } finally {
            await fullData?.cleanup?.().catch(() => undefined);
        }
    }

    async getStorageUsage(organizationId: string): Promise<ResultSetStorageUsage> {
        this.assertInited();

        const [resultRows, exportRows] = await Promise.all([
            this.db
                .select({ bytes: sql<string>`coalesce(sum(${resultSetsTable.byteSize}), 0)` })
                .from(resultSetsTable)
                .where(eq(resultSetsTable.organizationId, organizationId)),
            this.db
                .select({ bytes: sql<string>`coalesce(sum(${resultSetExports.byteSize}), 0)` })
                .from(resultSetExports)
                .where(eq(resultSetExports.organizationId, organizationId)),
        ]);
        const resultSetsBytes = Number(resultRows[0]?.bytes ?? 0);
        const exportsBytes = Number(exportRows[0]?.bytes ?? 0);
        return {
            resultSetsBytes,
            exportsBytes,
            totalBytes: resultSetsBytes + exportsBytes,
        };
    }

    async cleanupWorkspaceStorage(params: {
        organizationId: string;
        now?: Date;
        limit?: number;
        maxStorageBytes?: number;
        protectedResultSetId?: string;
        protectedExportId?: string;
    }): Promise<CleanupExpiredResultSetsOutput> {
        this.assertInited();

        const now = params.now ?? new Date();
        const limit = Math.max(1, Math.min(params.limit ?? STORAGE_CLEANUP_BATCH_SIZE, 500));
        const maxStorageBytes = params.maxStorageBytes ?? (await this.getMaxStorageBytes(params.organizationId));
        let scanned = 0;
        let deletedResultSets = 0;
        let deletedExports = 0;
        let bytesFreed = 0;
        let failures = 0;
        const failedExportIds = new Set<string>();
        const failedResultSetIds = new Set<string>();

        const legacy = await this.reconcileLegacyExports(params.organizationId, now).catch(error => {
            console.warn('[resultSets] legacy export reconciliation failed', { organizationId: params.organizationId, error: getErrorMessage(error) });
            return { scanned: 0, deleted: 0, bytesFreed: 0, failures: 1 };
        });
        scanned += legacy.scanned;
        deletedExports += legacy.deleted;
        bytesFreed += legacy.bytesFreed;
        failures += legacy.failures;

        const deleteExportRows = async (expiredOnly: boolean) => {
            while (true) {
                const conditions = [eq(resultSetExports.organizationId, params.organizationId)];
                if (expiredOnly) conditions.push(lte(resultSetExports.expiresAt, now));
                if (params.protectedExportId) conditions.push(ne(resultSetExports.id, params.protectedExportId));
                if (failedExportIds.size) conditions.push(notInArray(resultSetExports.id, [...failedExportIds]));
                const rows = await this.db
                    .select()
                    .from(resultSetExports)
                    .where(and(...conditions))
                    .orderBy(asc(expiredOnly ? resultSetExports.expiresAt : resultSetExports.createdAt))
                    .limit(limit);
                if (!rows.length) break;
                scanned += rows.length;
                for (const row of rows) {
                    try {
                        await this.artifacts.objectStore.delete(row.objectPath);
                        await this.db.delete(resultSetExports).where(and(eq(resultSetExports.organizationId, params.organizationId), eq(resultSetExports.id, row.id)));
                        deletedExports += 1;
                        bytesFreed += row.byteSize;
                    } catch (error) {
                        failures += 1;
                        failedExportIds.add(row.id);
                        console.warn('[resultSets] export artifact cleanup failed; retaining database record', { exportId: row.id, error: getErrorMessage(error) });
                    }
                }
                if (!expiredOnly && (await this.getStorageUsage(params.organizationId)).totalBytes <= maxStorageBytes) break;
            }
        };

        const deleteResultRows = async (expiredOnly: boolean) => {
            while (true) {
                const conditions = [eq(resultSetsTable.organizationId, params.organizationId)];
                if (expiredOnly) conditions.push(lte(resultSetsTable.expiresAt, now));
                if (params.protectedResultSetId) conditions.push(ne(resultSetsTable.id, params.protectedResultSetId));
                if (failedResultSetIds.size) conditions.push(notInArray(resultSetsTable.id, [...failedResultSetIds]));
                const rows = await this.db
                    .select({ id: resultSetsTable.id, artifactRefJson: resultSetsTable.artifactRefJson, byteSize: resultSetsTable.byteSize })
                    .from(resultSetsTable)
                    .where(and(...conditions))
                    .orderBy(asc(expiredOnly ? resultSetsTable.expiresAt : resultSetsTable.createdAt))
                    .limit(limit);
                if (!rows.length) break;
                scanned += rows.length;
                for (const row of rows) {
                    try {
                        await this.artifacts.resultSets.deleteResultSet(row.artifactRefJson);
                        await this.deleteResultSetRecord(params.organizationId, row.id, now);
                        deletedResultSets += 1;
                        bytesFreed += row.byteSize ?? 0;
                    } catch (error) {
                        failures += 1;
                        failedResultSetIds.add(row.id);
                        console.warn('[resultSets] result artifact cleanup failed; retaining database record', { resultSetId: row.id, error: getErrorMessage(error) });
                    }
                }
                if (!expiredOnly && (await this.getStorageUsage(params.organizationId)).totalBytes <= maxStorageBytes) break;
            }
        };

        await deleteExportRows(true);
        await deleteResultRows(true);
        if ((await this.getStorageUsage(params.organizationId)).totalBytes > maxStorageBytes) await deleteExportRows(false);
        if ((await this.getStorageUsage(params.organizationId)).totalBytes > maxStorageBytes) await deleteResultRows(false);

        const usageAfter = await this.getStorageUsage(params.organizationId);
        const [remainingExpiredExport, remainingExpiredResult] = await Promise.all([
            this.db
                .select({ id: resultSetExports.id })
                .from(resultSetExports)
                .where(and(eq(resultSetExports.organizationId, params.organizationId), lte(resultSetExports.expiresAt, now)))
                .limit(1),
            this.db
                .select({ id: resultSetsTable.id })
                .from(resultSetsTable)
                .where(and(eq(resultSetsTable.organizationId, params.organizationId), lte(resultSetsTable.expiresAt, now)))
                .limit(1),
        ]);

        return {
            scanned,
            deleted: deletedResultSets + deletedExports,
            deletedResultSets,
            deletedExports,
            bytesFreed,
            usageAfter,
            hasMore: Boolean(remainingExpiredExport.length || remainingExpiredResult.length || usageAfter.totalBytes > maxStorageBytes),
            failures,
        };
    }

    async cleanupExpiredResultSets(params: { organizationId: string; now?: Date; limit?: number }): Promise<CleanupExpiredResultSetsOutput> {
        return this.cleanupWorkspaceStorage(params);
    }

    async getQuerySession(params: { organizationId: string; sessionId: string }): Promise<QuerySessionReadOutput | null> {
        this.assertInited();

        const [runs, sets] = await Promise.all([
            this.db
                .select()
                .from(queryRuns)
                .where(and(eq(queryRuns.organizationId, params.organizationId), eq(queryRuns.sessionId, params.sessionId)))
                .orderBy(asc(queryRuns.setIndex), asc(queryRuns.createdAt)),
            this.db
                .select()
                .from(resultSetsTable)
                .where(and(eq(resultSetsTable.organizationId, params.organizationId), eq(resultSetsTable.sessionId, params.sessionId)))
                .orderBy(asc(resultSetsTable.setIndex), asc(resultSetsTable.createdAt)),
        ]);

        if (!runs.length && !sets.length) return null;

        const statuses = [...runs.map(row => row.status), ...sets.map(row => row.status)].filter(Boolean);
        const status = statuses.includes('error') ? 'error' : statuses.includes('canceled') ? 'canceled' : statuses.includes('running') ? 'running' : 'success';
        const errorMessage = runs.find(row => row.errorMessage)?.errorMessage ?? sets.find(row => row.errorMessage)?.errorMessage ?? null;
        const startedAt =
            [...runs.map(row => row.createdAt), ...sets.map(row => row.createdAt)]
                .filter((value): value is Date => value instanceof Date)
                .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
        const finishedAt =
            [...runs.map(row => row.updatedAt), ...sets.map(row => row.updatedAt)]
                .filter((value): value is Date => value instanceof Date)
                .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
        const durationMs =
            runs.reduce<number | null>((total, row) => (typeof row.durationMs === 'number' ? (total ?? 0) + row.durationMs : total), null) ??
            (startedAt && finishedAt ? Math.max(0, finishedAt.getTime() - startedAt.getTime()) : null);

        return {
            sessionId: params.sessionId,
            status,
            errorMessage,
            startedAt,
            finishedAt,
            durationMs,
            resultSetCount: Math.max(sets.length, runs.length),
            source: sets[0]?.sourceType ?? 'query-run',
        };
    }

    async listSessionResultSets(params: { organizationId: string; sessionId: string }): Promise<SessionResultSetMeta[]> {
        this.assertInited();

        const [rows, runs] = await Promise.all([
            this.db
                .select({
                    resultSet: resultSetsTable,
                    fallbackConnectionType: connections.type,
                })
                .from(resultSetsTable)
                .leftJoin(connections, and(eq(connections.id, resultSetsTable.connectionId), eq(connections.organizationId, resultSetsTable.organizationId)))
                .where(and(eq(resultSetsTable.organizationId, params.organizationId), eq(resultSetsTable.sessionId, params.sessionId)))
                .orderBy(asc(resultSetsTable.setIndex), asc(resultSetsTable.createdAt)),
            this.db
                .select()
                .from(queryRuns)
                .where(and(eq(queryRuns.organizationId, params.organizationId), eq(queryRuns.sessionId, params.sessionId)))
                .orderBy(asc(queryRuns.setIndex), asc(queryRuns.createdAt)),
        ]);
        const runsByResultSetId = new Map(runs.map(row => [row.resultSetId, row]));
        const runsBySetIndex = new Map(runs.map(row => [row.setIndex, row]));

        const persistedResultSets = await Promise.all(
            rows.map(async joinedRow => {
                const row = joinedRow.resultSet;
                const [stats, legacySourceDatabaseName] = await Promise.all([
                    this.readProfile({
                        organizationId: params.organizationId,
                        resultSetId: row.id,
                        sampleRows: 200,
                    })
                        .then(profile => profile.stats)
                        .catch(() => null),
                    row.sourceDatabaseName
                        ? Promise.resolve(null)
                        : this.artifacts.resultSets
                              .readManifest(row.artifactRefJson as ResultSetArtifactRef)
                              .then(manifest => manifest.source.databaseName ?? manifest.sql?.dialect ?? null)
                              .catch(() => null),
                ]);

                const run = runsByResultSetId.get(row.id) ?? runsBySetIndex.get(row.setIndex ?? 0) ?? null;
                const artifactRef = row.artifactRefJson as ResultSetArtifactRef;

                return {
                    sessionId: row.sessionId ?? params.sessionId,
                    setIndex: row.setIndex ?? 0,
                    sqlText: row.sql ?? '',
                    sqlOp: row.operation ?? null,
                    title: null,
                    columns: row.schemaJson ?? [],
                    stats,
                    viewState: row.viewState ?? null,
                    aiProfileVersion: null,
                    rowCount: row.rowCount ?? null,
                    limited: row.limited,
                    limit: row.limit ?? null,
                    resultSetId: row.id,
                    dataAvailability: row.dataAvailability,
                    previewRowCount: row.previewRowCount ?? null,
                    affectedRows: null,
                    status: row.status,
                    errorMessage: row.errorMessage ?? null,
                    errorCode: null,
                    errorSqlState: null,
                    errorMeta: null,
                    warnings: row.storageLimitApplied ? [RESULT_SET_STORAGE_LIMIT_WARNING] : null,
                    startedAt: (run?.createdAt ?? row.createdAt) instanceof Date ? (run?.createdAt ?? row.createdAt).getTime() : null,
                    finishedAt: (run?.updatedAt ?? row.updatedAt) instanceof Date ? (run?.updatedAt ?? row.updatedAt).getTime() : null,
                    durationMs: run?.durationMs ?? null,
                    byteSize: row.byteSize ?? null,
                    artifactStore: artifactRef.store ?? null,
                    storageFormat: storageFormatFor(row.dataAvailability),
                    sourceConnectionType: row.sourceConnectionType ?? joinedRow.fallbackConnectionType ?? null,
                    sourceDatabaseName: row.sourceDatabaseName ?? legacySourceDatabaseName ?? null,
                    createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : null,
                    expiresAt: row.expiresAt instanceof Date ? row.expiresAt.getTime() : null,
                };
            }),
        );

        const errorRuns: SessionResultSetMeta[] = runs
            .filter(run => run.status === 'error' && !run.resultSetId)
            .map(run => ({
                sessionId: run.sessionId ?? params.sessionId,
                setIndex: run.setIndex ?? 0,
                sqlText: run.sql,
                sqlOp: null,
                title: null,
                columns: [],
                stats: null,
                viewState: null,
                aiProfileVersion: null,
                rowCount: null,
                limited: false,
                limit: null,
                resultSetId: null,
                dataAvailability: 'none',
                previewRowCount: 0,
                affectedRows: null,
                status: 'error',
                errorMessage: run.errorMessage ?? null,
                errorCode: null,
                errorSqlState: null,
                errorMeta: null,
                warnings: null,
                startedAt: run.createdAt instanceof Date ? run.createdAt.getTime() : null,
                finishedAt: run.updatedAt instanceof Date ? run.updatedAt.getTime() : null,
                durationMs: run.durationMs ?? null,
                byteSize: null,
                artifactStore: null,
                storageFormat: null,
                sourceConnectionType: null,
                sourceDatabaseName: null,
                createdAt: run.createdAt instanceof Date ? run.createdAt.getTime() : null,
                expiresAt: null,
            }));

        return [...persistedResultSets, ...errorRuns].sort((a, b) => a.setIndex - b.setIndex);
    }

    async updateResultSetViewState(params: { organizationId: string; sessionId: string; setIndex: number; viewState: unknown | null }) {
        this.assertInited();

        await this.db
            .update(resultSetsTable)
            .set({
                viewState: params.viewState,
                updatedAt: new Date(),
            })
            .where(and(eq(resultSetsTable.organizationId, params.organizationId), eq(resultSetsTable.sessionId, params.sessionId), eq(resultSetsTable.setIndex, params.setIndex)))
            .execute();
    }

    async readRows(
        params: { organizationId: string; resultSetId: string; offset?: number | null; limit?: number | null } & ResultSetQueryOperations,
    ): Promise<ReadResultRowsOutput> {
        this.assertInited();

        const record = await this.getRecord(params.organizationId, params.resultSetId);

        const offset = normalizeOffset(params.offset);
        const limit = normalizeLimit(params.limit);
        const artifactRef = record.artifactRefJson as ResultSetArtifactRef;
        const manifest = await this.artifacts.resultSets.readManifest(artifactRef);
        const columns = manifest.schema ?? record.schemaJson ?? [];
        const dataAvailability = resultSetDataAvailability(manifest);
        const cacheKey = makeRowPageCacheKey({
            organizationId: params.organizationId,
            resultSetId: params.resultSetId,
            offset,
            limit,
            dataAvailability,
            manifestUpdatedAt: manifest.updatedAt,
            rowCount: manifest.rowCount ?? record.rowCount ?? null,
            operations: {
                sorts: params.sorts,
                filters: params.filters,
                search: params.search,
            },
        });
        const cachedPage = getCachedRowPage(cacheKey);
        if (cachedPage) {
            return cachedPage;
        }

        if (dataAvailability !== 'full') {
            const preview = await this.artifacts.resultSets.readPreview(artifactRef);
            const previewRows = preview?.rows ?? [];
            const output = {
                resultSetId: params.resultSetId,
                rows: previewRows.slice(offset, offset + limit),
                offset,
                limit,
                rowCount: manifest.rowCount ?? record.rowCount ?? previewRows.length,
                unfilteredRowCount: manifest.rowCount ?? record.rowCount ?? previewRows.length,
                columns,
                dataAvailability,
            };
            setCachedRowPage(cacheKey, output);
            return output;
        }

        const query = buildResultSetQueryClause(columns, params);
        const unfilteredRowCount = manifest.rowCount ?? record.rowCount ?? null;

        const output = await this.withDuckDbResultSetData(params.organizationId, params.resultSetId, async ({ connection, parquetPath }) => {
            const fromSql = ` FROM read_parquet(${quoteLiteral(parquetPath)})`;
            const countSql = query.whereSql ? `SELECT COUNT(*)${fromSql}${query.whereSql}` : null;
            const filteredCount =
                countSql != null ? Number(((await connection.runAndReadAll(countSql, query.params as any)).getRowsJson() as unknown[][])[0]?.[0] ?? 0) : unfilteredRowCount;
            const reader = await connection.runAndReadAll(`SELECT *${fromSql}${query.whereSql}${query.orderSql} LIMIT ${limit} OFFSET ${offset}`, query.params as any);
            const rows = rowsBySchema(reader.getRowsJson() as unknown[][], columns);
            return {
                resultSetId: params.resultSetId,
                rows,
                offset,
                limit,
                rowCount: filteredCount,
                unfilteredRowCount,
                columns,
                dataAvailability,
            };
        });
        setCachedRowPage(cacheKey, output);
        return output;
    }

    async createExport(
        params: {
            organizationId: string;
            resultSetId: string;
            format: 'csv' | 'parquet';
        } & ResultSetQueryOperations,
    ): Promise<ResultSetExportCreateOutput> {
        this.assertInited();

        const record = await this.getRecord(params.organizationId, params.resultSetId);
        const artifactRef = record.artifactRefJson as ResultSetArtifactRef;
        const manifest = await this.artifacts.resultSets.readManifest(artifactRef);
        const columns = manifest.schema ?? record.schemaJson ?? [];
        const dataAvailability = resultSetDataAvailability(manifest);
        if (dataAvailability !== 'full') {
            throw new DatabaseError('Result set full data is unavailable', 409);
        }

        const query = buildResultSetQueryClause(columns, params);
        const exportId = `rse_${newEntityId()}`;
        const extension = params.format === 'csv' ? 'csv' : 'parquet';
        const fileName = `${params.resultSetId}.${extension}`;
        const objectPath = this.exportObjectPath(params.organizationId, exportId, fileName);
        const contentType = exportContentType(params.format);

        await this.withDuckDbResultSetData(params.organizationId, params.resultSetId, async ({ connection, parquetPath, tempDir }) => {
            const exportPath = path.join(tempDir, `export.${extension}`);
            const fromSql = ` FROM read_parquet(${quoteLiteral(parquetPath)})`;
            const selectSql = `SELECT *${fromSql}${query.whereSql}${query.orderSql}`;

            const copyFormat = params.format === 'csv' ? 'CSV, HEADER TRUE' : 'PARQUET';
            await connection.runAndReadAll(`COPY (${selectSql}) TO ${quoteLiteral(exportPath)} (FORMAT ${copyFormat})`, query.params as any);
            await this.artifacts.objectStore.put(objectPath, createReadStream(exportPath), { contentType });
        });

        const stat = await this.artifacts.objectStore.stat(objectPath);
        const byteSize = stat?.byteSize ?? 0;
        const maxStorageBytes = await this.getMaxStorageBytes(params.organizationId);
        if (byteSize > maxStorageBytes) {
            await this.artifacts.objectStore.delete(objectPath).catch(() => undefined);
            throw new DatabaseError('Export exceeds the Workspace storage limit', 413);
        }

        const now = new Date();
        let exportRegistered = false;
        try {
            await this.db.insert(resultSetExports).values({
                id: exportId,
                organizationId: params.organizationId,
                resultSetId: params.resultSetId,
                objectPath,
                format: params.format,
                fileName,
                byteSize,
                expiresAt: new Date(now.getTime() + EXPORT_RETENTION_MS),
                createdAt: now,
            });
            exportRegistered = true;
            await this.enforceStorageLimit(params.organizationId, { protectedExportId: exportId });
            if ((await this.getStorageUsage(params.organizationId)).totalBytes > maxStorageBytes) {
                throw new DatabaseError('Workspace storage limit reached; export was not retained', 413);
            }
        } catch (error) {
            try {
                await this.artifacts.objectStore.delete(objectPath);
                if (exportRegistered) await this.db.delete(resultSetExports).where(eq(resultSetExports.id, exportId));
            } catch (cleanupError) {
                console.warn('[resultSets] failed to discard rejected export; retaining its database record for retry', {
                    exportId,
                    error: getErrorMessage(cleanupError),
                });
            }
            throw error;
        }

        return {
            exportId,
            format: params.format,
            fileName,
            byteSize,
            downloadUrl: `/api/result-set-exports/${encodeURIComponent(exportId)}`,
        };
    }

    async openExport(params: { organizationId: string; exportId: string }): Promise<ResultSetExportObject> {
        this.assertInited();

        const [record] = await this.db
            .select()
            .from(resultSetExports)
            .where(and(eq(resultSetExports.organizationId, params.organizationId), eq(resultSetExports.id, params.exportId)))
            .limit(1);
        if (record && record.expiresAt.getTime() <= Date.now()) {
            try {
                await this.artifacts.objectStore.delete(record.objectPath);
                await this.db.delete(resultSetExports).where(eq(resultSetExports.id, record.id));
            } catch (error) {
                console.warn('[resultSets] expired export cleanup failed during download; retaining record for retry', {
                    exportId: record.id,
                    error: getErrorMessage(error),
                });
            }
            throw new DatabaseError('Result set export has expired', 404);
        }

        if (record) {
            if (!(await this.artifacts.objectStore.exists(record.objectPath))) throw new DatabaseError('Result set export not found', 404);
            return {
                stream: await this.artifacts.objectStore.get(record.objectPath),
                fileName: record.fileName,
                contentType: exportContentType(record.format),
                byteSize: record.byteSize,
            };
        }

        const prefix = this.exportPrefix(params.organizationId, params.exportId);
        let selected: { path: string; byteSize?: number } | null = null;
        for await (const object of this.artifacts.objectStore.list(prefix)) {
            selected = { path: object.path, byteSize: object.byteSize };
            break;
        }

        if (!selected) throw new DatabaseError('Result set export not found', 404);
        const fileName = selected.path.split('/').pop() ?? `${params.exportId}.csv`;
        const format = fileName.endsWith('.parquet') ? 'parquet' : 'csv';
        return {
            stream: await this.artifacts.objectStore.get(selected.path),
            fileName,
            contentType: exportContentType(format),
            byteSize: selected.byteSize,
        };
    }

    async deleteExport(params: { organizationId: string; exportId: string }): Promise<void> {
        this.assertInited();

        const [record] = await this.db
            .select({ objectPath: resultSetExports.objectPath })
            .from(resultSetExports)
            .where(and(eq(resultSetExports.organizationId, params.organizationId), eq(resultSetExports.id, params.exportId)))
            .limit(1);
        if (record) {
            await this.artifacts.objectStore.delete(record.objectPath);
            await this.db.delete(resultSetExports).where(and(eq(resultSetExports.organizationId, params.organizationId), eq(resultSetExports.id, params.exportId)));
            return;
        }

        await this.artifacts.objectStore.deletePrefix(this.exportPrefix(params.organizationId, params.exportId));
    }

    async readChart(params: ResultSetChartReadInput) {
        this.assertInited();

        const record = await this.getRecord(params.organizationId, params.resultSetId);
        const artifactRef = record.artifactRefJson as ResultSetArtifactRef;
        const manifest = await this.artifacts.resultSets.readManifest(artifactRef);
        const columns = manifest.schema ?? record.schemaJson ?? [];
        if (resultSetDataAvailability(manifest) !== 'full') {
            throw new DatabaseError('Result set full data is unavailable', 409);
        }

        const allowlist = buildColumnAllowlist(columns);
        const xColumn = getAllowedColumn(allowlist, params.xKey);
        if (!xColumn) return { data: [], series: [], bucketHint: null };

        const groupColumn = params.groupKey && params.groupKey !== '__none__' ? getAllowedColumn(allowlist, params.groupKey) : null;
        const metric = this.parseChartMetric(params.yKey, allowlist);
        const query = buildResultSetQueryClause(columns, { filters: params.filters, search: params.search });

        return this.withDuckDbResultSetData(params.organizationId, params.resultSetId, async ({ connection, parquetPath }) => {
            const fromSql = ` FROM read_parquet(${quoteLiteral(parquetPath)})`;
            const metricAlias = '__value__';

            if (params.chartType === 'scatter' && metric.column) {
                const xExpr = `TRY_CAST(${columnSql(xColumn)} AS DOUBLE)`;
                const yExpr = `TRY_CAST(${columnSql(metric.column)} AS DOUBLE)`;
                const rows = (
                    (
                        await connection.runAndReadAll(
                            `
                        SELECT ${xExpr} AS xLabel, ${yExpr} AS ${quoteIdentifier(metricAlias)}
                        ${fromSql}
                        ${query.whereSql ? `${query.whereSql} AND` : 'WHERE'} ${xExpr} IS NOT NULL AND ${yExpr} IS NOT NULL
                        LIMIT 1000
                        `,
                            query.params as any,
                        )
                    ).getRowObjectsJson() as Record<string, unknown>[]
                ).map(row => ({ xLabel: row.xLabel, [metricAlias]: row[metricAlias] }));

                return {
                    data: rows,
                    series: [{ key: metricAlias, label: metric.label }],
                    bucketHint: rows.length >= 1000 ? 'Limited to first 1,000 points' : null,
                };
            }

            if (params.chartType === 'histogram') {
                const xExpr = `TRY_CAST(${columnSql(xColumn)} AS DOUBLE)`;
                const rows = (
                    await connection.runAndReadAll(
                        `
                    WITH filtered AS (
                        SELECT ${xExpr} AS x_value
                        ${fromSql}
                        ${query.whereSql}
                    ),
                    bounds AS (
                        SELECT MIN(x_value) AS min_value, MAX(x_value) AS max_value
                        FROM filtered
                        WHERE x_value IS NOT NULL
                    ),
                    bucketed AS (
                        SELECT
                            CASE
                                WHEN bounds.max_value = bounds.min_value THEN 0
                                ELSE LEAST(19, GREATEST(0, FLOOR(((filtered.x_value - bounds.min_value) / NULLIF(bounds.max_value - bounds.min_value, 0)) * 20)))
                            END AS bucket_index,
                            bounds.min_value,
                            bounds.max_value
                        FROM filtered
                        CROSS JOIN bounds
                        WHERE filtered.x_value IS NOT NULL
                    )
                    SELECT
                        CASE
                            WHEN max_value = min_value THEN CAST(min_value AS VARCHAR)
                            ELSE CAST(ROUND(min_value + bucket_index * ((max_value - min_value) / 20), 2) AS VARCHAR)
                                || ' - ' ||
                                CAST(ROUND(min_value + (bucket_index + 1) * ((max_value - min_value) / 20), 2) AS VARCHAR)
                        END AS xLabel,
                        COUNT(*) AS ${quoteIdentifier(metricAlias)}
                    FROM bucketed
                    GROUP BY bucket_index, min_value, max_value
                    ORDER BY bucket_index
                    `,
                        query.params as any,
                    )
                ).getRowObjectsJson() as Record<string, unknown>[];

                return {
                    data: rows.map(row => ({ xLabel: row.xLabel, [metricAlias]: row[metricAlias] })),
                    series: [{ key: metricAlias, label: 'Count' }],
                    bucketHint: 'Auto-bucketed into up to 20 ranges',
                };
            }

            const xExpr = `COALESCE(CAST(${columnSql(xColumn)} AS VARCHAR), '(empty)')`;
            const groupExpr = groupColumn ? `COALESCE(CAST(${columnSql(groupColumn)} AS VARCHAR), '(empty)')` : null;
            const selectParts = [`${xExpr} AS xLabel`, `${metric.sql} AS ${quoteIdentifier(metricAlias)}`];
            const groupParts = [xExpr];
            if (groupExpr) {
                selectParts.splice(1, 0, `${groupExpr} AS seriesLabel`);
                groupParts.push(groupExpr);
            }

            const sql = `SELECT ${selectParts.join(', ')}${fromSql}${query.whereSql} GROUP BY ${groupParts.join(', ')} ORDER BY ${quoteIdentifier(metricAlias)} DESC NULLS LAST LIMIT 500`;
            const rows = ((await connection.runAndReadAll(sql, query.params as any)).getRowObjectsJson() as Record<string, unknown>[]) ?? [];
            if (!groupExpr) {
                return {
                    data: rows.map(row => ({
                        xLabel: row.xLabel,
                        [metricAlias]: row[metricAlias],
                    })),
                    series: [{ key: metricAlias, label: metric.label }],
                    bucketHint: rows.length >= 500 ? 'Limited to top 500 groups' : null,
                };
            }

            const dataByX = new Map<string, Record<string, unknown>>();
            const series = new Map<string, string>();
            for (const row of rows) {
                const xLabel = String(row.xLabel ?? '(empty)');
                const label = String(row.seriesLabel ?? '(empty)');
                const seriesKey = `series_${series.size}_${label.replace(/[^a-zA-Z0-9_]/g, '_')}`;
                const existingKey = [...series.entries()].find(([, existingLabel]) => existingLabel === label)?.[0] ?? seriesKey;
                if (!series.has(existingKey)) series.set(existingKey, label);
                const datum = dataByX.get(xLabel) ?? { xLabel };
                datum[existingKey] = row[metricAlias];
                dataByX.set(xLabel, datum);
            }

            return {
                data: [...dataByX.values()],
                series: [...series.entries()].map(([key, label]) => ({ key, label })),
                bucketHint: rows.length >= 500 ? 'Limited to top 500 grouped points' : null,
            };
        });
    }

    async readProfile(params: { organizationId: string; resultSetId: string; sampleRows?: number | null }): Promise<ResultSetProfileReadOutput> {
        this.assertInited();

        const record = await this.getRecord(params.organizationId, params.resultSetId);
        const artifactRef = record.artifactRefJson as ResultSetArtifactRef;
        const manifest = await this.artifacts.resultSets.readManifest(artifactRef);
        const columns = manifest.schema ?? record.schemaJson ?? [];
        const sampleLimit = Math.max(1, Math.min(200, params.sampleRows ?? 200));
        const dataAvailability = resultSetDataAvailability(manifest);

        if (dataAvailability !== 'full') {
            const preview = await this.artifacts.resultSets.readPreview(artifactRef);
            const sampleRows = (preview?.rows ?? []).slice(0, sampleLimit);
            return this.buildBasicProfile({ columns, sampleRows, rowCount: manifest.rowCount ?? record.rowCount ?? sampleRows.length });
        }

        return this.withDuckDbResultSetData(params.organizationId, params.resultSetId, async ({ connection, parquetPath }) => {
            const reader = await connection.runAndReadAll(`SELECT * FROM read_parquet(${quoteLiteral(parquetPath)}) LIMIT ${sampleLimit}`);
            const sampleRows = rowsBySchema(reader.getRowsJson() as unknown[][], columns);
            const rowCount = manifest.rowCount ?? record.rowCount ?? null;
            const allowlist = buildColumnAllowlist(columns);
            const columnStats = new Map<string, Record<string, unknown>>();
            const columnTopK = new Map<string, Array<{ value: string; count: number }>>();

            for (const column of columns) {
                if (!getAllowedColumn(allowlist, column.name)) continue;
                const nameSql = columnSql(column);
                const statsReader = await connection.runAndReadAll(
                    `
                    SELECT
                        COUNT(*) AS total_count,
                        COUNT(${nameSql}) AS non_null_count,
                        COUNT(DISTINCT CAST(${nameSql} AS VARCHAR)) AS distinct_count,
                        MIN(TRY_CAST(${nameSql} AS DOUBLE)) AS min_number,
                        MAX(TRY_CAST(${nameSql} AS DOUBLE)) AS max_number,
                        SUM(TRY_CAST(${nameSql} AS DOUBLE)) AS sum_number,
                        AVG(TRY_CAST(${nameSql} AS DOUBLE)) AS avg_number,
                        SUM(CASE WHEN TRY_CAST(${nameSql} AS DOUBLE) = 0 THEN 1 ELSE 0 END) AS zero_count,
                        SUM(CASE WHEN TRY_CAST(${nameSql} AS DOUBLE) < 0 THEN 1 ELSE 0 END) AS negative_count,
                        MIN(TRY_CAST(${nameSql} AS TIMESTAMP)) AS min_time,
                        MAX(TRY_CAST(${nameSql} AS TIMESTAMP)) AS max_time
                    FROM read_parquet(${quoteLiteral(parquetPath)})
                    `,
                );
                columnStats.set(column.name, (statsReader.getRowObjectsJson()[0] ?? {}) as Record<string, unknown>);

                const topReader = await connection.runAndReadAll(
                    `
                    SELECT CAST(${nameSql} AS VARCHAR) AS value, COUNT(*) AS count
                    FROM read_parquet(${quoteLiteral(parquetPath)})
                    WHERE ${nameSql} IS NOT NULL AND CAST(${nameSql} AS VARCHAR) <> ''
                    GROUP BY 1
                    ORDER BY count DESC, value ASC
                    LIMIT 8
                    `,
                );
                columnTopK.set(
                    column.name,
                    ((topReader.getRowObjectsJson() as Record<string, unknown>[]) ?? []).map(row => ({
                        value: String(row.value ?? ''),
                        count: Number(row.count ?? 0),
                    })),
                );
            }

            return this.buildProfile({
                columns,
                sampleRows,
                rowCount,
                limited: Boolean(record.limited),
                limit: record.limit ?? null,
                columnStats,
                columnTopK,
            });
        });
    }

    private async enforceStorageLimit(
        organizationId: string,
        options: { protectedResultSetId?: string; protectedExportId?: string } = {},
    ): Promise<CleanupExpiredResultSetsOutput> {
        return this.cleanupWorkspaceStorage({
            organizationId,
            protectedResultSetId: options.protectedResultSetId,
            protectedExportId: options.protectedExportId,
        });
    }

    private async deleteResultSetRecord(organizationId: string, resultSetId: string, now: Date) {
        await Promise.all([
            this.db.delete(agentRunResultSets).where(eq(agentRunResultSets.resultSetId, resultSetId)),
            this.db
                .update(queryRuns)
                .set({ resultSetId: null, updatedAt: now })
                .where(and(eq(queryRuns.organizationId, organizationId), eq(queryRuns.resultSetId, resultSetId))),
            this.db.update(workQueryResultSets).set({ resultSetId: null, artifactRefJson: null }).where(eq(workQueryResultSets.resultSetId, resultSetId)),
        ]);
        await this.db.delete(resultSetsTable).where(and(eq(resultSetsTable.organizationId, organizationId), eq(resultSetsTable.id, resultSetId)));
    }

    private async reconcileLegacyExports(organizationId: string, now: Date) {
        const prefix = joinObjectPath('result-set-exports', organizationPathPart(organizationId));
        const registered = await this.db.select({ objectPath: resultSetExports.objectPath }).from(resultSetExports).where(eq(resultSetExports.organizationId, organizationId));
        const registeredPaths = new Set(registered.map(row => row.objectPath));
        let scanned = 0;
        let deleted = 0;
        let bytesFreed = 0;
        let failures = 0;

        for await (const object of this.artifacts.objectStore.list(prefix)) {
            if (registeredPaths.has(object.path)) continue;
            scanned += 1;
            const relative = object.path.slice(prefix.length).replace(/^\/+/, '');
            const [exportId, fileName] = relative.split('/');
            if (!exportId || !fileName) continue;
            const createdAt = object.updatedAt ?? now;
            if (createdAt.getTime() + EXPORT_RETENTION_MS <= now.getTime()) {
                try {
                    await this.artifacts.objectStore.delete(object.path);
                    deleted += 1;
                    bytesFreed += object.byteSize ?? 0;
                } catch (error) {
                    failures += 1;
                    console.warn('[resultSets] legacy export cleanup failed', { objectPath: object.path, error: getErrorMessage(error) });
                }
                continue;
            }
            const format = fileName.endsWith('.parquet') ? 'parquet' : 'csv';
            await this.db
                .insert(resultSetExports)
                .values({
                    id: exportId,
                    organizationId,
                    resultSetId: null,
                    objectPath: object.path,
                    format,
                    fileName,
                    byteSize: object.byteSize ?? 0,
                    expiresAt: new Date(createdAt.getTime() + EXPORT_RETENTION_MS),
                    createdAt,
                })
                .catch(() => undefined);
        }

        return { scanned, deleted, bytesFreed, failures };
    }

    private async getRecord(organizationId: string, resultSetId: string): Promise<ResultSetRecord> {
        const [record] = await this.db
            .select()
            .from(resultSetsTable)
            .where(and(eq(resultSetsTable.organizationId, organizationId), eq(resultSetsTable.id, resultSetId)))
            .limit(1);

        if (!record) throw new DatabaseError('Result set not found', 404);
        return record;
    }

    private async withDuckDbResultSetData<T>(
        organizationId: string,
        resultSetId: string,
        fn: (ctx: { connection: any; parquetPath: string; tempDir: string }) => Promise<T>,
    ): Promise<T> {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), `dory-resultset-${resultSetId}-`));
        const dataDir = path.join(/* turbopackIgnore: true */ tempDir, 'data');
        const parquetPath = path.join(dataDir, '*.parquet');
        let instance: any = null;
        try {
            const record = await this.getRecord(organizationId, resultSetId);
            const artifactRef = record.artifactRefJson as ResultSetArtifactRef;
            const manifest = await this.artifacts.resultSets.readManifest(artifactRef);
            const dataParts = await this.artifacts.resultSets.openDataParts(artifactRef, manifest);
            if (!dataParts.length) throw new DatabaseError('Result set data is unavailable', 404);
            for (const part of dataParts) {
                const localPath = localDataPartPath(tempDir, part.path);
                await mkdir(path.dirname(localPath), { recursive: true });
                await pipeline(part.stream, createWriteStream(localPath, { mode: 0o600 }));
            }

            const { DuckDBInstance } = await import('@duckdb/node-api');
            instance = await DuckDBInstance.create(path.join(tempDir, 'reader.duckdb'));
            const connection = await instance.connect();
            try {
                await configureResultSetDuckDb(connection, path.join(tempDir, 'duckdb-tmp'));
                return await fn({ connection, parquetPath, tempDir });
            } finally {
                connection.closeSync();
            }
        } finally {
            instance?.closeSync();
            await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
        }
    }

    private async getRetentionDays(organizationId: string): Promise<number> {
        const rows = await this.db.select({ metadata: organizations.metadata }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
        return rows.length ? getResultSetRetentionDaysFromOrganizationMetadata(rows[0]?.metadata) : DEFAULT_RESULT_SET_RETENTION_DAYS;
    }

    private async getMaxStorageBytes(organizationId: string): Promise<number> {
        const rows = await this.db.select({ metadata: organizations.metadata }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
        return rows.length ? getResultSetMaxStorageBytesFromOrganizationMetadata(rows[0]?.metadata) : DEFAULT_RESULT_SET_MAX_STORAGE_BYTES;
    }

    private exportObjectPath(organizationId: string, exportId: string, fileName: string) {
        return joinObjectPath('result-set-exports', organizationPathPart(organizationId), safeObjectPathPart(exportId), safeObjectPathPart(fileName));
    }

    private exportPrefix(organizationId: string, exportId: string) {
        return `${joinObjectPath('result-set-exports', organizationPathPart(organizationId), safeObjectPathPart(exportId))}/`;
    }

    private parseChartMetric(yKey: string, allowlist: Map<string, ResultSetColumn>) {
        if (yKey === 'count') {
            return { sql: 'COUNT(*)', label: 'Count' };
        }
        const [kind, rawColumn] = yKey.split(':');
        const column = getAllowedColumn(allowlist, rawColumn);
        if (!column) return { sql: 'COUNT(*)', label: 'Count' };
        const numeric = `TRY_CAST(${columnSql(column)} AS DOUBLE)`;
        if (kind === 'sum') return { sql: `SUM(${numeric})`, label: `Sum ${column.name}`, column };
        if (kind === 'avg') return { sql: `AVG(${numeric})`, label: `Avg ${column.name}`, column };
        if (kind === 'max') return { sql: `MAX(${numeric})`, label: `Max ${column.name}`, column };
        if (kind === 'min') return { sql: `MIN(${numeric})`, label: `Min ${column.name}`, column };
        if (kind === 'count_distinct') return { sql: `COUNT(DISTINCT ${columnSql(column)})`, label: `Distinct ${column.name}`, column };
        if (kind === 'count_true') return { sql: `SUM(CASE WHEN ${columnSql(column)} THEN 1 ELSE 0 END)`, label: `True ${column.name}`, column };
        return { sql: 'COUNT(*)', label: 'Count' };
    }

    private buildBasicProfile(params: { columns: ResultSetColumn[]; sampleRows: Record<string, unknown>[]; rowCount: number | null }): ResultSetProfileReadOutput {
        return this.buildProfile({
            columns: params.columns,
            sampleRows: params.sampleRows,
            rowCount: params.rowCount,
            limited: false,
            limit: null,
            columnStats: new Map(),
            columnTopK: new Map(),
        });
    }

    private buildProfile(params: {
        columns: ResultSetColumn[];
        sampleRows: Record<string, unknown>[];
        rowCount: number | null;
        limited: boolean;
        limit: number | null;
        columnStats: Map<string, Record<string, unknown>>;
        columnTopK: Map<string, Array<{ value: string; count: number }>>;
    }): ResultSetProfileReadOutput {
        const columnProfiles: Record<string, unknown> = {};
        let totalNullCells = 0;
        let numericColumnCount = 0;
        let dimensionColumnCount = 0;
        let timeColumnCount = 0;
        let identifierColumnCount = 0;
        const primaryMeasureColumns: string[] = [];
        const primaryDimensionColumns: string[] = [];
        let primaryTimeColumn: string | null = null;

        for (const column of params.columns) {
            const values = params.sampleRows.map(row => row[column.name]);
            const stats = params.columnStats.get(column.name);
            const totalCount = Number(stats?.total_count ?? values.length);
            const nonNullCount = Number(stats?.non_null_count ?? values.filter(value => value != null && value !== '').length);
            const nullCount = Math.max(0, totalCount - nonNullCount);
            const distinctCount = Number(stats?.distinct_count ?? new Set(values.filter(value => value != null && value !== '').map(value => String(value))).size);
            const normalizedType = normalizeProfileColumnType(column, values);
            const semanticRole = inferProfileSemanticRole({
                columnName: column.name,
                normalizedType,
                distinctCount,
                nonNullCount,
            });
            const topK = params.columnTopK.get(column.name) ?? buildSampleTopK(values);
            const nullRatio = totalCount > 0 ? nullCount / totalCount : 0;
            const distinctRatio = nonNullCount > 0 ? distinctCount / nonNullCount : 0;
            const entropy = shannonEntropy(topK.map(item => item.count));
            const topValueShare = nonNullCount > 0 && topK[0] ? topK[0].count / nonNullCount : null;
            const isHighCardinality = nonNullCount > 0 && distinctRatio >= 0.75;
            const isCategorical = nonNullCount > 0 && distinctCount > 0 && distinctRatio <= 0.3;

            if (normalizedType === 'integer' || normalizedType === 'number') numericColumnCount += 1;
            if (semanticRole === 'dimension') {
                dimensionColumnCount += 1;
                primaryDimensionColumns.push(column.name);
            }
            if (semanticRole === 'time') {
                timeColumnCount += 1;
                primaryTimeColumn ??= column.name;
            }
            if (semanticRole === 'identifier') identifierColumnCount += 1;
            if (semanticRole === 'measure') primaryMeasureColumns.push(column.name);
            totalNullCells += nullCount;

            columnProfiles[column.name] = {
                name: column.name,
                normalizedType,
                semanticRole,
                nullCount,
                nonNullCount,
                nullRatio,
                distinctCount,
                distinctRatio,
                entropy,
                topValueShare,
                informationDensity: informationDensityFor({ nonNullCount, distinctCount, distinctRatio, entropy, topValueShare }),
                sampleValues: values.filter(value => value != null && value !== '').slice(0, 5),
                topK: normalizedType === 'string' || semanticRole === 'dimension' ? topK : undefined,
                min: toFiniteNumber(stats?.min_number),
                max: toFiniteNumber(stats?.max_number),
                sum: toFiniteNumber(stats?.sum_number),
                avg: toFiniteNumber(stats?.avg_number),
                zeroCount: toFiniteNumber(stats?.zero_count),
                negativeCount: toFiniteNumber(stats?.negative_count),
                minTime: stats?.min_time == null ? null : String(stats.min_time),
                maxTime: stats?.max_time == null ? null : String(stats.max_time),
                isHighCardinality,
                isCategorical,
            };
        }

        let kind = 'detail_table';
        if (params.sampleRows.length === 1 && params.columns.length === 1 && numericColumnCount === 1) {
            kind = 'single_value';
        } else if (primaryTimeColumn && primaryMeasureColumns.length > 0) {
            kind = 'time_series';
        } else if (primaryDimensionColumns.length > 0 && primaryMeasureColumns.length > 0) {
            kind = 'aggregated_table';
        }

        const recommendedChart =
            kind === 'single_value'
                ? 'metric'
                : kind === 'time_series'
                  ? 'line'
                  : kind === 'aggregated_table'
                    ? ((columnProfiles[primaryDimensionColumns[0] ?? ''] as { distinctCount?: number } | undefined)?.distinctCount ?? 0) <= 8
                        ? 'pie'
                        : 'bar'
                    : primaryMeasureColumns.length >= 2
                      ? 'scatter'
                      : 'table';
        const totalCells = Math.max(0, (params.rowCount ?? params.sampleRows.length) * params.columns.length);

        return {
            columns: params.columns,
            stats: {
                summary: {
                    kind,
                    rowCount: params.rowCount,
                    columnCount: params.columns.length,
                    limited: params.limited,
                    limit: params.limit,
                    numericColumnCount,
                    dimensionColumnCount,
                    timeColumnCount,
                    identifierColumnCount,
                    nullCellRatio: totalCells > 0 ? totalNullCells / totalCells : null,
                    duplicateRowRatio: null,
                    isGoodForChart: recommendedChart !== 'table',
                    recommendedChart,
                    primaryTimeColumn,
                    primaryMeasureColumns,
                    primaryDimensionColumns,
                },
                columns: columnProfiles,
                sample: {
                    sampleStrategy: 'head',
                    sampleRowCount: params.sampleRows.length,
                    truncatedForAI: (params.rowCount ?? params.sampleRows.length) > params.sampleRows.length,
                },
            },
            sampleRows: params.sampleRows,
        };
    }

    private async writeFullDataArtifact(input: { artifactId: string; status: string; columns: ResultSetManifest['schema']; rows: ResultSetRowIterable }) {
        if (input.status !== 'success') return null;
        try {
            return await this.fullDataWriter.write({
                artifactId: input.artifactId,
                schema: input.columns,
                rows: input.rows,
                target: null,
            });
        } catch (error) {
            console.warn('[resultSets] full data parquet write failed; falling back to preview-only', {
                artifactId: input.artifactId,
                error,
            });
            return null;
        }
    }

    private assertInited() {
        if (!this.db) throw new DatabaseError('Result set repository not initialized', 500);
    }
}

export const __resultSetRepositoryTestInternals = {
    buildResultSetQueryClause,
    rowsBySchema,
};

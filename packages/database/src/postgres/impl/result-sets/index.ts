import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { and, eq } from 'drizzle-orm';

import { getDoryArtifactStore, joinObjectPath, safeObjectPathPart, type DoryArtifactStore } from '@dory/artifacts';
import { getClient } from '@dory/database/postgres/client';
import { agentRunResultSets, queryRuns, resultSets as resultSetsTable } from '@dory/database/postgres/schemas';
import {
    buildResultSetPreview,
    createDefaultResultSetDataWriter,
    inferResultSetColumns,
    resultSetDataAvailability,
    type ResultSetArtifactRef,
    type ResultSetColumn,
    type ResultSetDataAvailability,
    type ResultSetDataWriter,
    type ResultSetManifest,
} from '@dory/resultset';
import { DatabaseError } from '@dory/shared/errors/DatabaseError';
import { newEntityId } from '@dory/shared/id';
import type { PostgresDBClient } from '@dory/shared';

const DEFAULT_PREVIEW_ROWS = 200;
const DEFAULT_ROW_LIMIT = 1000;
const MAX_ROW_LIMIT = 5000;

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

export type PersistQueryResultSetStreamInput = Omit<PersistQueryResultSetInput, 'rows'> & {
    rows: AsyncIterable<unknown>;
    columns?: ResultSetColumn[];
    rowCount?: number | null;
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

type QueryClause = {
    whereSql: string;
    orderSql: string;
    params: unknown[];
    hasOperations: boolean;
};

type ResultSetRecord = typeof resultSetsTable.$inferSelect;

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

function getString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

function getNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getBoolean(value: unknown): boolean {
    return value === true;
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
    const integerLikeColumn = column.logicalType === 'number' || Boolean(column.databaseType && /\b(bigint|int8|integer|int4|smallint|int2|tinyint|number\(38,0\))\b/i.test(column.databaseType));
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

    async persistQueryResultSet(input: PersistQueryResultSetInput): Promise<PersistQueryResultSetOutput> {
        this.assertInited();

        const resultSet = input.resultSet;
        const rows = Array.isArray(input.rows) ? input.rows : [];
        const artifactId = `rs_${newEntityId()}`;
        const queryRunId = `qr_${newEntityId()}`;
        const actorType = inferActorType(input.source);
        const status = getString(resultSet.status) ?? 'success';
        const columns = inferResultSetColumns(rows, resultSet.columns);
        const rowCount = getNumber(resultSet.rowCount) ?? rows.length;
        const now = new Date();
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

        const { ref, manifest: persistedManifest } = await this.artifacts.resultSets.putResultSet({
            organizationId: input.organizationId,
            artifactId,
            manifest,
            preview: rows.length || status === 'success' ? preview : null,
            data: fullData?.data ?? null,
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
                workspaceId: input.workspaceId ?? null,
                tabId: input.tabId ?? null,
                workId: input.workId ?? null,
                agentRunId: input.agentRunId ?? null,
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

        return {
            resultSetId: artifactId,
            queryRunId,
            artifactRef: ref,
            dataAvailability: resultSetDataAvailability(persistedManifest),
            previewRows: preview.rows,
            previewRowCount: preview.previewRowCount,
            rowCount,
            schema: columns,
            byteSize: (persistedManifest.files.preview?.byteSize ?? 0) + (persistedManifest.files.data?.byteSize ?? 0),
        };
    }

    async persistQueryResultSetStream(input: PersistQueryResultSetStreamInput): Promise<PersistQueryResultSetOutput> {
        this.assertInited();

        const resultSet = input.resultSet;
        const artifactId = `rs_${newEntityId()}`;
        const queryRunId = `qr_${newEntityId()}`;
        const actorType = inferActorType(input.source);
        const status = getString(resultSet.status) ?? 'success';
        const explicitColumns = input.columns?.length ? input.columns : inferResultSetColumns([], resultSet.columns);
        const now = new Date();
        const previewRows: unknown[] = [];
        const maxPreviewRows = input.previewRows ?? DEFAULT_PREVIEW_ROWS;
        let streamedRowCount = 0;

        const countedRows = (async function* () {
            for await (const row of input.rows) {
                if (previewRows.length < maxPreviewRows) {
                    previewRows.push(row);
                }
                streamedRowCount += 1;
                yield row;
            }
        })();

        const fullData = await this.writeFullDataArtifact({
            artifactId,
            status,
            columns: explicitColumns,
            rows: countedRows,
        });
        if (!fullData && streamedRowCount === 0 && status === 'success') {
            for await (const row of countedRows) {
                void row;
            }
        }

        const completedAt = new Date();
        const durationMs = getDurationMs(resultSet.durationMs, resultSet.startedAt, completedAt);
        const columns = explicitColumns.length ? explicitColumns : inferResultSetColumns(previewRows);
        const rowCount = getNumber(resultSet.rowCount) ?? input.rowCount ?? fullData?.rowCount ?? streamedRowCount;
        const preview = buildResultSetPreview({
            columns,
            rows: previewRows,
            rowCount,
            maxRows: maxPreviewRows,
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
            updatedAt: completedAt.toISOString(),
            contentHash: null,
        };

        let persistedRef: ResultSetArtifactRef | null = null;
        try {
            const { ref, manifest: persistedManifest } = await this.artifacts.resultSets.putResultSet({
                organizationId: input.organizationId,
                artifactId,
                manifest,
                preview: previewRows.length || status === 'success' ? preview : null,
                data: fullData?.data ?? null,
            });
            persistedRef = ref;

            await this.db.insert(queryRuns).values({
                id: queryRunId,
                organizationId: input.organizationId,
                connectionId: input.connectionId ?? null,
                workspaceId: input.workspaceId ?? null,
                tabId: input.tabId ?? null,
                workId: input.workId ?? null,
                agentRunId: input.agentRunId ?? null,
                actorType,
                actorId: input.userId,
                sql: resultSet.sqlText || input.sessionSqlText,
                status,
                durationMs,
                errorMessage: getString(resultSet.errorMessage),
                resultSetId: artifactId,
                createdAt: now,
                updatedAt: completedAt,
            });

            await this.db.insert(resultSetsTable).values({
                id: artifactId,
                organizationId: input.organizationId,
                connectionId: input.connectionId ?? null,
                workspaceId: input.workspaceId ?? null,
                tabId: input.tabId ?? null,
                workId: input.workId ?? null,
                agentRunId: input.agentRunId ?? null,
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
                createdAt: now,
                updatedAt: completedAt,
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

            return {
                resultSetId: artifactId,
                queryRunId,
                artifactRef: ref,
                dataAvailability: resultSetDataAvailability(persistedManifest),
                previewRows: preview.rows,
                previewRowCount: preview.previewRowCount,
                rowCount,
                schema: columns,
                byteSize: (persistedManifest.files.preview?.byteSize ?? 0) + (persistedManifest.files.data?.byteSize ?? 0),
            };
        } catch (error) {
            if (persistedRef) {
                await this.artifacts.resultSets.deleteResultSet(persistedRef).catch(() => undefined);
            }
            throw error;
        } finally {
            await fullData?.cleanup?.();
        }
    }

    async readRows(params: { organizationId: string; resultSetId: string; offset?: number | null; limit?: number | null } & ResultSetQueryOperations): Promise<ReadResultRowsOutput> {
        this.assertInited();

        const record = await this.getRecord(params.organizationId, params.resultSetId);

        const offset = normalizeOffset(params.offset);
        const limit = normalizeLimit(params.limit);
        const artifactRef = record.artifactRefJson as ResultSetArtifactRef;
        const manifest = await this.artifacts.resultSets.readManifest(artifactRef);
        const columns = manifest.schema ?? record.schemaJson ?? [];
        const dataAvailability = resultSetDataAvailability(manifest);

        if (dataAvailability !== 'full') {
            const preview = await this.artifacts.resultSets.readPreview(artifactRef);
            const previewRows = preview?.rows ?? [];
            return {
                resultSetId: params.resultSetId,
                rows: previewRows.slice(offset, offset + limit),
                offset,
                limit,
                rowCount: manifest.rowCount ?? record.rowCount ?? previewRows.length,
                unfilteredRowCount: manifest.rowCount ?? record.rowCount ?? previewRows.length,
                columns,
                dataAvailability,
            };
        }

        const query = buildResultSetQueryClause(columns, params);
        const unfilteredRowCount = manifest.rowCount ?? record.rowCount ?? null;

        return this.withDuckDbResultSetData(params.organizationId, params.resultSetId, async ({ connection, parquetPath }) => {
            const fromSql = ` FROM read_parquet(${quoteLiteral(parquetPath)})`;
            const countSql = query.whereSql ? `SELECT COUNT(*)${fromSql}${query.whereSql}` : null;
            const filteredCount =
                countSql != null
                    ? Number(((await connection.runAndReadAll(countSql, query.params as any)).getRowsJson() as unknown[][])[0]?.[0] ?? 0)
                    : unfilteredRowCount;
            const reader = await connection.runAndReadAll(
                `SELECT *${fromSql}${query.whereSql}${query.orderSql} LIMIT ${limit} OFFSET ${offset}`,
                query.params as any,
            );
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

            if (params.format === 'parquet' && !query.hasOperations) {
                const data = await this.artifacts.resultSets.openData(artifactRef);
                if (!data) throw new DatabaseError('Result set data is unavailable', 404);
                await this.artifacts.objectStore.put(objectPath, data, { contentType });
                return;
            }

            const copyFormat = params.format === 'csv' ? "CSV, HEADER TRUE" : 'PARQUET';
            await connection.runAndReadAll(`COPY (${selectSql}) TO ${quoteLiteral(exportPath)} (FORMAT ${copyFormat})`, query.params as any);
            await this.artifacts.objectStore.put(objectPath, createReadStream(exportPath), { contentType });
        });

        const stat = await this.artifacts.objectStore.stat(objectPath);
        return {
            exportId,
            format: params.format,
            fileName,
            byteSize: stat?.byteSize,
            downloadUrl: `/api/result-set-exports/${encodeURIComponent(exportId)}`,
        };
    }

    async openExport(params: { organizationId: string; exportId: string }): Promise<ResultSetExportObject> {
        this.assertInited();

        const prefix = joinObjectPath('result-set-exports', organizationPathPart(params.organizationId), safeObjectPathPart(params.exportId));
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
            const xExpr = `COALESCE(CAST(${columnSql(xColumn)} AS VARCHAR), '(empty)')`;
            const groupExpr = groupColumn ? `COALESCE(CAST(${columnSql(groupColumn)} AS VARCHAR), '(empty)')` : null;
            const fromSql = ` FROM read_parquet(${quoteLiteral(parquetPath)})`;
            const metricAlias = '__value__';
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
            const columnProfiles: Record<string, unknown> = {};
            const rowCount = manifest.rowCount ?? record.rowCount ?? null;

            for (const column of columns) {
                const nameSql = columnSql(column);
                const statsReader = await connection.runAndReadAll(
                    `SELECT COUNT(*) AS total_count, COUNT(${nameSql}) AS non_null_count, COUNT(DISTINCT ${nameSql}) AS distinct_count FROM read_parquet(${quoteLiteral(parquetPath)})`,
                );
                const stats = (statsReader.getRowObjectsJson()[0] ?? {}) as Record<string, unknown>;
                columnProfiles[column.name] = {
                    name: column.name,
                    normalizedType: column.logicalType ?? 'unknown',
                    nullCount: Math.max(0, Number(stats.total_count ?? 0) - Number(stats.non_null_count ?? 0)),
                    nonNullCount: Number(stats.non_null_count ?? 0),
                    distinctCount: Number(stats.distinct_count ?? 0),
                    sampleValues: sampleRows.map(row => row[column.name]).filter(value => value != null).slice(0, 5),
                };
            }

            return {
                columns,
                stats: {
                    summary: {
                        kind: 'detail_table',
                        rowCount,
                        columnCount: columns.length,
                        limited: Boolean(record.limited),
                        limit: record.limit ?? null,
                    },
                    columns: columnProfiles,
                    sample: {
                        sampleStrategy: 'head',
                        sampleRowCount: sampleRows.length,
                        truncatedForAI: (rowCount ?? sampleRows.length) > sampleRows.length,
                    },
                },
                sampleRows,
            };
        });
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
        const parquetPath = path.join(tempDir, 'data.parquet');
        let instance: any = null;
        try {
            const record = await this.getRecord(organizationId, resultSetId);
            const artifactRef = record.artifactRefJson as ResultSetArtifactRef;
            const data = await this.artifacts.resultSets.openData(artifactRef);
            if (!data) throw new DatabaseError('Result set data is unavailable', 404);
            await pipeline(data, createWriteStream(parquetPath, { mode: 0o600 }));

            const { DuckDBInstance } = await import('@duckdb/node-api');
            instance = await DuckDBInstance.create(':memory:');
            const connection = await instance.connect();
            try {
                return await fn({ connection, parquetPath, tempDir });
            } finally {
                connection.closeSync();
            }
        } finally {
            instance?.closeSync();
            await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
        }
    }

    private exportObjectPath(organizationId: string, exportId: string, fileName: string) {
        return joinObjectPath('result-set-exports', organizationPathPart(organizationId), safeObjectPathPart(exportId), safeObjectPathPart(fileName));
    }

    private parseChartMetric(yKey: string, allowlist: Map<string, ResultSetColumn>) {
        if (yKey === 'count') {
            return { sql: 'COUNT(*)', label: 'Count' };
        }
        const [kind, rawColumn] = yKey.split(':');
        const column = getAllowedColumn(allowlist, rawColumn);
        if (!column) return { sql: 'COUNT(*)', label: 'Count' };
        const numeric = `TRY_CAST(${columnSql(column)} AS DOUBLE)`;
        if (kind === 'sum') return { sql: `SUM(${numeric})`, label: `Sum ${column.name}` };
        if (kind === 'avg') return { sql: `AVG(${numeric})`, label: `Avg ${column.name}` };
        if (kind === 'max') return { sql: `MAX(${numeric})`, label: `Max ${column.name}` };
        if (kind === 'min') return { sql: `MIN(${numeric})`, label: `Min ${column.name}` };
        if (kind === 'count_distinct') return { sql: `COUNT(DISTINCT ${columnSql(column)})`, label: `Distinct ${column.name}` };
        if (kind === 'count_true') return { sql: `SUM(CASE WHEN ${columnSql(column)} THEN 1 ELSE 0 END)`, label: `True ${column.name}` };
        return { sql: 'COUNT(*)', label: 'Count' };
    }

    private buildBasicProfile(params: { columns: ResultSetColumn[]; sampleRows: Record<string, unknown>[]; rowCount: number | null }): ResultSetProfileReadOutput {
        const columnProfiles: Record<string, unknown> = {};
        for (const column of params.columns) {
            const values = params.sampleRows.map(row => row[column.name]);
            const nonNullValues = values.filter(value => value != null);
            columnProfiles[column.name] = {
                name: column.name,
                normalizedType: column.logicalType ?? 'unknown',
                nullCount: values.length - nonNullValues.length,
                nonNullCount: nonNullValues.length,
                distinctCount: new Set(nonNullValues.map(value => String(value))).size,
                sampleValues: nonNullValues.slice(0, 5),
            };
        }
        return {
            columns: params.columns,
            stats: {
                summary: {
                    kind: 'detail_table',
                    rowCount: params.rowCount,
                    columnCount: params.columns.length,
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

    private async writeFullDataArtifact(input: { artifactId: string; status: string; columns: ResultSetManifest['schema']; rows: AsyncIterable<unknown> | unknown[] }) {
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

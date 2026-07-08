import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { and, eq } from 'drizzle-orm';

import { getDoryArtifactStore, type DoryArtifactStore } from '@dory/artifacts';
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
    columns: ResultSetColumn[];
    dataAvailability: ResultSetDataAvailability;
};

function quoteLiteral(value: string) {
    return `'${value.replace(/'/g, "''")}'`;
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

    async readRows(params: { organizationId: string; resultSetId: string; offset?: number | null; limit?: number | null }): Promise<ReadResultRowsOutput> {
        this.assertInited();

        const [record] = await this.db
            .select()
            .from(resultSetsTable)
            .where(and(eq(resultSetsTable.organizationId, params.organizationId), eq(resultSetsTable.id, params.resultSetId)))
            .limit(1);

        if (!record) throw new DatabaseError('Result set not found', 404);

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
                columns,
                dataAvailability,
            };
        }

        const tempDir = await mkdtemp(path.join(os.tmpdir(), `dory-resultset-${params.resultSetId}-`));
        const parquetPath = path.join(tempDir, 'data.parquet');
        let instance: any = null;
        try {
            const data = await this.artifacts.resultSets.openData(artifactRef);
            if (!data) throw new DatabaseError('Result set data is unavailable', 404);
            await pipeline(data, createWriteStream(parquetPath, { mode: 0o600 }));

            const { DuckDBInstance } = await import('@duckdb/node-api');
            instance = await DuckDBInstance.create(':memory:');
            const connection = await instance.connect();
            try {
                const reader = await connection.runAndReadAll(`SELECT * FROM read_parquet(${quoteLiteral(parquetPath)}) LIMIT ${limit} OFFSET ${offset}`);
                const rows = rowsBySchema(reader.getRowsJson() as unknown[][], columns);
                return {
                    resultSetId: params.resultSetId,
                    rows,
                    offset,
                    limit,
                    rowCount: manifest.rowCount ?? record.rowCount ?? null,
                    columns,
                    dataAvailability,
                };
            } finally {
                connection.closeSync();
            }
        } finally {
            instance?.closeSync();
            await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
        }
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

import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DuckDBInstance, type DuckDBAppender } from '@duckdb/node-api';

export type ResultSetLogicalType = 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'json' | 'binary' | 'unknown';

export type ResultSetColumn = {
    name: string;
    databaseType?: string;
    logicalType?: ResultSetLogicalType;
    nullable?: boolean;
    displayName?: string;
    description?: string;
};

export type ResultSetOperation = 'select' | 'insert' | 'update' | 'delete' | 'ddl' | 'unknown' | (string & {});
export type ResultSetStatus = 'success' | 'error' | 'canceled' | (string & {});
export type ResultSetSourceType = 'query-run' | 'derived' | 'imported' | 'manual';
export type ResultSetActorType = 'user' | 'agent' | 'mcp' | 'automation' | (string & {});
export type ResultSetDataAvailability = 'none' | 'preview-only' | 'full';

export type ResultSetArtifactRef = {
    store: 'filesystem' | 's3' | (string & {});
    artifactId: string;
    basePath: string;
    manifestPath: string;
    previewPath?: string;
    dataPath?: string;
    dataAvailability: ResultSetDataAvailability;
};

export type ResultSetFileManifest = {
    path: string;
    format: 'json' | 'parquet' | (string & {});
    rowCount?: number;
    byteSize?: number;
};

export type ResultSetManifest = {
    format: 'dory.resultset.v1';
    artifactId: string;
    organizationId: string;
    kind: 'sql-result-set';
    status: ResultSetStatus;
    source: {
        type: ResultSetSourceType;
        queryRunId?: string | null;
        connectionId?: string | null;
        workspaceId?: string | null;
        tabId?: string | null;
        workId?: string | null;
        agentRunId?: string | null;
        actorType?: ResultSetActorType | null;
        actorId?: string | null;
    };
    sql?: {
        text?: string | null;
        dialect?: string | null;
        operation?: ResultSetOperation | null;
    };
    error?: {
        message?: string | null;
        code?: string | null;
        sqlState?: string | null;
        meta?: unknown;
    };
    schema: ResultSetColumn[];
    rowCount?: number | null;
    previewRowCount: number;
    limited: boolean;
    limit?: number | null;
    files: {
        preview?: ResultSetFileManifest;
        data?: ResultSetFileManifest;
    };
    lineage?: {
        parentResultSetId?: string | null;
        previousResultSetId?: string | null;
        refreshOfResultSetId?: string | null;
        derivedFromResultSetId?: string | null;
    };
    createdAt: string;
    updatedAt: string;
    contentHash?: string | null;
};

export type ResultSetPreview = {
    columns: ResultSetColumn[];
    rows: Record<string, unknown>[];
    truncated: boolean;
    rowCount?: number | null;
    previewRowCount: number;
};

export type BuildResultSetPreviewInput = {
    columns: ResultSetColumn[];
    rows: unknown[];
    rowCount?: number | null;
    maxRows?: number;
    maxBytes?: number;
};

export type ResultSetDataWriterResult = {
    path: string;
    format: 'parquet';
    rowCount: number;
    byteSize?: number;
    data: Buffer;
};

export type ResultSetDataWriter = {
    write(input: { artifactId: string; schema: ResultSetColumn[]; rows: AsyncIterable<unknown> | unknown[]; target: unknown }): Promise<ResultSetDataWriterResult | null>;
};

export class NoopFullDataWriter implements ResultSetDataWriter {
    async write(): Promise<ResultSetDataWriterResult | null> {
        return null;
    }
}

type DuckDbColumnType = 'BOOLEAN' | 'BIGINT' | 'DOUBLE' | 'BLOB' | 'VARCHAR';

type NormalizedColumn = ResultSetColumn & {
    parquetName: string;
    duckDbType: DuckDbColumnType;
};

export class ParquetResultSetDataWriter implements ResultSetDataWriter {
    async write(input: { artifactId: string; schema: ResultSetColumn[]; rows: AsyncIterable<unknown> | unknown[]; target: unknown }): Promise<ResultSetDataWriterResult | null> {
        const rows = await collectRows(input.rows);
        const schema = input.schema.length ? input.schema : inferResultSetColumns(rows);
        if (!schema.length) return null;

        const normalizedRows = rows.map(row => normalizeRecord(row));
        const columns = normalizeParquetColumns(schema, normalizedRows);
        const tempDir = await mkdtemp(path.join(os.tmpdir(), `dory-${safeFilePart(input.artifactId)}-`));
        const outputPath = path.join(tempDir, 'data.parquet');

        let instance: DuckDBInstance | null = null;
        try {
            instance = await DuckDBInstance.create(':memory:');
            const connection = await instance.connect();
            try {
                await connection.run(`CREATE TABLE result_set (${columns.map(column => `${quoteIdentifier(column.parquetName)} ${column.duckDbType}`).join(', ')})`);
                if (normalizedRows.length) {
                    const appender = await connection.createAppender('result_set');
                    try {
                        for (const row of normalizedRows) {
                            for (const column of columns) appendValue(appender, column, row[column.name]);
                            appender.endRow();
                        }
                    } finally {
                        appender.closeSync();
                    }
                }
                await connection.run(`COPY result_set TO ${quoteLiteral(outputPath)} (FORMAT PARQUET)`);
            } finally {
                connection.closeSync();
            }

            const [data, info] = await Promise.all([readFile(outputPath), stat(outputPath)]);
            return {
                path: 'data.parquet',
                format: 'parquet',
                rowCount: normalizedRows.length,
                byteSize: info.size,
                data,
            };
        } finally {
            instance?.closeSync();
            await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
        }
    }
}

export function buildResultSetPreview(input: BuildResultSetPreviewInput): ResultSetPreview {
    const maxRows = input.maxRows ?? 200;
    const maxBytes = input.maxBytes ?? 2 * 1024 * 1024;
    const normalizedRows = input.rows.map(row => normalizeRow(row));
    const rows: Record<string, unknown>[] = [];

    for (const row of normalizedRows.slice(0, maxRows)) {
        const candidate = [...rows, row];
        if (Buffer.byteLength(JSON.stringify(candidate), 'utf8') > maxBytes) break;
        rows.push(row);
    }

    const totalRows = input.rowCount ?? normalizedRows.length;
    return {
        columns: input.columns,
        rows,
        truncated: rows.length < normalizedRows.length || (typeof totalRows === 'number' && rows.length < totalRows),
        rowCount: input.rowCount ?? normalizedRows.length,
        previewRowCount: rows.length,
    };
}

export function inferResultSetColumns(rows: unknown[], explicitColumns?: unknown): ResultSetColumn[] {
    if (Array.isArray(explicitColumns)) {
        return explicitColumns.map((column, index) => normalizeColumn(column, index)).filter((column): column is ResultSetColumn => Boolean(column));
    }

    const names = new Set<string>();
    for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
        for (const key of Object.keys(row)) names.add(key);
    }

    return [...names].map(name => ({ name, logicalType: 'unknown' }));
}

export function resultSetDataAvailability(manifest: ResultSetManifest): ResultSetDataAvailability {
    if (manifest.files.data) return 'full';
    if (manifest.files.preview) return 'preview-only';
    return 'none';
}

function normalizeColumn(column: unknown, index: number): ResultSetColumn | null {
    if (!column || typeof column !== 'object') return null;
    const value = column as Record<string, unknown>;
    const rawName = value.name ?? value.field ?? value.key ?? `column_${index + 1}`;
    if (typeof rawName !== 'string' || !rawName) return null;
    return {
        name: rawName,
        databaseType: typeof value.databaseType === 'string' ? value.databaseType : typeof value.type === 'string' ? value.type : undefined,
        logicalType: normalizeLogicalType(value.logicalType),
        nullable: typeof value.nullable === 'boolean' ? value.nullable : undefined,
        displayName: typeof value.displayName === 'string' ? value.displayName : undefined,
        description: typeof value.description === 'string' ? value.description : undefined,
    };
}

function normalizeLogicalType(value: unknown): ResultSetLogicalType | undefined {
    if (
        value === 'string' ||
        value === 'number' ||
        value === 'boolean' ||
        value === 'date' ||
        value === 'datetime' ||
        value === 'json' ||
        value === 'binary' ||
        value === 'unknown'
    ) {
        return value;
    }
    return undefined;
}

function normalizeRow(row: unknown): Record<string, unknown> {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return { value: toJsonSafeValue(row) };
    return Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([key, value]) => [key, toJsonSafeValue(value)]));
}

function normalizeRecord(row: unknown): Record<string, unknown> {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return { value: row };
    return row as Record<string, unknown>;
}

async function collectRows(rows: AsyncIterable<unknown> | unknown[]): Promise<unknown[]> {
    if (Array.isArray(rows)) return rows;
    const collected: unknown[] = [];
    for await (const row of rows) collected.push(row);
    return collected;
}

function normalizeParquetColumns(schema: ResultSetColumn[], rows: Record<string, unknown>[]): NormalizedColumn[] {
    const usedNames = new Set<string>();
    return schema.map((column, index) => {
        const parquetName = uniqueParquetName(column.name || `column_${index + 1}`, usedNames);
        return {
            ...column,
            parquetName,
            duckDbType: inferDuckDbType(
                column,
                rows.map(row => row[column.name]),
            ),
        };
    });
}

function uniqueParquetName(name: string, usedNames: Set<string>) {
    let candidate = name || 'column';
    let suffix = 2;
    while (usedNames.has(candidate)) {
        candidate = `${name}_${suffix}`;
        suffix += 1;
    }
    usedNames.add(candidate);
    return candidate;
}

function inferDuckDbType(column: ResultSetColumn, values: unknown[]): DuckDbColumnType {
    const nonNullValues = values.filter(value => value !== null && typeof value !== 'undefined');
    if (!nonNullValues.length) {
        if (column.logicalType === 'number') return isIntegerDatabaseType(column.databaseType) ? 'BIGINT' : 'DOUBLE';
        if (column.logicalType === 'boolean') return 'BOOLEAN';
        if (column.logicalType === 'binary') return 'BLOB';
        return 'VARCHAR';
    }

    if (column.logicalType === 'boolean' && nonNullValues.every(value => typeof value === 'boolean')) return 'BOOLEAN';
    if (column.logicalType === 'binary' && nonNullValues.every(isBinaryValue)) return 'BLOB';
    if (column.logicalType === 'number' || nonNullValues.every(value => typeof value === 'number' || typeof value === 'bigint')) {
        if (nonNullValues.every(isIntegerLike)) return 'BIGINT';
        if (nonNullValues.every(value => typeof value === 'number' && Number.isFinite(value))) return 'DOUBLE';
    }
    if (nonNullValues.every(value => typeof value === 'boolean')) return 'BOOLEAN';
    if (nonNullValues.every(isBinaryValue)) return 'BLOB';
    if (nonNullValues.every(isIntegerLike)) return 'BIGINT';
    if (nonNullValues.every(value => typeof value === 'number' && Number.isFinite(value))) return 'DOUBLE';
    return 'VARCHAR';
}

function appendValue(appender: DuckDBAppender, column: NormalizedColumn, value: unknown) {
    if (value === null || typeof value === 'undefined') {
        appender.appendNull();
        return;
    }

    switch (column.duckDbType) {
        case 'BOOLEAN':
            if (typeof value === 'boolean') appender.appendBoolean(value);
            else appender.appendNull();
            return;
        case 'BIGINT':
            if (typeof value === 'bigint') appender.appendBigInt(clampBigInt64(value));
            else if (typeof value === 'number' && Number.isFinite(value)) appender.appendBigInt(BigInt(Math.trunc(value)));
            else appender.appendNull();
            return;
        case 'DOUBLE':
            if (typeof value === 'number' && Number.isFinite(value)) appender.appendDouble(value);
            else appender.appendNull();
            return;
        case 'BLOB':
            if (isBinaryValue(value)) appender.appendBlob(toUint8Array(value));
            else appender.appendNull();
            return;
        case 'VARCHAR':
            appender.appendVarchar(toStableString(value));
            return;
    }
}

function toJsonSafeValue(value: unknown): unknown {
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
    if (isBinaryValue(value)) return Buffer.from(toUint8Array(value)).toString('base64');
    if (Array.isArray(value)) return value.map(item => toJsonSafeValue(item));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [key, toJsonSafeValue(nestedValue)]));
    }
    if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
    return value;
}

function toStableString(value: unknown) {
    if (typeof value === 'string') return value;
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
    if (isBinaryValue(value)) return Buffer.from(toUint8Array(value)).toString('base64');
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
        return JSON.stringify(toJsonSafeValue(value));
    } catch {
        return String(value);
    }
}

function isBinaryValue(value: unknown): value is Uint8Array {
    return value instanceof Uint8Array;
}

function toUint8Array(value: Uint8Array) {
    return value;
}

function isIntegerLike(value: unknown) {
    if (typeof value === 'bigint') return value >= MIN_INT64 && value <= MAX_INT64;
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= Number(MIN_INT64) && value <= Number(MAX_INT64);
}

function isIntegerDatabaseType(databaseType: string | undefined) {
    return Boolean(databaseType && /\b(bigint|int8|integer|int4|smallint|int2|tinyint|number\(38,0\))\b/i.test(databaseType));
}

const MIN_INT64 = BigInt('-9223372036854775808');
const MAX_INT64 = BigInt('9223372036854775807');

function clampBigInt64(value: bigint) {
    if (value < MIN_INT64) return MIN_INT64;
    if (value > MAX_INT64) return MAX_INT64;
    return value;
}

function quoteIdentifier(identifier: string) {
    return `"${identifier.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string) {
    return `'${value.replace(/'/g, "''")}'`;
}

function safeFilePart(value: string) {
    return value.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

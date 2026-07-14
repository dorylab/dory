import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

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

export type ResultSetFilePartManifest = {
    path: string;
    format: 'parquet';
    rowCount?: number;
    byteSize?: number;
};

export type ResultSetFileManifest = {
    path: string;
    format: 'json' | 'parquet' | (string & {});
    rowCount?: number;
    byteSize?: number;
    parts?: ResultSetFilePartManifest[];
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

export type ResultSetDataWriterPart = {
    path: string;
    format: 'parquet';
    rowCount: number;
    byteSize?: number;
    data: Buffer | Readable;
    cleanup?: () => Promise<void>;
};

export type ResultSetDataWriterResult = {
    format: 'parquet';
    rowCount: number;
    byteSize?: number;
    parts: ResultSetDataWriterPart[];
    cleanup?: () => Promise<void>;
};

export type ResultSetRowIterable = Iterable<unknown> | AsyncIterable<unknown>;

export type ResultSetDataWriter = {
    write(input: { artifactId: string; schema: ResultSetColumn[]; rows: ResultSetRowIterable; target: unknown }): Promise<ResultSetDataWriterResult | null>;
};

export class NoopFullDataWriter implements ResultSetDataWriter {
    async write(): Promise<ResultSetDataWriterResult | null> {
        return null;
    }
}

export type ResultSetFullDataMode = 'auto' | 'parquet' | 'disabled';

const DEFAULT_DUCKDB_MEMORY_LIMIT = '1024MB';
const DEFAULT_DUCKDB_THREADS = 2;
const DEFAULT_PARQUET_PART_ROWS = 50_000;

export function createDefaultResultSetDataWriter(env: Record<string, string | undefined> = process.env): ResultSetDataWriter {
    const mode = normalizeFullDataMode(env.DORY_RESULTSET_FULL_DATA ?? env.DORY_RESULTSET_FULL_DATA_MODE);
    if (mode === 'disabled') return new NoopFullDataWriter();
    if (mode === 'parquet') return new ParquetResultSetDataWriter();
    if (isVercelRuntime(env)) return new NoopFullDataWriter();
    return new ParquetResultSetDataWriter();
}

type DuckDbColumnType = 'BOOLEAN' | 'BIGINT' | 'DOUBLE' | 'BLOB' | 'VARCHAR';

type NormalizedColumn = ResultSetColumn & {
    parquetName: string;
    duckDbType: DuckDbColumnType;
};

type DuckDBAppenderLike = {
    appendNull(): void;
    appendBoolean(value: boolean): void;
    appendBigInt(value: bigint): void;
    appendDouble(value: number): void;
    appendBlob(value: Uint8Array): void;
    appendVarchar(value: string): void;
    endRow(): void;
    closeSync(): void;
};

type DuckDBConnectionLike = {
    run(sql: string): Promise<unknown>;
    createAppender(table: string): Promise<DuckDBAppenderLike>;
    closeSync(): void;
};

type DuckDBInstanceLike = {
    connect(): Promise<DuckDBConnectionLike>;
    closeSync(): void;
};

export async function configureResultSetDuckDb(
    connection: Pick<DuckDBConnectionLike, 'run'>,
    tempDirectory: string,
    env: Record<string, string | undefined> = process.env,
) {
    await mkdir(tempDirectory, { recursive: true });
    await connection.run(`SET temp_directory = ${quoteLiteral(tempDirectory)}`);
    await connection.run(`SET memory_limit = ${quoteLiteral(normalizeDuckDbMemoryLimit(env.DORY_RESULTSET_DUCKDB_MEMORY_LIMIT))}`);
    await connection.run(`SET threads = ${normalizeDuckDbThreads(env.DORY_RESULTSET_DUCKDB_THREADS)}`);
}

export class ParquetResultSetDataWriter implements ResultSetDataWriter {
    async write(input: { artifactId: string; schema: ResultSetColumn[]; rows: ResultSetRowIterable; target: unknown }): Promise<ResultSetDataWriterResult | null> {
        const preparedRows = await prepareRowsForParquet(input.rows, input.schema);
        const schema = input.schema.length ? input.schema : inferResultSetColumns(preparedRows.sampleRows);
        if (!schema.length) return null;

        const columns = normalizeParquetColumns(schema, preparedRows.sampleRows.map(row => normalizeRecord(row)));
        const tempDir = await mkdtemp(path.join(os.tmpdir(), `dory-${safeFilePart(input.artifactId)}-`));
        const dataDir = path.join(tempDir, 'data');
        const partRows = normalizeParquetPartRows(process.env.DORY_RESULTSET_PARQUET_PART_ROWS);
        const parts: ResultSetDataWriterPart[] = [];

        let instance: DuckDBInstanceLike | null = null;
        let keepTempDir = false;
        try {
            const { DuckDBInstance } = await import('@duckdb/node-api');
            instance = await DuckDBInstance.create(path.join(tempDir, 'writer.duckdb'));
            const connection = await instance.connect();
            try {
                await configureResultSetDuckDb(connection, path.join(tempDir, 'duckdb-tmp'));
                let rowCount = 0;
                let byteSize = 0;
                let chunk: unknown[] = [];

                const flushChunk = async () => {
                    const part = await writeParquetPart({
                        connection,
                        columns,
                        rows: chunk,
                        outputDir: dataDir,
                        partIndex: parts.length,
                    });
                    parts.push(part);
                    rowCount += part.rowCount;
                    byteSize += part.byteSize ?? 0;
                    chunk = [];
                };

                const pushRow = async (row: unknown) => {
                    chunk.push(row);
                    if (chunk.length >= partRows) await flushChunk();
                };

                for (const row of preparedRows.sampleRows) await pushRow(row);
                if (isAsyncIterable(preparedRows.remainingRows)) {
                    for await (const row of preparedRows.remainingRows) await pushRow(row);
                } else {
                    for (const row of preparedRows.remainingRows) await pushRow(row);
                }

                if (chunk.length || parts.length === 0) await flushChunk();
                keepTempDir = true;
                return {
                    format: 'parquet',
                    rowCount,
                    byteSize,
                    parts,
                    cleanup: () => rm(tempDir, { recursive: true, force: true }).catch(() => undefined),
                };
            } finally {
                connection.closeSync();
            }
        } finally {
            instance?.closeSync();
            if (!keepTempDir) {
                await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
            }
        }
    }
}

async function writeParquetPart(input: {
    connection: DuckDBConnectionLike;
    columns: NormalizedColumn[];
    rows: unknown[];
    outputDir: string;
    partIndex: number;
}): Promise<ResultSetDataWriterPart> {
    await mkdir(input.outputDir, { recursive: true });
    const partName = `part-${String(input.partIndex).padStart(5, '0')}.parquet`;
    const relativePath = path.posix.join('data', partName);
    const outputPath = path.join(input.outputDir, partName);
    const tableName = `result_set_part_${input.partIndex}`;

    await input.connection.run(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);
    await input.connection.run(`CREATE TABLE ${quoteIdentifier(tableName)} (${input.columns.map(column => `${quoteIdentifier(column.parquetName)} ${column.duckDbType}`).join(', ')})`);
    const appender = await input.connection.createAppender(tableName);
    try {
        for (const row of input.rows) appendRow(appender, input.columns, row);
    } finally {
        appender.closeSync();
    }
    await input.connection.run(`COPY ${quoteIdentifier(tableName)} TO ${quoteLiteral(outputPath)} (FORMAT PARQUET)`);
    await input.connection.run(`DROP TABLE ${quoteIdentifier(tableName)}`);
    const info = await stat(outputPath);
    return {
        path: relativePath,
        format: 'parquet',
        rowCount: input.rows.length,
        byteSize: info.size,
        data: createLazyReadStream(outputPath),
        cleanup: async () => undefined,
    };
}

function createLazyReadStream(filePath: string): Readable {
    let source: Readable | null = null;
    const stream = new Readable({
        read() {
            if (source) {
                source.resume();
                return;
            }

            source = createReadStream(filePath);
            source.on('data', chunk => {
                if (!stream.push(chunk)) source?.pause();
            });
            source.on('end', () => stream.push(null));
            source.on('error', error => stream.destroy(error));
        },
        destroy(error, callback) {
            source?.destroy();
            callback(error);
        },
    });
    return stream;
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

async function prepareRowsForParquet(rows: ResultSetRowIterable, schema: ResultSetColumn[]) {
    if (Array.isArray(rows)) {
        return {
            sampleRows: schema.length ? rows.slice(0, 200) : rows,
            remainingRows: rowsFromArray(schema.length ? rows.slice(200) : []),
        };
    }

    if (isAsyncIterable(rows)) {
        const iterator = rows[Symbol.asyncIterator]();
        const sampleRows: unknown[] = [];
        const sampleLimit = schema.length ? 0 : 200;
        while (sampleRows.length < sampleLimit) {
            const next = await iterator.next();
            if (next.done) break;
            sampleRows.push(next.value);
        }

        return {
            sampleRows,
            remainingRows: asyncRowsFromIterator(iterator),
        };
    }

    const iterator = rows[Symbol.iterator]();
    const sampleRows: unknown[] = [];
    const sampleLimit = schema.length ? 0 : 200;
    while (sampleRows.length < sampleLimit) {
        const next = iterator.next();
        if (next.done) break;
        sampleRows.push(next.value);
    }

    return {
        sampleRows,
        remainingRows: rowsFromIterator(iterator),
    };
}

function* rowsFromArray(rows: unknown[]) {
    for (const row of rows) yield row;
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

function isAsyncIterable(value: ResultSetRowIterable): value is AsyncIterable<unknown> {
    return typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function';
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

function appendValue(appender: DuckDBAppenderLike, column: NormalizedColumn, value: unknown) {
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

function appendRow(appender: DuckDBAppenderLike, columns: NormalizedColumn[], row: unknown) {
    const normalizedRow = normalizeRecord(row);
    for (const column of columns) appendValue(appender, column, normalizedRow[column.name]);
    appender.endRow();
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

function normalizeDuckDbMemoryLimit(value: string | undefined) {
    const normalized = value?.trim();
    if (normalized && /^\d+(?:\.\d+)?\s*(?:B|KB|MB|GB|TB|KIB|MIB|GIB|TIB)$/i.test(normalized)) {
        return normalized.replace(/\s+/g, '');
    }
    return DEFAULT_DUCKDB_MEMORY_LIMIT;
}

function normalizeDuckDbThreads(value: string | undefined) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 1) {
        return Math.floor(parsed);
    }
    return DEFAULT_DUCKDB_THREADS;
}

function normalizeParquetPartRows(value: string | undefined) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 1) {
        return Math.floor(parsed);
    }
    return DEFAULT_PARQUET_PART_ROWS;
}

function safeFilePart(value: string) {
    return value.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

function normalizeFullDataMode(value: string | undefined): ResultSetFullDataMode {
    const normalized = value?.trim().toLowerCase();
    if (normalized === 'parquet' || normalized === 'full' || normalized === 'enabled' || normalized === 'true' || normalized === '1') return 'parquet';
    if (normalized === 'disabled' || normalized === 'preview-only' || normalized === 'none' || normalized === 'false' || normalized === '0') return 'disabled';
    return 'auto';
}

function isVercelRuntime(env: Record<string, string | undefined>) {
    return Boolean(env.VERCEL || env.NEXT_RUNTIME === 'edge' || env.NEXT_RUNTIME === 'nodejs-vercel');
}

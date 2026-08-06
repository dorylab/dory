import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import pl from 'nodejs-polars';

import { writeDataStreamToArrowIpcFile, type DataStream } from '@dory/data-plane';

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
export type ResultSetKind = 'sql-result-set' | 'schema-diff';
export type ResultSetSourceType = 'query-run' | 'comparison' | 'derived' | 'imported' | 'manual';
export type ResultSetActorType = 'user' | 'agent' | 'mcp' | 'automation' | (string & {});
export type ResultSetDataAvailability = 'none' | 'preview-only' | 'full';

export type ResultSetArtifactRef = {
    store: 'filesystem' | 's3' | (string & {});
    artifactId: string;
    basePath: string;
    manifestPath: string;
    schemaPath?: string;
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
    format: 'arrow' | 'json' | 'parquet' | (string & {});
    rowCount?: number;
    byteSize?: number;
    parts?: ResultSetFilePartManifest[];
};

export type ResultSetManifest = {
    format: 'dory.resultset.v1' | 'dory.resultset.v2';
    artifactId: string;
    organizationId: string;
    kind: ResultSetKind;
    status: ResultSetStatus;
    source: {
        type: ResultSetSourceType;
        queryRunId?: string | null;
        connectionId?: string | null;
        connectionType?: string | null;
        databaseName?: string | null;
        workspaceId?: string | null;
        tabId?: string | null;
        workId?: string | null;
        agentRunId?: string | null;
        comparisonId?: string | null;
        comparisonRunId?: string | null;
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
    batchCount?: number | null;
    rowCount?: number | null;
    byteSize?: number | null;
    previewRowCount: number;
    limited: boolean;
    limit?: number | null;
    files: {
        schema?: ResultSetFileManifest;
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
    batchCount: number;
    byteSize?: number;
    parts: ResultSetDataWriterPart[];
    cleanup?: () => Promise<void>;
};

export type ResultSetDataWriter = {
    write(input: { artifactId: string; dataStream: DataStream; target: unknown }): Promise<ResultSetDataWriterResult | null>;
};

export class NoopFullDataWriter implements ResultSetDataWriter {
    async write(input: { dataStream: DataStream }): Promise<ResultSetDataWriterResult | null> {
        try {
            for await (const batch of input.dataStream.batches()) void batch;
        } finally {
            await input.dataStream.close();
        }
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

type DuckDBConnectionLike = {
    run(sql: string): Promise<unknown>;
};

export async function configureResultSetDuckDb(connection: Pick<DuckDBConnectionLike, 'run'>, tempDirectory: string, env: Record<string, string | undefined> = process.env) {
    await mkdir(tempDirectory, { recursive: true });
    await connection.run(`SET temp_directory = ${quoteLiteral(tempDirectory)}`);
    await connection.run(`SET memory_limit = ${quoteLiteral(normalizeDuckDbMemoryLimit(env.DORY_RESULTSET_DUCKDB_MEMORY_LIMIT))}`);
    await connection.run(`SET threads = ${normalizeDuckDbThreads(env.DORY_RESULTSET_DUCKDB_THREADS)}`);
}

export class ParquetResultSetDataWriter implements ResultSetDataWriter {
    async write(input: { artifactId: string; dataStream: DataStream; target: unknown }): Promise<ResultSetDataWriterResult | null> {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), `dory-${safeFilePart(input.artifactId)}-`));
        const arrowPath = path.join(/* turbopackIgnore: true */ tempDir, 'data.arrow');
        const dataDir = path.join(/* turbopackIgnore: true */ tempDir, 'data');
        const partRows = normalizeParquetPartRows(process.env.DORY_RESULTSET_PARQUET_PART_ROWS);
        const parts: ResultSetDataWriterPart[] = [];

        let keepTempDir = false;
        try {
            const writeResult = await writeDataStreamToArrowIpcFile(input.dataStream, arrowPath);
            if (!input.dataStream.schema.fields.length) return null;

            await mkdir(dataDir, { recursive: true });
            let byteSize = 0;
            const offsets = writeResult.rowCount === 0 ? [0] : Array.from({ length: Math.ceil(writeResult.rowCount / partRows) }, (_, index) => index * partRows);
            for (const offset of offsets) {
                const rowCount = Math.min(partRows, writeResult.rowCount - offset);
                const partName = `part-${String(parts.length).padStart(5, '0')}.parquet`;
                const relativePath = path.posix.join('data', partName);
                const outputPath = path.join(dataDir, partName);
                await pl
                    .scanIPC(arrowPath, { rechunk: false })
                    .slice(offset, rowCount)
                    .sinkParquet(outputPath, { compression: 'zstd', rowGroupSize: Math.min(rowCount, 128_000), maintainOrder: true })
                    .collect({ streaming: true });
                const info = await stat(outputPath);
                byteSize += info.size;
                parts.push({
                    path: relativePath,
                    format: 'parquet',
                    rowCount,
                    byteSize: info.size,
                    data: createLazyReadStream(outputPath),
                    cleanup: async () => undefined,
                });
            }
            keepTempDir = true;
            return {
                format: 'parquet',
                rowCount: writeResult.rowCount,
                batchCount: writeResult.batchCount,
                byteSize,
                parts,
                cleanup: () => rm(tempDir, { recursive: true, force: true }).catch(() => undefined),
            };
        } finally {
            if (!keepTempDir) {
                await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
            }
        }
    }
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

function isBinaryValue(value: unknown): value is Uint8Array {
    return value instanceof Uint8Array;
}

function toUint8Array(value: Uint8Array) {
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

import { createReadStream } from 'node:fs';
import { mkdir, open, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

import { ArrowIpcFileDataset } from '@dory/dataset';
import pl, { type DataType, type LazyDataFrame } from 'nodejs-polars';

import { analyzeCsv, profileDataset } from './csv-analyzer';
import { transcodeCsvToUtf8 } from './csv-detection';
import { SOURCE_ROW_NUMBER_COLUMN, type ImportSourceAnalysisResult, type ImportSourceFormat, type ImportSourceOptions, type ImportSourceWarning } from './types';

export type AnalyzeImportSourceInput = {
    sourcePath: string;
    sourceName: string;
    sourceHash: string;
    outputArrowPath: string;
    source: ImportSourceOptions;
    maxOutputBytes?: number;
    signal?: AbortSignal;
};

export interface ImportSourceReader {
    readonly format: ImportSourceFormat;
    readonly extensions: readonly string[];
    analyze(input: AnalyzeImportSourceInput): Promise<ImportSourceAnalysisResult>;
}

export class ImportSourceError extends Error {
    constructor(
        readonly code:
            | 'IMPORT_SOURCE_FORMAT_MISMATCH'
            | 'IMPORT_SOURCE_SCHEMA_UNSUPPORTED'
            | 'IMPORT_NDJSON_NESTED_VALUE'
            | 'IMPORT_NDJSON_INVALID'
            | 'IMPORT_MATERIALIZED_FILE_TOO_LARGE',
        message: string,
        readonly details?: unknown,
    ) {
        super(message);
        this.name = 'ImportSourceError';
    }
}

const csvReader: ImportSourceReader = {
    format: 'csv',
    extensions: ['csv', 'tsv'],
    async analyze(input) {
        if (input.source.format !== 'csv') throw new Error('CSV reader received non-CSV options');
        throwIfAborted(input.signal);
        const utf8Path =
            input.source.encoding === 'utf8'
                ? input.sourcePath
                : await transcodeCsvToUtf8(input.sourcePath, path.join(path.dirname(input.outputArrowPath), 'source.utf8.csv'), input.source.encoding);
        const schemaFrame = await pl
            .scanCSV(utf8Path, {
                hasHeader: input.source.hasHeader,
                sep: input.source.delimiter,
                quoteChar: input.source.quoteChar,
                encoding: 'utf8',
                inferSchemaLength: 0,
                ignoreErrors: false,
                raiseIfEmpty: true,
            })
            .head(0)
            .collect({ streaming: true });
        assertColumnNames(Object.keys(schemaFrame.schema));
        const result = await analyzeCsv({
            sourcePath: utf8Path,
            sourceName: input.sourceName,
            sourceHash: input.sourceHash,
            outputArrowPath: input.outputArrowPath,
            parsing: input.source,
        });
        throwIfAborted(input.signal);
        await enforceOutputLimit(input.outputArrowPath, input.maxOutputBytes);
        return {
            dataset: result.dataset,
            profile: result.profile,
            source: input.source,
            sourceWarnings: [],
            sourceSchema: result.dataset.schema.fields
                .filter(field => field.name !== SOURCE_ROW_NUMBER_COLUMN)
                .map(field => ({
                    name: field.name,
                    sourceType: field.type.toString(),
                    importType: result.profile.columns.find(column => column.name === field.name)?.detectedType ?? 'string',
                })),
            sourceArrowPath: result.sourceArrowPath,
        };
    },
};

const parquetReader = lazyReader('parquet', ['parquet'], async sourcePath => {
    await validateMagic(sourcePath, Buffer.from('PAR1'), Buffer.from('PAR1'));
    return pl.scanParquet(sourcePath, { lowMemory: true, rechunk: false, useStatistics: true });
});

const ndjsonReader = lazyReader('ndjson', ['ndjson', 'jsonl'], async (sourcePath, signal) => {
    await validateNdjson(sourcePath, signal);
    return pl.scanJson(sourcePath, { inferSchemaLength: null, ignoreErrors: false, lowMemory: true, rechunk: false });
});

const arrowReader = lazyReader('arrow', ['arrow', 'ipc', 'feather'], async sourcePath => {
    await validateMagic(sourcePath, Buffer.from('ARROW1'), Buffer.from('ARROW1'));
    const sourceDataset = await ArrowIpcFileDataset.open({ filePath: sourcePath, metadata: { source: sourcePath } });
    assertColumnNames(sourceDataset.schema.fields.map(field => field.name));
    return pl.scanIPC(sourcePath, { rechunk: false });
});

const READERS: readonly ImportSourceReader[] = [csvReader, parquetReader, ndjsonReader, arrowReader];

export function getImportSourceReader(format: ImportSourceFormat): ImportSourceReader {
    const reader = READERS.find(candidate => candidate.format === format);
    if (!reader) throw new Error(`No import source reader is registered for ${format}`);
    return reader;
}

export function importSourceFormatForExtension(extension: string): ImportSourceFormat | null {
    const normalized = extension.toLowerCase().replace(/^\./, '');
    return READERS.find(reader => reader.extensions.includes(normalized))?.format ?? null;
}

export function supportedImportSourceExtensions(): string[] {
    return READERS.flatMap(reader => [...reader.extensions]);
}

export async function analyzeImportSourceFile(input: AnalyzeImportSourceInput): Promise<ImportSourceAnalysisResult> {
    return getImportSourceReader(input.source.format).analyze(input);
}

function lazyReader(
    format: Exclude<ImportSourceFormat, 'csv'>,
    extensions: readonly string[],
    scan: (sourcePath: string, signal?: AbortSignal) => Promise<LazyDataFrame>,
): ImportSourceReader {
    return {
        format,
        extensions,
        async analyze(input) {
            if (input.source.format !== format) throw new Error(`${format} reader received ${input.source.format} options`);
            throwIfAborted(input.signal);
            await mkdir(path.dirname(input.outputArrowPath), { recursive: true });
            const lazy = await scan(input.sourcePath, input.signal);
            throwIfAborted(input.signal);
            const schemaFrame = await lazy.clone().head(0).collect({ streaming: true });
            const names = Object.keys(schemaFrame.schema);
            assertColumnNames(names);
            const { expressions, warnings, sourceSchema } = normalizedExpressions(schemaFrame.schema);
            try {
                await lazy
                    .select(expressions)
                    .withRowIndex(SOURCE_ROW_NUMBER_COLUMN, 1)
                    .sinkIpc(input.outputArrowPath, { compression: 'uncompressed', maintainOrder: true, mkdir: true })
                    .collect({ streaming: true });
                throwIfAborted(input.signal);
            } catch (error) {
                await unlink(input.outputArrowPath).catch(() => undefined);
                throw normalizePolarsError(error, schemaFrame.schema);
            }
            await enforceOutputLimit(input.outputArrowPath, input.maxOutputBytes);
            const dataset = await ArrowIpcFileDataset.open({
                filePath: input.outputArrowPath,
                metadata: {
                    source: input.sourceName,
                    sourceHash: input.sourceHash,
                    artifactPath: input.outputArrowPath,
                    sourceOptions: input.source,
                    sourceWarnings: warnings,
                },
            });
            const profile = await profileDataset(dataset);
            throwIfAborted(input.signal);
            const profiledDataset = await ArrowIpcFileDataset.open({
                filePath: input.outputArrowPath,
                rowCount: profile.rows,
                metadata: dataset.metadata,
            });
            return { dataset: profiledDataset, profile, source: input.source, sourceWarnings: warnings, sourceSchema, sourceArrowPath: input.outputArrowPath };
        },
    };
}

function normalizedExpressions(schema: Record<string, DataType>) {
    const expressions: Array<ReturnType<typeof pl.col>> = [];
    const warnings: ImportSourceWarning[] = [];
    const sourceSchema: ImportSourceAnalysisResult['sourceSchema'] = [];
    for (const [name, dataType] of Object.entries(schema)) {
        const sourceType = String(dataType);
        const column = pl.col(name);
        let target: DataType;
        let importType: ImportSourceAnalysisResult['sourceSchema'][number]['importType'];
        if (/\b(?:String|Utf8|Categorical|Enum)\b/i.test(sourceType)) [target, importType] = [pl.String, 'string'];
        else if (/\bBool\b/i.test(sourceType)) [target, importType] = [pl.Bool, 'boolean'];
        else if (/\bU?Int(?:8|16|32|64)\b/i.test(sourceType)) [target, importType] = [pl.Int64, 'int64'];
        else if (/\bFloat(?:32|64)\b/i.test(sourceType)) [target, importType] = [pl.Float64, 'float64'];
        else if (/\bDate\b/i.test(sourceType) && !/Datetime/i.test(sourceType)) [target, importType] = [pl.Date, 'date'];
        else if (/Datetime/i.test(sourceType)) [target, importType] = [pl.Datetime('ms', 'UTC'), 'datetime'];
        else if (/Decimal/i.test(sourceType)) {
            target = pl.String;
            importType = 'string';
            warnings.push({ code: 'DECIMAL_STRINGIFIED', column: name, sourceType });
        } else if (/\bNull\b/i.test(sourceType)) [target, importType] = [pl.String, 'string'];
        else throw unsupportedColumn(name, sourceType);
        expressions.push(column.cast(target, true).alias(name));
        sourceSchema.push({ name, sourceType, importType });
    }
    return { expressions, warnings, sourceSchema };
}

function assertColumnNames(names: string[]) {
    if (names.length === 0) throw new ImportSourceError('IMPORT_SOURCE_SCHEMA_UNSUPPORTED', 'The source does not contain any columns');
    const seen = new Set<string>();
    for (const name of names) {
        if (!name) throw new ImportSourceError('IMPORT_SOURCE_SCHEMA_UNSUPPORTED', 'Source column names cannot be empty');
        if (name === SOURCE_ROW_NUMBER_COLUMN) {
            throw new ImportSourceError('IMPORT_SOURCE_SCHEMA_UNSUPPORTED', `The source contains the reserved column ${SOURCE_ROW_NUMBER_COLUMN}`, { column: name });
        }
        if (seen.has(name)) throw new ImportSourceError('IMPORT_SOURCE_SCHEMA_UNSUPPORTED', `The source contains duplicate column ${name}`, { column: name });
        seen.add(name);
    }
}

async function validateMagic(filePath: string, prefix: Buffer, suffix: Buffer) {
    const file = await open(filePath, 'r');
    try {
        const info = await file.stat();
        if (info.size < prefix.length + suffix.length) throw new ImportSourceError('IMPORT_SOURCE_FORMAT_MISMATCH', 'The source file is truncated or has the wrong format');
        const start = Buffer.alloc(prefix.length);
        const end = Buffer.alloc(suffix.length);
        await file.read(start, 0, start.length, 0);
        await file.read(end, 0, end.length, info.size - end.length);
        if (!start.equals(prefix) || !end.equals(suffix)) throw new ImportSourceError('IMPORT_SOURCE_FORMAT_MISMATCH', 'The source content does not match its file extension');
    } finally {
        await file.close();
    }
}

async function validateNdjson(filePath: string, signal?: AbortSignal) {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let carry = '';
    let rows = 0;
    const columnKinds = new Map<string, 'string' | 'boolean' | 'integer' | 'float'>();
    try {
        for await (const chunk of createReadStream(filePath)) {
            throwIfAborted(signal);
            carry += decoder.decode(chunk, { stream: true });
            const lines = carry.split(/\r?\n/);
            carry = lines.pop() ?? '';
            for (const line of lines) rows += validateNdjsonLine(line, rows + 1, columnKinds);
        }
        carry += decoder.decode();
        rows += validateNdjsonLine(carry, rows + 1, columnKinds);
    } catch (error) {
        if (error instanceof ImportSourceError) throw error;
        if (error instanceof Error && error.name === 'AbortError') throw error;
        throw new ImportSourceError('IMPORT_NDJSON_INVALID', 'NDJSON must be valid UTF-8 with one JSON object per line', {
            message: error instanceof Error ? error.message : String(error),
        });
    }
    if (rows === 0) throw new ImportSourceError('IMPORT_NDJSON_INVALID', 'The NDJSON source does not contain any objects');
}

function validateNdjsonLine(line: string, lineNumber: number, columnKinds: Map<string, 'string' | 'boolean' | 'integer' | 'float'>) {
    const content = lineNumber === 1 ? line.replace(/^\uFEFF/, '') : line;
    if (!content.trim()) return 0;
    let value: unknown;
    try {
        value = JSON.parse(content);
    } catch (error) {
        throw new ImportSourceError('IMPORT_NDJSON_INVALID', `Invalid JSON on line ${lineNumber}`, {
            line: lineNumber,
            message: error instanceof Error ? error.message : String(error),
        });
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new ImportSourceError('IMPORT_NDJSON_INVALID', `Line ${lineNumber} must contain a JSON object`, { line: lineNumber });
    }
    for (const [column, cell] of Object.entries(value)) {
        if (column === SOURCE_ROW_NUMBER_COLUMN) {
            throw new ImportSourceError('IMPORT_SOURCE_SCHEMA_UNSUPPORTED', `The source contains the reserved column ${SOURCE_ROW_NUMBER_COLUMN}`, { column });
        }
        if (cell === null) continue;
        if (typeof cell === 'object') {
            throw new ImportSourceError('IMPORT_NDJSON_NESTED_VALUE', `Nested JSON is not supported at line ${lineNumber}, column ${column}`, { line: lineNumber, column });
        }
        const kind = typeof cell === 'number' ? (Number.isInteger(cell) ? 'integer' : 'float') : typeof cell;
        if (kind !== 'string' && kind !== 'boolean' && kind !== 'integer' && kind !== 'float') {
            throw unsupportedColumn(column, kind);
        }
        const previous = columnKinds.get(column);
        if (!previous) columnKinds.set(column, kind);
        else if (previous !== kind) {
            if ((previous === 'integer' || previous === 'float') && (kind === 'integer' || kind === 'float')) columnKinds.set(column, 'float');
            else throw new ImportSourceError('IMPORT_SOURCE_SCHEMA_UNSUPPORTED', `Column ${column} contains incompatible scalar types`, { column, sourceTypes: [previous, kind] });
        }
    }
    return 1;
}

function unsupportedColumn(column: string, sourceType: string) {
    return new ImportSourceError('IMPORT_SOURCE_SCHEMA_UNSUPPORTED', `Column ${column} uses unsupported source type ${sourceType}`, { column, sourceType });
}

function normalizePolarsError(error: unknown, schema: Record<string, DataType>) {
    if (error instanceof ImportSourceError) return error;
    if (error instanceof Error && error.name === 'AbortError') return error;
    const risky = Object.entries(schema).find(([, type]) => /UInt64/i.test(String(type)));
    return new ImportSourceError('IMPORT_SOURCE_SCHEMA_UNSUPPORTED', error instanceof Error ? error.message : String(error), {
        ...(risky ? { column: risky[0], sourceType: String(risky[1]) } : {}),
    });
}

async function enforceOutputLimit(outputPath: string, maxOutputBytes?: number) {
    if (!maxOutputBytes) return;
    const bytes = (await stat(outputPath)).size;
    if (bytes <= maxOutputBytes) return;
    await unlink(outputPath).catch(() => undefined);
    throw new ImportSourceError('IMPORT_MATERIALIZED_FILE_TOO_LARGE', 'The normalized Arrow dataset exceeds the configured size limit', { bytes, maxBytes: maxOutputBytes });
}

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException('The import analysis was canceled', 'AbortError');
}

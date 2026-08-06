import {
    Binary,
    Bool,
    DataType,
    DateDay,
    Decimal,
    Field,
    Float64,
    Int64,
    Schema,
    Table,
    TimeMillisecond,
    TimestampMillisecond,
    Uint64,
    Utf8,
    vectorFromArray,
    type RecordBatch,
} from 'apache-arrow';

import { dataStreamAbortError, normalizeBatchBytes, normalizeBatchRows, onceAsync } from './lifecycle';
import type { DataColumn, DataOpenOptions, DataRows, DataStream, DataStreamMetadata } from './types';

const DISPLAY_NAME_METADATA = 'dory.displayName';
const DATABASE_TYPE_METADATA = 'dory.databaseType';
const LOGICAL_TYPE_METADATA = 'dory.logicalType';

export type RowDataStreamOptions = DataOpenOptions & {
    columns: DataColumn[];
    rows: DataRows;
    metadata: DataStreamMetadata;
    rowCount?: number | null;
    close?: () => Promise<void> | void;
};

export function createDataSchema(columns: DataColumn[]): Schema {
    const usedNames = new Set<string>();
    return new Schema(
        columns.map((column, index) => {
            const displayName = column.name || `column_${index + 1}`;
            const name = uniqueColumnName(displayName, usedNames);
            const mapped = arrowTypeFor(column.type);
            return new Field(
                name,
                mapped.type,
                column.nullable ?? true,
                new Map([
                    [DISPLAY_NAME_METADATA, displayName],
                    [DATABASE_TYPE_METADATA, column.type ?? 'unknown'],
                    [LOGICAL_TYPE_METADATA, mapped.logicalType],
                    ...Object.entries(column.metadata ?? {}),
                ]),
            );
        }),
    );
}

export function rowDataStream(options: RowDataStreamOptions): DataStream {
    const schema = createDataSchema(options.columns);
    const batchRows = normalizeBatchRows(options.batchRows);
    const batchBytes = normalizeBatchBytes(options.batchBytes);
    const close = onceAsync(async () => {
        options.signal?.removeEventListener('abort', onAbort);
        await options.close?.();
    });
    const onAbort = () => void close();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    let consumed = false;

    return {
        schema,
        metadata: Object.freeze({ ...options.metadata }),
        rowCount: options.rowCount,
        batches: () => {
            if (consumed) throw new Error('DATA_STREAM_ALREADY_CONSUMED');
            if (options.signal?.aborted) throw dataStreamAbortError();
            consumed = true;
            return batchesFromRows(options.rows, schema, batchRows, batchBytes, options.signal, close);
        },
        close,
    };
}

async function* batchesFromRows(
    rows: DataRows,
    schema: Schema,
    batchRows: number,
    batchBytes: number,
    signal: AbortSignal | undefined,
    close: () => Promise<void>,
): AsyncIterable<RecordBatch> {
    let pending: unknown[] = [];
    let pendingBytes = 0;
    try {
        for await (const row of rows) {
            if (signal?.aborted) throw dataStreamAbortError();
            pending.push(row);
            pendingBytes += estimateRowBytes(row);
            if (pending.length >= batchRows || pendingBytes >= batchBytes) {
                yield recordBatchFromRows(schema, pending);
                pending = [];
                pendingBytes = 0;
            }
        }
        if (pending.length > 0) yield recordBatchFromRows(schema, pending);
    } finally {
        await close();
    }
}

export function recordBatchFromRows(schema: Schema, rows: unknown[]): RecordBatch {
    const vectors: Record<string, ReturnType<typeof vectorFromArray>> = {};
    for (let columnIndex = 0; columnIndex < schema.fields.length; columnIndex += 1) {
        const field = schema.fields[columnIndex]!;
        const displayName = field.metadata.get(DISPLAY_NAME_METADATA) ?? field.name;
        const values = rows.map(row => normalizeArrowValue(valueAt(row, columnIndex, displayName, field.name), field.type));
        vectors[field.name] = vectorFromArray(values, field.type);
    }
    const table = new Table(schema, vectors as never);
    const batch = table.batches[0];
    if (!batch) throw new Error('Failed to construct Arrow RecordBatch');
    return batch;
}

function valueAt(row: unknown, index: number, displayName: string, internalName: string) {
    if (Array.isArray(row)) return row[index];
    if (!row || typeof row !== 'object') return index === 0 ? row : null;
    const record = row as Record<string, unknown>;
    return displayName in record ? record[displayName] : record[internalName];
}

function normalizeArrowValue(value: unknown, type: DataType): unknown {
    if (value === null || value === undefined) return null;
    if (DataType.isBool(type)) return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
    if (DataType.isInt(type)) {
        if (type.bitWidth === 64) return typeof value === 'bigint' ? value : BigInt(String(value));
        return Number(value);
    }
    if (DataType.isFloat(type)) return Number(value);
    if (DataType.isDecimal(type)) return decimalToWords(value, type.scale);
    if (DataType.isBinary(type)) {
        if (value instanceof Uint8Array) return value;
        if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        return Buffer.from(String(value), 'utf8');
    }
    if (DataType.isDate(type)) {
        const date = value instanceof Date ? value : new Date(String(value));
        if (Number.isNaN(date.getTime())) return null;
        return date.getTime();
    }
    if (DataType.isTime(type)) return timeToMilliseconds(value);
    if (DataType.isTimestamp(type)) {
        const date = value instanceof Date ? value : new Date(typeof value === 'number' ? value : String(value));
        return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === 'string') return value;
    if (typeof value === 'object') return JSON.stringify(value, (_, nested) => (typeof nested === 'bigint' ? nested.toString() : nested));
    return String(value);
}

function arrowTypeFor(databaseType?: string | null): { type: DataType; logicalType: string } {
    const type = String(databaseType ?? '')
        .trim()
        .toLowerCase();
    if (/\b(bool|boolean)\b/.test(type) || /tinyint\s*\(\s*1\s*\)/.test(type)) return { type: new Bool(), logicalType: 'boolean' };
    if (/\b(bigint|int8|bigserial|uint64)\b/.test(type)) {
        return { type: /unsigned|uint64/.test(type) ? new Uint64() : new Int64(), logicalType: 'integer' };
    }
    if (/\b(smallint|integer|int|int2|int4|serial|tinyint|mediumint|uint\d*)\b/.test(type)) {
        return { type: /unsigned|uint\d*/.test(type) ? new Uint64() : new Int64(), logicalType: 'integer' };
    }
    const decimal = type.match(/\b(?:decimal|numeric|number)\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (decimal) {
        const precision = Math.min(38, Math.max(1, Number(decimal[1])));
        const scale = Math.min(precision, Math.max(0, Number(decimal[2])));
        return { type: new Decimal(scale, precision), logicalType: 'decimal' };
    }
    if (/\b(real|float|float4|float8|double|double precision)\b/.test(type)) return { type: new Float64(), logicalType: 'number' };
    if (/\b(binary|varbinary|blob|bytea|raw)\b/.test(type)) return { type: new Binary(), logicalType: 'binary' };
    if (/\bdate\b/.test(type) && !/datetime|timestamp/.test(type)) return { type: new DateDay(), logicalType: 'date' };
    if (/\btime\b/.test(type) && !/datetime|timestamp/.test(type)) return { type: new TimeMillisecond(), logicalType: 'time' };
    if (/datetime|timestamp/.test(type)) {
        const timezone = /tz|with time zone/.test(type) ? 'UTC' : null;
        return { type: new TimestampMillisecond(timezone), logicalType: 'datetime' };
    }
    if (/\b(json|jsonb|array|map|struct|object|variant)\b/.test(type)) return { type: new Utf8(), logicalType: 'json' };
    return { type: new Utf8(), logicalType: 'string' };
}

function uniqueColumnName(displayName: string, usedNames: Set<string>) {
    let candidate = displayName;
    let suffix = 2;
    while (usedNames.has(candidate)) {
        candidate = `${displayName}__${suffix}`;
        suffix += 1;
    }
    usedNames.add(candidate);
    return candidate;
}

function decimalToWords(value: unknown, scale: number) {
    const text = String(value).trim();
    const match = text.match(/^([+-])?(\d+)(?:\.(\d+))?$/);
    if (!match) throw new Error(`Invalid decimal value: ${text}`);
    const fraction = (match[3] ?? '').padEnd(scale, '0').slice(0, scale);
    let unscaled = BigInt(`${match[2]}${fraction}` || '0');
    if (match[1] === '-') unscaled = -unscaled;
    if (unscaled < BigInt(0)) unscaled = (BigInt(1) << BigInt(128)) + unscaled;
    return Uint32Array.from([0, 1, 2, 3].map(index => Number((unscaled >> BigInt(index * 32)) & BigInt('0xffffffff'))));
}

function timeToMilliseconds(value: unknown) {
    if (typeof value === 'number') return value;
    const match = String(value).match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?/);
    if (!match) return Number(value);
    return Number(match[1]) * 3_600_000 + Number(match[2]) * 60_000 + Number(match[3] ?? 0) * 1000 + Number((match[4] ?? '').padEnd(3, '0'));
}

function estimateRowBytes(row: unknown): number {
    if (row == null) return 1;
    if (typeof row === 'string') return Buffer.byteLength(row, 'utf8');
    if (typeof row === 'number' || typeof row === 'bigint' || typeof row === 'boolean') return 8;
    if (row instanceof Uint8Array) return row.byteLength;
    try {
        return Buffer.byteLength(
            JSON.stringify(row, (_, value) => (typeof value === 'bigint' ? value.toString() : value)),
            'utf8',
        );
    } catch {
        return 64;
    }
}

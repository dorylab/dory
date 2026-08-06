import { DataType, type RecordBatch, type Schema } from 'apache-arrow';

import type { DataStream, SerializableDataColumn, SerializableDataPage } from './types';
import { onceAsync } from './lifecycle';

const DISPLAY_NAME_METADATA = 'dory.displayName';
const DATABASE_TYPE_METADATA = 'dory.databaseType';
const LOGICAL_TYPE_METADATA = 'dory.logicalType';

export function serializableColumns(schema: Schema): SerializableDataColumn[] {
    return schema.fields.map(field => ({
        name: field.name,
        displayName: field.metadata.get(DISPLAY_NAME_METADATA) ?? field.name,
        type: field.type.toString(),
        databaseType: field.metadata.get(DATABASE_TYPE_METADATA),
        logicalType: field.metadata.get(LOGICAL_TYPE_METADATA),
        nullable: field.nullable,
    }));
}

export function recordBatchToSerializableRows(batch: RecordBatch, limit = Number.POSITIVE_INFINITY): Array<Record<string, unknown>> {
    const rowLimit = Math.min(batch.numRows, Math.max(0, Math.floor(limit)));
    const rows: Array<Record<string, unknown>> = [];
    for (let rowIndex = 0; rowIndex < rowLimit; rowIndex += 1) {
        const row: Record<string, unknown> = {};
        for (let columnIndex = 0; columnIndex < batch.schema.fields.length; columnIndex += 1) {
            const field = batch.schema.fields[columnIndex]!;
            row[field.name] = serializeArrowValue(batch.getChildAt(columnIndex)?.get(rowIndex), field.type);
        }
        rows.push(row);
    }
    return rows;
}

export async function collectSerializableDataPage(stream: DataStream, limit: number): Promise<SerializableDataPage> {
    const normalizedLimit = Math.max(0, Math.floor(limit));
    const rows: Array<Record<string, unknown>> = [];
    let observed = 0;
    try {
        for await (const batch of stream.batches()) {
            observed += batch.numRows;
            const remaining = normalizedLimit - rows.length;
            if (remaining > 0) rows.push(...recordBatchToSerializableRows(batch, remaining));
        }
    } finally {
        await stream.close();
    }
    return {
        columns: serializableColumns(stream.schema),
        rows,
        rowCount: stream.rowCount ?? observed,
        truncated: observed > rows.length || (stream.rowCount != null && stream.rowCount > rows.length),
    };
}

export async function prefetchSerializableDataStream(source: DataStream, limit: number): Promise<{ stream: DataStream; page: SerializableDataPage; prefetchedBatchCount: number }> {
    const normalizedLimit = Math.max(0, Math.floor(limit));
    const iterator = source.batches()[Symbol.asyncIterator]();
    const bufferedBatches: RecordBatch[] = [];
    const rows: Array<Record<string, unknown>> = [];
    let observedRows = 0;
    let sourceDone = false;

    try {
        while (rows.length < normalizedLimit) {
            const next = await iterator.next();
            if (next.done) {
                sourceDone = true;
                break;
            }
            bufferedBatches.push(next.value);
            observedRows += next.value.numRows;
            rows.push(...recordBatchToSerializableRows(next.value, normalizedLimit - rows.length));
        }
    } catch (error) {
        await source.close().catch(() => undefined);
        throw error;
    }

    const close = onceAsync(async () => {
        await iterator.return?.();
        await source.close();
    });
    let consumed = false;
    const stream: DataStream = {
        schema: source.schema,
        metadata: source.metadata,
        rowCount: source.rowCount,
        batches: () => {
            if (consumed) throw new Error('DATA_STREAM_ALREADY_CONSUMED');
            consumed = true;
            return (async function* () {
                try {
                    for (const batch of bufferedBatches) yield batch;
                    if (!sourceDone) {
                        for (;;) {
                            const next = await iterator.next();
                            if (next.done) return;
                            yield next.value;
                        }
                    }
                } finally {
                    await close();
                }
            })();
        },
        close,
    };

    return {
        stream,
        prefetchedBatchCount: bufferedBatches.length,
        page: {
            columns: serializableColumns(source.schema),
            rows,
            rowCount: source.rowCount ?? observedRows,
            truncated: !sourceDone || observedRows > rows.length || (source.rowCount != null && source.rowCount > rows.length),
        },
    };
}

export function serializeArrowValue(value: unknown, type: DataType): unknown {
    if (value === null || value === undefined) return null;
    if (typeof value === 'bigint') return value.toString();
    if (DataType.isDecimal(type) && value instanceof Uint32Array) return decimalWordsToString(value, type.scale);
    if (DataType.isBinary(type) && value instanceof Uint8Array) return Buffer.from(value).toString('base64');
    if (DataType.isDate(type)) return new Date(Number(value)).toISOString().slice(0, 10);
    if (DataType.isTimestamp(type)) return new Date(Number(value)).toISOString();
    if (DataType.isTime(type)) return formatTime(Number(value));
    if (value instanceof Date) return value.toISOString();
    if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64');
    if (Array.isArray(value)) return value.map(item => serializeNestedValue(item));
    if (typeof value === 'object') return serializeNestedValue(value);
    return value;
}

function serializeNestedValue(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Uint8Array) return Buffer.from(value).toString('base64');
    if (Array.isArray(value)) return value.map(item => serializeNestedValue(item));
    if (typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, serializeNestedValue(item)]));
    return value;
}

function decimalWordsToString(words: Uint32Array, scale: number) {
    let unsigned = BigInt(0);
    for (let index = Math.min(3, words.length - 1); index >= 0; index -= 1) {
        unsigned = (unsigned << BigInt(32)) | BigInt(words[index]!);
    }
    const signed = (unsigned & (BigInt(1) << BigInt(127))) !== BigInt(0) ? unsigned - (BigInt(1) << BigInt(128)) : unsigned;
    const negative = signed < BigInt(0);
    const digits = (negative ? -signed : signed).toString().padStart(scale + 1, '0');
    const text = scale > 0 ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
    return negative ? `-${text}` : text;
}

function formatTime(milliseconds: number) {
    const hours = Math.floor(milliseconds / 3_600_000);
    const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
    const seconds = Math.floor((milliseconds % 60_000) / 1000);
    const millis = milliseconds % 1000;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

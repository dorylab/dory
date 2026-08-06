import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { ArrowIpcFileDataSource, fingerprint, type DataSource } from '@dory/data-plane';
import pl, { type DataType, type LazyDataFrame } from 'nodejs-polars';

import { cleaningTransformOperations, parseImportPlan } from './plan';
import {
    SOURCE_ROW_NUMBER_COLUMN,
    TRANSFORM_PREVIEW_VERSION,
    type ImportColumnMappingV1,
    type ImportColumnType,
    type ImportPlan,
    type PrepareImportDatasetResult,
    type TransformOperationV1,
    type TransformPreviewV1,
} from './types';

const MIN_INT64 = BigInt('-9223372036854775808');
const MAX_INT64 = BigInt('9223372036854775807');

export type PrepareImportDatasetInput = {
    sourceArrowPath: string;
    outputArrowPath: string;
    sourceDataSource: DataSource;
    plan: ImportPlan;
    signal?: AbortSignal;
};

export class ImportCastError extends Error {
    constructor(
        readonly sourceRow: number,
        readonly column: string,
        readonly targetType: ImportColumnType,
        readonly value: string,
    ) {
        super(`Cannot convert row ${sourceRow}, column ${column}, value ${JSON.stringify(value)} to ${targetType}`);
        this.name = 'ImportCastError';
    }
}

export async function prepareImportDataset(input: PrepareImportDatasetInput): Promise<PrepareImportDatasetResult> {
    const plan = parseImportPlan(input.plan);
    const inputRows = input.sourceDataSource.rowCount ?? (await countRows(pl.scanIPC(input.sourceArrowPath)));
    let transformed = applyCleaningOperations(pl.scanIPC(input.sourceArrowPath), plan.transform.operations, true);
    await validateCasts(transformed, plan.columns, input.signal);
    if (input.signal?.aborted) throw abortError();

    const countFrame = await transformed.select(pl.len().alias('rows')).collect({ streaming: true });
    const outputRows = Number(countFrame.toRecords()[0]?.rows ?? 0);
    if (input.signal?.aborted) throw abortError();
    await mkdir(path.dirname(input.outputArrowPath), { recursive: true });

    transformed = transformed.select(finalExpressions(plan.columns, false));
    await transformed
        .sinkIpc(input.outputArrowPath, {
            compression: 'uncompressed',
            maintainOrder: true,
            mkdir: true,
        })
        .collect({ streaming: true });

    const dataSource = await ArrowIpcFileDataSource.fromFile({
        filePath: input.outputArrowPath,
        rowCount: outputRows,
        metadata: {
            ...input.sourceDataSource.metadata,
            artifactPath: input.outputArrowPath,
            prepared: true,
        },
    });
    return { dataSource, inputRows, outputRows, filteredRows: Math.max(0, inputRows - outputRows) };
}

async function countRows(lazy: LazyDataFrame) {
    const frame = await lazy.select(pl.len().alias('rows')).collect({ streaming: true });
    return Number(frame.toRecords()[0]?.rows ?? 0);
}

export async function previewImportTransform(input: { sourceArrowPath: string; plan: ImportPlan }): Promise<TransformPreviewV1> {
    const plan = parseImportPlan(input.plan);
    const source = pl.scanIPC(input.sourceArrowPath).head(100);
    const beforeFrame = await source.clone().collect({ streaming: true });
    const cleaned = applyCleaningOperations(source, plan.transform.operations, false);
    const cleanedFrame = await cleaned.clone().collect({ streaming: true });
    const projectedFrame = await cleaned.select(finalExpressions(plan.columns, false)).collect({ streaming: true });
    const before = beforeFrame.toRecords() as Array<Record<string, unknown>>;
    const cleanedRows = cleanedFrame.toRecords() as Array<Record<string, unknown>>;
    const projected = projectedFrame.toRecords() as Array<Record<string, unknown>>;
    const sourceColumns = plan.columns.map(column => column.source);
    const activeColumns = plan.columns.filter(column => !column.ignored).sort((left, right) => left.order - right.order);
    const dropOperations = cleaningTransformOperations(plan.transform.operations).filter(
        (operation): operation is Extract<TransformOperationV1, { kind: 'dropInvalid' }> => operation.kind === 'dropInvalid',
    );
    let droppedRows = 0;

    const rows = before.map((row, index) => {
        const cleanedRow = cleanedRows[index] ?? {};
        const errors: TransformPreviewV1['rows'][number]['errors'] = [];
        const droppedColumns = new Set<string>();
        for (const operation of dropOperations) {
            const value = cleanedRow[operation.column];
            if (value === null || value === undefined) {
                if (operation.dropNulls) {
                    errors.push({ column: operation.column, code: 'required_null', targetType: operation.targetType });
                    droppedColumns.add(operation.column);
                }
            } else if (!canCast(String(value), operation.targetType)) {
                errors.push({ column: operation.column, code: 'invalid_type', targetType: operation.targetType });
                droppedColumns.add(operation.column);
            }
        }
        for (const column of activeColumns) {
            const value = cleanedRow[column.source];
            if (column.targetType === 'string' || value === null || value === undefined || canCast(String(value), column.targetType)) continue;
            if (!errors.some(error => error.column === column.source && error.code === 'invalid_type')) {
                errors.push({ column: column.source, code: 'invalid_type', targetType: column.targetType });
            }
        }
        const outcome = droppedColumns.size > 0 ? 'dropped' : 'kept';
        if (outcome === 'dropped') droppedRows += 1;
        return {
            sourceRow: Number(row[SOURCE_ROW_NUMBER_COLUMN] ?? index + 1),
            before: Object.fromEntries(sourceColumns.map(column => [column, previewValue(row[column], 'string')])),
            after: Object.fromEntries(activeColumns.map(column => [column.target, previewValue(projected[index]?.[column.target], column.targetType)])),
            outcome,
            errors,
        } as const;
    });

    return {
        version: TRANSFORM_PREVIEW_VERSION,
        transformHash: fingerprint(plan.transform),
        inputRows: rows.length,
        keptRows: rows.length - droppedRows,
        droppedRows,
        rows,
    };
}

function applyCleaningOperations(lazy: LazyDataFrame, operations: TransformOperationV1[], applyDrops: boolean) {
    let current = lazy;
    for (const operation of cleaningTransformOperations(operations)) {
        const column = pl.col(operation.column);
        if (operation.kind === 'trim') {
            current = current.withColumn(column.cast(pl.String).str.strip().alias(operation.column));
        } else if (operation.kind === 'lowercase') {
            current = current.withColumn(column.cast(pl.String).str.toLowerCase().alias(operation.column));
        } else if (operation.kind === 'replace') {
            current = current.withColumn(column.cast(pl.String).str.replaceAll(operation.find, operation.replacement, true).alias(operation.column));
        } else if (operation.kind === 'emptyToNull') {
            const stringColumn = column.cast(pl.String);
            current = current.withColumn(
                pl
                    .when(stringColumn.eq(pl.lit('')))
                    .then(pl.lit(null))
                    .otherwise(stringColumn)
                    .alias(operation.column),
            );
        } else if (operation.kind === 'dropInvalid' && applyDrops) {
            const validValue = castExpression(column, operation.targetType, false).isNotNull();
            const valid = operation.dropNulls ? validValue : column.isNull().or(validValue);
            current = current.filter(valid);
        }
    }
    return current;
}

async function validateCasts(lazy: LazyDataFrame, columns: ImportColumnMappingV1[], signal?: AbortSignal) {
    const active = columns.filter(column => !column.ignored && column.targetType !== 'string');
    if (active.length === 0) return;
    if (signal?.aborted) throw abortError();
    const invalidMasks = active.map(column => {
        const value = pl.col(column.source);
        return value.isNotNull().and(castExpression(value, column.targetType, false).isNull());
    });
    let invalid = invalidMasks[0];
    for (const mask of invalidMasks.slice(1)) invalid = invalid.or(mask);
    const invalidFrame = await lazy
        .filter(invalid)
        .select([pl.col(SOURCE_ROW_NUMBER_COLUMN), ...active.map(column => pl.col(column.source))])
        .head(1)
        .collect({ streaming: true });
    const row = invalidFrame.toRecords()[0] as Record<string, unknown> | undefined;
    if (!row) return;
    for (const column of active) {
        const value = row[column.source];
        if (value !== null && value !== undefined && !canCast(String(value), column.targetType)) {
            throw new ImportCastError(Number(row[SOURCE_ROW_NUMBER_COLUMN] ?? 1), column.source, column.targetType, String(value));
        }
    }
}

function finalExpressions(columns: ImportColumnMappingV1[], strict: boolean) {
    return columns
        .filter(column => !column.ignored)
        .sort((left, right) => left.order - right.order)
        .map(column => castExpression(pl.col(column.source), column.targetType, strict).alias(column.target));
}

function canCast(value: string, type: ImportColumnType): boolean {
    if (type === 'string') return true;
    if (type === 'boolean') return /^(?:true|false)$/i.test(value);
    if (type === 'int64') {
        if (!/^[+-]?\d+$/.test(value)) return false;
        try {
            const parsed = BigInt(value);
            return parsed >= MIN_INT64 && parsed <= MAX_INT64;
        } catch {
            return false;
        }
    }
    if (type === 'float64') return value !== '' && Number.isFinite(Number(value));
    if (type === 'date') return isDate(value);
    return !Number.isNaN(Date.parse(value));
}

function isDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function polarsType(type: ImportColumnType): DataType {
    if (type === 'boolean') return pl.Bool;
    if (type === 'int64') return pl.Int64;
    if (type === 'float64') return pl.Float64;
    if (type === 'date') return pl.Date;
    if (type === 'datetime') return pl.Datetime('ms');
    return pl.String;
}

function castExpression(expression: ReturnType<typeof pl.col>, type: ImportColumnType, strict: boolean) {
    if (type === 'string') return expression.cast(pl.String, strict);
    if (type === 'boolean') return expression.cast(pl.String, strict).str.toLowerCase().eq(pl.lit('true'));
    if (type === 'datetime') {
        expression = expression.cast(pl.String, strict);
        const spaced = pl
            .when(expression.str.contains(/\.\d+$/))
            .then(expression.str.strptime(pl.Datetime('ms'), '%Y-%m-%d %H:%M:%S%.f'))
            .otherwise(expression.str.strptime(pl.Datetime('ms'), '%Y-%m-%d %H:%M:%S'));
        return pl
            .when(expression.str.contains(/^\d{4}-\d{2}-\d{2} /))
            .then(spaced)
            .otherwise(expression.cast(pl.Datetime('ms'), strict));
    }
    return expression.cast(polarsType(type), strict);
}

function previewValue(value: unknown, type: ImportColumnType): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return type === 'date' ? value.toISOString().slice(0, 10) : value.toISOString();
    return String(value);
}

function abortError() {
    return new DOMException('The import was canceled', 'AbortError');
}

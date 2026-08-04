import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ArrowIpcFileDataset, type Dataset } from '@dory/dataset';
import pl, { type DataType } from 'nodejs-polars';

import { parseImportPlan } from './plan';
import { SOURCE_ROW_NUMBER_COLUMN, type ImportColumnMappingV1, type ImportColumnType, type ImportPlanV1 } from './types';

const MIN_INT64 = BigInt('-9223372036854775808');
const MAX_INT64 = BigInt('9223372036854775807');

export type PrepareImportDatasetInput = {
    sourceArrowPath: string;
    outputArrowPath: string;
    sourceDataset: Dataset;
    plan: ImportPlanV1;
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

export async function prepareImportDataset(input: PrepareImportDatasetInput): Promise<Dataset> {
    const plan = parseImportPlan(input.plan);
    await validateCasts(input.sourceDataset, plan.columns, input.signal);
    if (input.signal?.aborted) throw abortError();
    await mkdir(path.dirname(input.outputArrowPath), { recursive: true });

    const expressions = plan.columns
        .filter(column => !column.ignored)
        .sort((left, right) => left.order - right.order)
        .map(column => {
            const expression = pl.col(column.source);
            return castExpression(expression, column.targetType).alias(column.target);
        });

    await pl
        .scanIPC(input.sourceArrowPath)
        .select(expressions)
        .sinkIpc(input.outputArrowPath, {
            compression: 'uncompressed',
            maintainOrder: true,
            mkdir: true,
        })
        .collect({ streaming: true });

    return ArrowIpcFileDataset.open({
        filePath: input.outputArrowPath,
        rowCount: input.sourceDataset.rowCount,
        metadata: {
            ...input.sourceDataset.metadata,
            artifactPath: input.outputArrowPath,
            prepared: true,
        },
    });
}

async function validateCasts(dataset: Dataset, columns: ImportColumnMappingV1[], signal?: AbortSignal) {
    const active = columns.filter(column => !column.ignored && column.targetType !== 'string');
    if (active.length === 0) return;
    const sourceNames = new Set(dataset.schema.fields.map(field => field.name));
    for (const column of columns) {
        if (!sourceNames.has(column.source)) throw new Error(`Source column does not exist: ${column.source}`);
    }

    const reader = await dataset.openBatches({ signal });
    for await (const batch of reader) {
        const rowNumbers = batch.getChild(SOURCE_ROW_NUMBER_COLUMN);
        for (let rowIndex = 0; rowIndex < batch.numRows; rowIndex += 1) {
            if (signal?.aborted) throw abortError();
            const sourceRow = Number(rowNumbers?.get(rowIndex) ?? rowIndex + 1);
            for (const column of active) {
                const value = batch.getChild(column.source)?.get(rowIndex);
                if (value === null || value === undefined) continue;
                const text = String(value);
                if (!canCast(text, column.targetType)) {
                    throw new ImportCastError(sourceRow, column.source, column.targetType, text);
                }
            }
        }
    }
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
    if (type === 'float64') return value.trim() !== '' && Number.isFinite(Number(value));
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

function castExpression(expression: ReturnType<typeof pl.col>, type: ImportColumnType) {
    if (type === 'string') return expression;
    if (type === 'boolean') return expression.str.toLowerCase().eq(pl.lit('true'));
    if (type === 'date') return expression.str.strptime(pl.Date, '%Y-%m-%d');
    if (type === 'datetime') return expression.str.strptime(pl.Datetime('ms'));
    return expression.cast(polarsType(type), true);
}

function abortError() {
    return new DOMException('The import was canceled', 'AbortError');
}

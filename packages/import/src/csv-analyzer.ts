import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ArrowIpcFileDataset, fingerprint, type Dataset } from '@dory/dataset';
import pl from 'nodejs-polars';

import {
    SOURCE_ROW_NUMBER_COLUMN,
    DATASET_PROFILE_VERSION,
    type CsvAnalysisResult,
    type CsvParsingOptions,
    type DatasetProfileColumnV1,
    type DatasetProfileV1,
    type ImportColumnType,
} from './types';

export type AnalyzeCsvInput = {
    sourcePath: string;
    sourceName: string;
    sourceHash: string;
    outputArrowPath: string;
    parsing: CsvParsingOptions;
};

type ColumnState = {
    name: string;
    nullCount: number;
    samples: string[];
    sawValue: boolean;
    boolean: boolean;
    integer: boolean;
    float: boolean;
    date: boolean;
    datetime: boolean;
};

const MIN_INT64 = BigInt('-9223372036854775808');
const MAX_INT64 = BigInt('9223372036854775807');

export async function analyzeCsv(input: AnalyzeCsvInput): Promise<CsvAnalysisResult> {
    await mkdir(path.dirname(input.outputArrowPath), { recursive: true });

    const lazy = pl.scanCSV(input.sourcePath, {
        hasHeader: input.parsing.hasHeader,
        sep: input.parsing.delimiter,
        quoteChar: input.parsing.quoteChar,
        encoding: 'utf8',
        inferSchemaLength: 0,
        ignoreErrors: false,
        lowMemory: true,
        rechunk: false,
        rowIndexName: SOURCE_ROW_NUMBER_COLUMN,
        rowIndexOffset: 1,
        raiseIfEmpty: true,
        truncateRaggedLines: false,
        missingUtf8IsEmptyString: false,
    });

    await lazy
        .sinkIpc(input.outputArrowPath, {
            compression: 'uncompressed',
            maintainOrder: true,
            mkdir: true,
        })
        .collect({ streaming: true });
    const dataset = await ArrowIpcFileDataset.open({
        filePath: input.outputArrowPath,
        metadata: {
            source: input.sourceName,
            sourceHash: input.sourceHash,
            artifactPath: input.outputArrowPath,
            parsing: input.parsing,
        },
    });
    const profile = await profileDataset(dataset);
    const profiledDataset = await ArrowIpcFileDataset.open({
        filePath: input.outputArrowPath,
        rowCount: profile.rows,
        metadata: dataset.metadata,
    });

    return {
        dataset: profiledDataset,
        profile,
        parsing: input.parsing,
        sourceArrowPath: input.outputArrowPath,
    };
}

export async function profileDataset(dataset: Dataset): Promise<DatasetProfileV1> {
    const fields = dataset.schema.fields.filter(field => field.name !== SOURCE_ROW_NUMBER_COLUMN);
    const states = fields.map<ColumnState>(field => ({
        name: field.name,
        nullCount: 0,
        samples: [],
        sawValue: false,
        boolean: true,
        integer: true,
        float: true,
        date: true,
        datetime: true,
    }));
    const preview: Array<Record<string, unknown>> = [];
    let rows = 0;
    const reader = await dataset.openBatches();

    for await (const batch of reader) {
        for (let rowIndex = 0; rowIndex < batch.numRows; rowIndex += 1) {
            const previewRow: Record<string, unknown> = {};
            for (let columnIndex = 0; columnIndex < fields.length; columnIndex += 1) {
                const field = fields[columnIndex];
                const vector = batch.getChild(field.name);
                const value = vector?.get(rowIndex) ?? null;
                const state = states[columnIndex];
                if (value === null || value === undefined) {
                    state.nullCount += 1;
                    if (preview.length < 100) previewRow[field.name] = null;
                    continue;
                }
                const text = String(value);
                state.sawValue = true;
                if (state.samples.length < 5 && !state.samples.includes(text)) state.samples.push(text);
                state.boolean &&= /^(?:true|false)$/i.test(text);
                state.integer &&= isConservativeInteger(text);
                state.float &&= isConservativeFloat(text);
                state.date &&= isDate(text);
                state.datetime &&= isDatetime(text);
                if (preview.length < 100) previewRow[field.name] = text;
            }
            if (preview.length < 100) preview.push(previewRow);
            rows += 1;
        }
    }

    return {
        version: DATASET_PROFILE_VERSION,
        rows,
        columns: states.map<DatasetProfileColumnV1>(state => ({
            name: state.name,
            detectedType: detectedType(state),
            nullCount: state.nullCount,
            nullRate: rows === 0 ? 0 : state.nullCount / rows,
            sampleValues: state.samples,
        })),
        preview,
    };
}

export function datasetSchemaHash(dataset: Dataset): string {
    return fingerprint(
        dataset.schema.fields.map(field => ({
            name: field.name,
            nullable: field.nullable,
            type: field.type.toString(),
        })),
    );
}

function detectedType(state: ColumnState): ImportColumnType {
    if (!state.sawValue) return 'string';
    if (state.boolean) return 'boolean';
    if (state.integer) return 'int64';
    if (state.float) return 'float64';
    if (state.date) return 'date';
    if (state.datetime) return 'datetime';
    return 'string';
}

function isConservativeInteger(value: string): boolean {
    if (!/^[+-]?(?:0|[1-9]\d*)$/.test(value)) return false;
    const unsigned = value.replace(/^[+-]/, '');
    if (unsigned.length > 1 && unsigned.startsWith('0')) return false;
    try {
        const number = BigInt(value);
        return number >= MIN_INT64 && number <= MAX_INT64;
    } catch {
        return false;
    }
}

function isConservativeFloat(value: string): boolean {
    if (!/^[+-]?(?:(?:\d+\.\d*|\d*\.\d+)(?:[eE][+-]?\d+)?|\d+[eE][+-]?\d+)$/.test(value)) return false;
    return Number.isFinite(Number(value));
}

function isDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isDatetime(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value)) return false;
    return !Number.isNaN(Date.parse(value));
}

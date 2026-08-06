import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { ArrowIpcFileDataset, fingerprint, type Dataset } from '@dory/dataset';
import pl from 'nodejs-polars';

import {
    DATASET_PROFILE_VERSION,
    SOURCE_ROW_NUMBER_COLUMN,
    type CsvAnalysisResult,
    type CsvParsingOptions,
    type DatasetProfileColumnV2,
    type DatasetProfileTypeCandidateV2,
    type DatasetProfileV2,
    type DatasetQualityIssueV2,
    type ImportColumnType,
} from './types';

export type AnalyzeCsvInput = {
    sourcePath: string;
    sourceName: string;
    sourceHash: string;
    outputArrowPath: string;
    parsing: CsvParsingOptions;
};

const PROFILE_MAX_SAMPLE_ROWS = 100_000;
const PROFILE_MAX_SAMPLE_CELLS = 2_000_000;
const CANDIDATE_TYPES: Array<Exclude<ImportColumnType, 'string'>> = ['boolean', 'int64', 'float64', 'date', 'datetime'];

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

export async function profileDataset(dataset: Dataset): Promise<DatasetProfileV2> {
    const filePath = dataset.metadata.artifactPath;
    if (typeof filePath !== 'string' || !filePath) throw new Error('Polars profiling requires a local Arrow IPC artifact path');
    const fields = dataset.schema.fields.filter(field => field.name !== SOURCE_ROW_NUMBER_COLUMN);
    const forcedStringColumns = new Set(
        Array.isArray(dataset.metadata.sourceWarnings)
            ? dataset.metadata.sourceWarnings
                  .filter(warning => warning && typeof warning === 'object' && (warning as { code?: unknown }).code === 'DECIMAL_STRINGIFIED')
                  .map(warning => String((warning as { column?: unknown }).column ?? ''))
            : [],
    );
    const exactExpressions = [pl.len().alias('rows')];

    for (let index = 0; index < fields.length; index += 1) {
        const column = pl.col(fields[index].name);
        const prefix = metricPrefix(index);
        const nativeType = importTypeForArrowType(fields[index].type.toString());
        exactExpressions.push(column.nullCount().alias(`${prefix}_null`), column.count().alias(`${prefix}_non_null`));
        if (nativeType !== 'string') {
            exactExpressions.push(
                pl.lit(0).alias(`${prefix}_empty`),
                pl.lit(0).alias(`${prefix}_whitespace`),
                pl.lit(0).alias(`${prefix}_leading_zero`),
                pl.lit(null).alias(`${prefix}_length_min`),
                pl.lit(null).alias(`${prefix}_length_max`),
                pl.lit(null).alias(`${prefix}_length_mean`),
            );
            if (nativeType === 'int64') {
                exactExpressions.push(
                    column.min().cast(pl.String).alias(`${prefix}_int64_min`),
                    column.max().cast(pl.String).alias(`${prefix}_int64_max`),
                    column.mean().alias(`${prefix}_int64_mean`),
                );
            } else if (nativeType === 'float64') {
                exactExpressions.push(column.min().alias(`${prefix}_float64_min`), column.max().alias(`${prefix}_float64_max`), column.mean().alias(`${prefix}_float64_mean`));
            } else if (nativeType === 'date' || nativeType === 'datetime') {
                exactExpressions.push(column.min().alias(`${prefix}_${nativeType}_min`), column.max().alias(`${prefix}_${nativeType}_max`));
            }
            continue;
        }
        const intValue = column.cast(pl.Int64, false);
        const floatValue = column.cast(pl.Float64, false);
        const dateValue = column.cast(pl.Date, false);
        const datetimeValue = datetimeExpression(column, false);
        exactExpressions.push(
            column.eq(pl.lit('')).sum().alias(`${prefix}_empty`),
            column.isNotNull().and(column.neq(column.str.strip())).sum().alias(`${prefix}_whitespace`),
            column.str
                .contains(/^[+-]?0\d+$/)
                .sum()
                .alias(`${prefix}_leading_zero`),
            column.str.lengths().min().alias(`${prefix}_length_min`),
            column.str.lengths().max().alias(`${prefix}_length_max`),
            column.str.lengths().mean().alias(`${prefix}_length_mean`),
            column.str
                .contains(/^(?:true|false)$/i)
                .sum()
                .alias(`${prefix}_boolean_valid`),
            intValue.isNotNull().sum().alias(`${prefix}_int64_valid`),
            floatValue.isNotNull().and(floatValue.isFinite()).sum().alias(`${prefix}_float64_valid`),
            dateValue.isNotNull().sum().alias(`${prefix}_date_valid`),
            datetimeValue.isNotNull().sum().alias(`${prefix}_datetime_valid`),
            intValue.min().cast(pl.String).alias(`${prefix}_int64_min`),
            intValue.max().cast(pl.String).alias(`${prefix}_int64_max`),
            intValue.mean().alias(`${prefix}_int64_mean`),
            floatValue.min().alias(`${prefix}_float64_min`),
            floatValue.max().alias(`${prefix}_float64_max`),
            floatValue.mean().alias(`${prefix}_float64_mean`),
            dateValue.min().alias(`${prefix}_date_min`),
            dateValue.max().alias(`${prefix}_date_max`),
            datetimeValue.min().alias(`${prefix}_datetime_min`),
            datetimeValue.max().alias(`${prefix}_datetime_max`),
        );
    }

    const exactFrame = await pl.scanIPC(filePath).select(exactExpressions).collect({ streaming: true });
    const exact = (exactFrame.toRecords()[0] ?? {}) as Record<string, unknown>;
    const rows = metricNumber(exact.rows);
    const sampleLimit = Math.max(1, Math.min(PROFILE_MAX_SAMPLE_ROWS, Math.floor(PROFILE_MAX_SAMPLE_CELLS / Math.max(1, fields.length))));
    const stride = Math.max(1, Math.ceil(rows / sampleLimit));
    const sampleFrame = await pl.scanIPC(filePath).filter(pl.col(SOURCE_ROW_NUMBER_COLUMN).sub(1).modulo(stride).eq(0)).limit(sampleLimit).collect({ streaming: true });
    const sampleRows = sampleFrame.height;
    const sampleRecords = sampleFrame.toRecords() as Array<Record<string, unknown>>;
    const preview = await readPreview(
        dataset,
        fields.map(field => field.name),
    );
    const columns = fields.map<DatasetProfileColumnV2>((field, index) =>
        buildColumnProfile(
            field.name,
            importTypeForArrowType(field.type.toString()),
            forcedStringColumns.has(field.name),
            index,
            rows,
            sampleRows,
            exact,
            sampleFrame.getColumn(field.name),
            sampleRecords,
        ),
    );
    const issues = columns.flatMap(column => column.issues);

    return {
        version: DATASET_PROFILE_VERSION,
        rows,
        sampleRows,
        columns,
        preview,
        quality: {
            totalIssues: issues.length,
            warningCount: issues.filter(issue => issue.severity === 'warning').length,
            infoCount: issues.filter(issue => issue.severity === 'info').length,
            columnsWithIssues: columns.filter(column => column.issues.length > 0).length,
        },
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

function buildColumnProfile(
    name: string,
    nativeType: ImportColumnType,
    forceString: boolean,
    index: number,
    rows: number,
    sampleRows: number,
    exact: Record<string, unknown>,
    sampleSeries: ReturnType<typeof pl.Series>,
    sampleRecords: Array<Record<string, unknown>>,
): DatasetProfileColumnV2 {
    const prefix = metricPrefix(index);
    const nullCount = metricNumber(exact[`${prefix}_null`]);
    const nonNullCount = metricNumber(exact[`${prefix}_non_null`]);
    const emptyCount = metricNumber(exact[`${prefix}_empty`]);
    const whitespaceCount = metricNumber(exact[`${prefix}_whitespace`]);
    const leadingZeroCount = metricNumber(exact[`${prefix}_leading_zero`]);
    const nonEmptyCount = Math.max(0, rows - nullCount - emptyCount);
    const candidates =
        nativeType === 'string'
            ? CANDIDATE_TYPES.map<DatasetProfileTypeCandidateV2>(type => {
                  const validCount = Math.min(nonEmptyCount, metricNumber(exact[`${prefix}_${type}_valid`]));
                  return {
                      type,
                      validCount,
                      invalidCount: Math.max(0, nonEmptyCount - validCount),
                      validRate: nonEmptyCount === 0 ? 0 : validCount / nonEmptyCount,
                  };
              })
            : [];
    const detectedType = forceString ? 'string' : nativeType === 'string' ? detectedTypeFor(candidates, nonEmptyCount, leadingZeroCount) : nativeType;
    const nonNullSample = sampleSeries.dropNulls();
    const distinctCount = nonNullSample.length > 0 ? nonNullSample.nUnique() : 0;
    const topValues = nonNullSample.length
        ? (nonNullSample.valueCounts(true, false, 'count', false).head(5).toRecords() as Array<Record<string, unknown>>).map(item => ({
              value: String(item[name] ?? ''),
              count: metricNumber(item.count),
              rate: nonNullSample.length === 0 ? 0 : metricNumber(item.count) / nonNullSample.length,
          }))
        : [];
    const quantiles = numericQuantiles(sampleSeries, detectedType);
    const sampleValues = topValues.map(item => item.value).slice(0, 5);
    const issues = qualityIssues({
        name,
        rows,
        nullCount,
        emptyCount,
        whitespaceCount,
        leadingZeroCount,
        nonEmptyCount,
        candidates,
        sampleRecords,
        isString: nativeType === 'string',
    });
    const stats = exactStats(exact, prefix, detectedType);

    return {
        name,
        detectedType,
        nullCount,
        nullRate: rate(nullCount, rows),
        nonNullCount,
        emptyCount,
        emptyRate: rate(emptyCount, rows),
        whitespaceCount,
        whitespaceRate: rate(whitespaceCount, rows),
        leadingZeroCount,
        minLength: nullableNumber(exact[`${prefix}_length_min`]),
        maxLength: nullableNumber(exact[`${prefix}_length_max`]),
        averageLength: nullableNumber(exact[`${prefix}_length_mean`]),
        ...stats,
        candidates,
        sampleValues,
        sample: {
            basis: 'sample',
            rows: sampleRows,
            distinctCount,
            distinctRate: rate(distinctCount, nonNullSample.length),
            topValues,
            quantiles,
        },
        issues,
    };
}

function qualityIssues(input: {
    name: string;
    rows: number;
    nullCount: number;
    emptyCount: number;
    whitespaceCount: number;
    leadingZeroCount: number;
    nonEmptyCount: number;
    candidates: DatasetProfileTypeCandidateV2[];
    sampleRecords: Array<Record<string, unknown>>;
    isString: boolean;
}): DatasetQualityIssueV2[] {
    const issues: DatasetQualityIssueV2[] = [];
    if (input.rows > 0 && input.nullCount + input.emptyCount === input.rows) {
        issues.push(issue('all_missing', 'warning', input.rows, input.rows, []));
    }
    if (input.isString && input.emptyCount > 0) {
        issues.push(
            issue(
                'empty_string',
                'info',
                input.emptyCount,
                input.rows,
                issueExamples(input.sampleRecords, input.name, value => value === ''),
                {
                    kind: 'emptyToNull',
                    column: input.name,
                },
            ),
        );
    }
    if (input.isString && input.whitespaceCount > 0) {
        issues.push(
            issue(
                'surrounding_whitespace',
                'warning',
                input.whitespaceCount,
                input.rows,
                issueExamples(input.sampleRecords, input.name, value => value !== value.trim()),
                {
                    kind: 'trim',
                    column: input.name,
                },
            ),
        );
    }
    if (input.isString && input.leadingZeroCount > 0) {
        issues.push(
            issue(
                'leading_zero',
                'info',
                input.leadingZeroCount,
                input.rows,
                issueExamples(input.sampleRecords, input.name, value => /^[+-]?0\d+$/.test(value)),
            ),
        );
    }
    const best = input.isString
        ? [...input.candidates].sort((left, right) => right.validRate - left.validRate || CANDIDATE_TYPES.indexOf(left.type) - CANDIDATE_TYPES.indexOf(right.type))[0]
        : undefined;
    if (input.nonEmptyCount >= 10 && best && best.validRate >= 0.9 && best.validRate < 1) {
        issues.push(
            issue(
                'mixed_type',
                'warning',
                best.invalidCount,
                input.rows,
                issueExamples(input.sampleRecords, input.name, value => value !== '' && !canCastCandidate(value, best.type)),
            ),
        );
    }
    return issues;
}

function issue(
    code: DatasetQualityIssueV2['code'],
    severity: DatasetQualityIssueV2['severity'],
    affectedCount: number,
    rows: number,
    examples: DatasetQualityIssueV2['examples'],
    suggestedOperation?: DatasetQualityIssueV2['suggestedOperation'],
): DatasetQualityIssueV2 {
    return { code, severity, affectedCount, affectedRate: rate(affectedCount, rows), examples, ...(suggestedOperation ? { suggestedOperation } : {}) };
}

function issueExamples(records: Array<Record<string, unknown>>, column: string, predicate: (value: string) => boolean) {
    const examples: DatasetQualityIssueV2['examples'] = [];
    for (const record of records) {
        const value = record[column];
        if (value === null || value === undefined || !predicate(String(value))) continue;
        examples.push({ sourceRow: Number(record[SOURCE_ROW_NUMBER_COLUMN] ?? 0), value: String(value).slice(0, 256) });
        if (examples.length === 5) break;
    }
    return examples;
}

function detectedTypeFor(candidates: DatasetProfileTypeCandidateV2[], nonEmptyCount: number, leadingZeroCount: number): ImportColumnType {
    if (nonEmptyCount === 0) return 'string';
    if (leadingZeroCount > 0) return 'string';
    for (const candidate of candidates) {
        if (candidate.validCount === nonEmptyCount) return candidate.type;
    }
    return 'string';
}

function exactStats(exact: Record<string, unknown>, prefix: string, detectedType: ImportColumnType) {
    if (detectedType === 'int64') {
        return {
            min: nullableInt64(exact[`${prefix}_int64_min`]),
            max: nullableInt64(exact[`${prefix}_int64_max`]),
            mean: nullableNumber(exact[`${prefix}_int64_mean`]),
        };
    }
    if (detectedType === 'float64') {
        return {
            min: nullableNumber(exact[`${prefix}_float64_min`]),
            max: nullableNumber(exact[`${prefix}_float64_max`]),
            mean: nullableNumber(exact[`${prefix}_float64_mean`]),
        };
    }
    if (detectedType === 'date' || detectedType === 'datetime') {
        return {
            min: dateStat(exact[`${prefix}_${detectedType}_min`], detectedType),
            max: dateStat(exact[`${prefix}_${detectedType}_max`], detectedType),
            mean: null,
        };
    }
    return { min: null, max: null, mean: null };
}

function numericQuantiles(series: ReturnType<typeof pl.Series>, detectedType: ImportColumnType) {
    if (detectedType !== 'int64' && detectedType !== 'float64') return null;
    const numeric = series.cast(detectedType === 'int64' ? pl.Int64 : pl.Float64, false).dropNulls();
    if (numeric.length === 0) return null;
    return { p25: Number(numeric.quantile(0.25)), p50: Number(numeric.quantile(0.5)), p75: Number(numeric.quantile(0.75)) };
}

function datetimeExpression(expression: ReturnType<typeof pl.col>, strict: boolean) {
    const spaced = pl
        .when(expression.str.contains(/\.\d+$/))
        .then(expression.str.strptime(pl.Datetime('ms'), '%Y-%m-%d %H:%M:%S%.f'))
        .otherwise(expression.str.strptime(pl.Datetime('ms'), '%Y-%m-%d %H:%M:%S'));
    return pl
        .when(expression.str.contains(/^\d{4}-\d{2}-\d{2} /))
        .then(spaced)
        .otherwise(expression.cast(pl.Datetime('ms'), strict));
}

async function readPreview(dataset: Dataset, columns: string[]) {
    const preview: Array<Record<string, unknown>> = [];
    const reader = await dataset.openBatches();
    try {
        for await (const batch of reader) {
            for (let rowIndex = 0; rowIndex < batch.numRows && preview.length < 100; rowIndex += 1) {
                const row: Record<string, unknown> = {};
                for (const column of columns) {
                    const value = batch.getChild(column)?.get(rowIndex);
                    row[column] = value === null || value === undefined ? null : String(value);
                }
                preview.push(row);
            }
            if (preview.length === 100) break;
        }
    } finally {
        await reader.close();
    }
    return preview;
}

function canCastCandidate(value: string, type: Exclude<ImportColumnType, 'string'>) {
    if (type === 'boolean') return /^(?:true|false)$/i.test(value);
    if (type === 'int64') return /^[+-]?\d+$/.test(value) && integerInRange(value);
    if (type === 'float64') return value !== '' && Number.isFinite(Number(value));
    if (type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(value) && validDate(value);
    return !Number.isNaN(Date.parse(value));
}

function integerInRange(value: string) {
    try {
        const parsed = BigInt(value);
        return parsed >= BigInt('-9223372036854775808') && parsed <= BigInt('9223372036854775807');
    } catch {
        return false;
    }
}

function validDate(value: string) {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function metricPrefix(index: number) {
    return `column_${index}`;
}

function metricNumber(value: unknown) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'bigint') return Number(value);
    return value === null || value === undefined ? 0 : Number(value) || 0;
}

function nullableNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const number = typeof value === 'bigint' ? Number(value) : Number(value);
    return Number.isFinite(number) ? number : null;
}

function nullableInt64(value: unknown): string | number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'bigint') return value.toString();
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : String(value);
}

function dateStat(value: unknown, type: 'date' | 'datetime') {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
    return type === 'date' ? value.toISOString().slice(0, 10) : value.toISOString();
}

function rate(value: number, total: number) {
    return total === 0 ? 0 : value / total;
}

function importTypeForArrowType(type: string): ImportColumnType {
    if (/Bool/i.test(type)) return 'boolean';
    if (/Int64/i.test(type)) return 'int64';
    if (/Float64/i.test(type)) return 'float64';
    if (/^Date/i.test(type)) return 'date';
    if (/Timestamp|DateTime/i.test(type)) return 'datetime';
    return 'string';
}

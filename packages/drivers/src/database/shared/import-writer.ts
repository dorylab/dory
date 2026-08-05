import {
    type ImportAtomicity,
    type ImportColumnMappingV1,
    type ImportColumnType,
    type ImportExecutionPlan,
    type ImportWriteCapabilities,
    type ImportWriteOperation,
    type TargetSchema,
} from '@dory/import';

export const IMPORT_COLUMN_TYPES: ReadonlyArray<ImportColumnType> = ['string', 'boolean', 'int64', 'float64', 'date', 'datetime'];

export function activeImportColumns(plan: ImportExecutionPlan) {
    return plan.columns.filter(column => !column.ignored).sort((left, right) => left.order - right.order);
}

export function importOperation(plan: ImportExecutionPlan): ImportWriteOperation {
    return plan.target.mode === 'create' ? 'create' : plan.mode;
}

export function capabilityMatrix(input: {
    create: ImportAtomicity;
    append: ImportAtomicity;
    replace: ImportAtomicity | false;
    createReason?: 'batch_commits' | 'ddl_not_transactional';
    appendReason?: 'batch_commits' | 'target_non_transactional';
    replaceReason?: 'target_non_transactional';
}): ImportWriteCapabilities {
    return {
        create: { supported: true, atomicity: input.create, ...(input.createReason ? { reason: input.createReason } : {}) },
        append: { supported: true, atomicity: input.append, ...(input.appendReason ? { reason: input.appendReason } : {}) },
        replace:
            input.replace === false
                ? { supported: false, reason: input.replaceReason ?? 'replace_not_atomic' }
                : { supported: true, atomicity: input.replace, ...(input.replaceReason ? { reason: input.replaceReason } : {}) },
    };
}

export const atomicCapabilities = capabilityMatrix({ create: 'atomic', append: 'atomic', replace: 'atomic' });
export const batchCommitCapabilities = capabilityMatrix({
    create: 'best-effort',
    append: 'best-effort',
    replace: false,
    createReason: 'batch_commits',
    appendReason: 'batch_commits',
});

export function targetSchema(exists: boolean, columns: TargetSchema['columns'], writeCapabilities: ImportWriteCapabilities): TargetSchema {
    return { exists, columns, writeCapabilities };
}

export function assertImportSupported(plan: ImportExecutionPlan, writeCapabilities: ImportWriteCapabilities) {
    const operation = importOperation(plan);
    const capability = writeCapabilities[operation];
    if (!capability.supported) {
        throw new Error(`Import ${operation} is not supported for this target (${capability.reason})`);
    }
    return capability;
}

export function normalizeImportValue(value: unknown, type: ImportColumnType): unknown {
    if (value === null || value === undefined) return null;
    if (type === 'boolean') return value === true || value === 1 || value === BigInt(1);
    if (type === 'int64') return typeof value === 'bigint' ? value : BigInt(String(value));
    if (type === 'float64') return Number(value);
    if (type === 'date') return importDate(value).toISOString().slice(0, 10);
    if (type === 'datetime') return importDate(value).toISOString();
    return String(value);
}

export function batchRows(
    batch: { numRows: number; getChild(name: string): { get(index: number): unknown } | null },
    columns: ImportColumnMappingV1[],
    offset = 0,
    count = batch.numRows,
) {
    const rows: unknown[][] = [];
    for (let row = offset; row < Math.min(batch.numRows, offset + count); row += 1) {
        rows.push(columns.map(column => normalizeImportValue(batch.getChild(column.target)?.get(row), column.targetType)));
    }
    return rows;
}

export function quoteDouble(value: string) {
    return `"${value.replaceAll('"', '""')}"`;
}

export function quoteBacktick(value: string) {
    return `\`${value.replaceAll('`', '``')}\``;
}

export function quoteBracket(value: string) {
    return `[${value.replaceAll(']', ']]')}]`;
}

export function abortError() {
    return new DOMException('The import was canceled', 'AbortError');
}

export function isCommitOutcomeUnknown(error: unknown) {
    if (!(error instanceof Error)) return true;
    const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
    if (code.startsWith('08') || ['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNABORTED'].includes(code)) return true;
    return /connection (?:terminated|closed|lost)|socket hang up|write after end|network/i.test(error.message);
}

function importDate(value: unknown) {
    if (value instanceof Date) return value;
    if (typeof value === 'number' || typeof value === 'bigint') return new Date(Number(value));
    return new Date(String(value));
}

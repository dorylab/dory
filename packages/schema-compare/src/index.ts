export type ComparisonKind = 'schema' | 'data' | 'query_result';

export type SchemaDialectFamily = 'postgres' | 'mysql' | 'sqlite' | 'clickhouse' | 'duckdb' | 'oracle' | 'snowflake' | 'sqlserver';

export type ComparisonEndpoint = {
    connectionId: string;
    identityId?: string | null;
    database: string;
    schemas?: string[];
};

export type SchemaCoverageStatus = 'complete' | 'partial' | 'unavailable' | 'not_applicable';
export type SchemaCoverageKind = 'tables' | 'columns' | 'indexes' | 'constraints' | 'views' | 'statistics';
export type SchemaSnapshotCoverage = Record<SchemaCoverageKind, SchemaCoverageStatus>;

export type SchemaColumn = {
    name: string;
    dataType: string | null;
    nullable: boolean | null;
    defaultExpression?: string | null;
    ordinal?: number | null;
};

export type SchemaIndex = {
    name: string;
    columns: string[];
    unique: boolean;
    primary?: boolean;
    method?: string | null;
    predicate?: string | null;
    expression?: string | null;
    includedColumns?: string[];
    scans?: number | null;
};

export type SchemaConstraintKind = 'primary_key' | 'foreign_key' | 'unique' | 'check';

export type SchemaConstraint = {
    name: string;
    kind: SchemaConstraintKind;
    columns: string[];
    referencedSchema?: string | null;
    referencedTable?: string | null;
    referencedColumns?: string[];
    expression?: string | null;
    onUpdate?: string | null;
    onDelete?: string | null;
    enforced?: boolean | null;
};

export type SchemaTableStatistics = {
    estimatedRows?: number | null;
    totalBytes?: number | null;
    source?: 'catalog_estimate' | 'catalog_exact' | 'unknown';
};

export type SchemaTable = {
    schema: string | null;
    name: string;
    columns: SchemaColumn[];
    indexes: SchemaIndex[];
    constraints: SchemaConstraint[];
    statistics?: SchemaTableStatistics | null;
    attributes?: Record<string, string | number | boolean | null>;
};

export type SchemaView = {
    schema: string | null;
    name: string;
    kind: 'view' | 'materialized_view';
    definition: string | null;
};

export type SchemaSnapshot = {
    version: 1;
    family: SchemaDialectFamily;
    engine: string;
    database: string;
    schemas: string[];
    capturedAt: string;
    contentHash: string;
    coverage: SchemaSnapshotCoverage;
    tables: SchemaTable[];
    views: SchemaView[];
    warnings?: string[];
};

export type SchemaSnapshotInput = {
    database: string;
    schemas?: string[];
};

export type SchemaChangeObjectType = 'table' | 'column' | 'index' | 'constraint' | 'view' | 'materialized_view';
export type SchemaChangeType = 'added' | 'removed' | 'modified' | 'renamed';
export type SchemaRiskLevel = 'low' | 'medium' | 'high' | 'unknown';
export type SchemaComparisonReadiness = 'compatible' | 'review_required' | 'unsafe' | 'unknown';

export type SchemaChangeRisk = {
    level: SchemaRiskLevel;
    breaking: boolean;
    code: string;
    reason: string;
};

export type SchemaChange = {
    changeId: string;
    objectType: SchemaChangeObjectType;
    changeType: SchemaChangeType;
    schema: string | null;
    table: string | null;
    objectName: string;
    objectPath: string;
    attribute: string | null;
    currentValue: string | null;
    desiredValue: string | null;
    risk: SchemaChangeRisk;
    evidence?: {
        estimatedRows?: number | null;
        tableBytes?: number | null;
        indexScans?: number | null;
        statisticsSource?: SchemaTableStatistics['source'];
    };
};

export type SchemaComparisonSummary = {
    totalChanges: number;
    breakingChanges: number;
    added: number;
    removed: number;
    modified: number;
    renamed: number;
    highRisk: number;
    mediumRisk: number;
    lowRisk: number;
    unknownRisk: number;
    readiness: SchemaComparisonReadiness;
};

export type SchemaComparisonResult = {
    version: 1;
    family: SchemaDialectFamily;
    currentHash: string;
    desiredHash: string;
    coverage: SchemaSnapshotCoverage;
    summary: SchemaComparisonSummary;
    changes: SchemaChange[];
    warnings: string[];
};

export const COMPLETE_SCHEMA_COVERAGE: SchemaSnapshotCoverage = {
    tables: 'complete',
    columns: 'complete',
    indexes: 'complete',
    constraints: 'complete',
    views: 'complete',
    statistics: 'complete',
};

const COVERAGE_KINDS: SchemaCoverageKind[] = ['tables', 'columns', 'indexes', 'constraints', 'views', 'statistics'];
const RISK_ORDER: Record<SchemaRiskLevel, number> = { high: 0, medium: 1, unknown: 2, low: 3 };

function normalizedName(value: string | null | undefined) {
    return value?.trim() ?? '';
}

export function qualifiedSchemaName(schema: string | null | undefined, name: string) {
    return schema ? `${schema}.${name}` : name;
}

function normalizedSql(value: string | null | undefined) {
    const trimmed = value?.trim().replace(/;+\s*$/, '') ?? '';
    return trimmed.replace(/\s+/g, ' ');
}

function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
        .sort()
        .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
        .join(',')}}`;
}

export function stableSchemaHash(value: unknown) {
    const input = stableStringify(value);
    let high = 0x811c9dc5;
    let low = 0x9e3779b9;
    for (let index = 0; index < input.length; index += 1) {
        const code = input.charCodeAt(index);
        high = Math.imul(high ^ code, 0x01000193);
        low = Math.imul(low ^ code, 0x85ebca6b);
    }
    return `dory64:${(high >>> 0).toString(16).padStart(8, '0')}${(low >>> 0).toString(16).padStart(8, '0')}`;
}

export function finalizeSchemaSnapshot(input: Omit<SchemaSnapshot, 'version' | 'contentHash'>): SchemaSnapshot {
    const normalized: Omit<SchemaSnapshot, 'contentHash'> = {
        version: 1,
        ...input,
        schemas: [...input.schemas].sort(),
        tables: input.tables
            .map(table => ({
                ...table,
                columns: [...table.columns].sort(
                    (left, right) => (left.ordinal ?? Number.MAX_SAFE_INTEGER) - (right.ordinal ?? Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name),
                ),
                indexes: [...table.indexes].sort((left, right) => left.name.localeCompare(right.name)),
                constraints: [...table.constraints].sort((left, right) => left.name.localeCompare(right.name)),
            }))
            .sort((left, right) => qualifiedSchemaName(left.schema, left.name).localeCompare(qualifiedSchemaName(right.schema, right.name))),
        views: [...input.views].sort((left, right) => qualifiedSchemaName(left.schema, left.name).localeCompare(qualifiedSchemaName(right.schema, right.name))),
    };

    return {
        ...normalized,
        contentHash: stableSchemaHash({
            family: normalized.family,
            engine: normalized.engine,
            database: normalized.database,
            schemas: normalized.schemas,
            coverage: normalized.coverage,
            tables: normalized.tables,
            views: normalized.views,
        }),
    };
}

export function schemaDialectFamily(type: string): SchemaDialectFamily | null {
    switch (type) {
        case 'postgres':
        case 'neon':
        case 'supabase':
            return 'postgres';
        case 'mysql':
        case 'mariadb':
            return 'mysql';
        case 'sqlite':
        case 'cloudflare-d1':
            return 'sqlite';
        case 'clickhouse':
        case 'duckdb':
        case 'oracle':
        case 'snowflake':
        case 'sqlserver':
            return type;
        default:
            return null;
    }
}

function coverageComparable(status: SchemaCoverageStatus) {
    return status === 'complete' || status === 'not_applicable';
}

function mergeCoverage(current: SchemaSnapshotCoverage, desired: SchemaSnapshotCoverage): SchemaSnapshotCoverage {
    return Object.fromEntries(
        COVERAGE_KINDS.map(kind => {
            const left = current[kind];
            const right = desired[kind];
            if (left === 'not_applicable' && right === 'not_applicable') return [kind, 'not_applicable'];
            if (left === 'complete' && right === 'complete') return [kind, 'complete'];
            if (left === 'unavailable' || right === 'unavailable') return [kind, 'unavailable'];
            return [kind, 'partial'];
        }),
    ) as SchemaSnapshotCoverage;
}

function tableKey(table: Pick<SchemaTable, 'schema' | 'name'>) {
    return `${normalizedName(table.schema)}\u0000${normalizedName(table.name)}`;
}

function viewKey(view: Pick<SchemaView, 'schema' | 'name' | 'kind'>) {
    return `${view.kind}\u0000${normalizedName(view.schema)}\u0000${normalizedName(view.name)}`;
}

function mapBy<T>(items: T[], key: (value: T) => string) {
    return new Map(items.map(item => [key(item), item]));
}

function canonicalType(family: SchemaDialectFamily, value: string | null | undefined) {
    let type = normalizedSql(value).toLowerCase();
    if (!type) return '';
    type = type
        .replace(/\bcharacter varying\b/g, 'varchar')
        .replace(/\bdouble precision\b/g, 'double')
        .replace(/\binteger\b/g, 'int');
    if (family === 'postgres') {
        type = type
            .replace(/\btimestamp without time zone\b/g, 'timestamp')
            .replace(/\btimestamp with time zone\b/g, 'timestamptz')
            .replace(/\bboolean\b/g, 'bool')
            .replace(/\bint2\b/g, 'smallint')
            .replace(/\bint4\b/g, 'int')
            .replace(/\bint8\b/g, 'bigint');
    }
    if (family === 'mysql') {
        type = type.replace(/\btinyint\(1\)\b/g, 'bool').replace(/\bdouble precision\b/g, 'double');
    }
    return type;
}

function varcharLength(type: string) {
    const match = /^(?:n?var)?char\((\d+)\)$/.exec(type);
    return match ? Number(match[1]) : type === 'text' || type === 'varchar' || type === 'nvarchar' ? Number.POSITIVE_INFINITY : null;
}

function numericShape(type: string) {
    const match = /^(?:numeric|decimal)\((\d+)(?:,\s*(\d+))?\)$/.exec(type);
    if (!match) return null;
    const precision = Number(match[1]);
    const scale = Number(match[2] ?? 0);
    return { precision, scale, integerDigits: precision - scale };
}

function numericRank(type: string) {
    const base = type.replace(/\(.*/, '');
    const ranks: Record<string, number> = {
        tinyint: 1,
        smallint: 2,
        int: 3,
        bigint: 4,
        numeric: 5,
        decimal: 5,
        real: 6,
        float: 6,
        double: 7,
    };
    return ranks[base] ?? null;
}

function typeChangeKind(family: SchemaDialectFamily, current: string | null | undefined, desired: string | null | undefined) {
    const left = canonicalType(family, current);
    const right = canonicalType(family, desired);
    if (left === right) return 'equal';

    const leftLength = varcharLength(left);
    const rightLength = varcharLength(right);
    if (leftLength !== null && rightLength !== null) {
        return rightLength >= leftLength ? 'widening' : 'narrowing';
    }

    const leftNumeric = numericShape(left);
    const rightNumeric = numericShape(right);
    if (leftNumeric && rightNumeric) {
        return rightNumeric.scale >= leftNumeric.scale && rightNumeric.integerDigits >= leftNumeric.integerDigits ? 'widening' : 'narrowing';
    }

    const leftRank = numericRank(left);
    const rightRank = numericRank(right);
    if (leftRank !== null && rightRank !== null) {
        return rightRank >= leftRank ? 'widening' : 'narrowing';
    }

    return 'incompatible';
}

function indexSignature(index: SchemaIndex) {
    return stableStringify({
        columns: index.columns.map(normalizedName),
        unique: index.unique,
        primary: Boolean(index.primary),
        method: normalizedName(index.method).toLowerCase(),
        predicate: normalizedSql(index.predicate),
        expression: normalizedSql(index.expression),
        includedColumns: (index.includedColumns ?? []).map(normalizedName),
    });
}

function constraintSignature(constraint: SchemaConstraint) {
    return stableStringify({
        kind: constraint.kind,
        columns: constraint.columns.map(normalizedName),
        referencedSchema: normalizedName(constraint.referencedSchema),
        referencedTable: normalizedName(constraint.referencedTable),
        referencedColumns: (constraint.referencedColumns ?? []).map(normalizedName),
        expression: normalizedSql(constraint.expression),
        onUpdate: normalizedName(constraint.onUpdate).toUpperCase(),
        onDelete: normalizedName(constraint.onDelete).toUpperCase(),
        enforced: constraint.enforced ?? null,
    });
}

function tableEvidence(table: SchemaTable | undefined, index?: SchemaIndex) {
    const statistics = table?.statistics;
    return {
        estimatedRows: statistics?.estimatedRows ?? null,
        tableBytes: statistics?.totalBytes ?? null,
        indexScans: index?.scans ?? null,
        statisticsSource: statistics?.source ?? 'unknown',
    };
}

function risk(input: {
    objectType: SchemaChangeObjectType;
    changeType: SchemaChangeType;
    attribute?: string | null;
    currentValue?: string | null;
    desiredValue?: string | null;
    constraintKind?: SchemaConstraintKind;
    indexPrimary?: boolean;
    indexUnique?: boolean;
    desiredNullable?: boolean | null;
    desiredDefault?: string | null;
    typeChange?: ReturnType<typeof typeChangeKind>;
}): SchemaChangeRisk {
    if (input.changeType === 'removed') {
        if (input.objectType === 'table' || input.objectType === 'column' || input.objectType === 'view' || input.objectType === 'materialized_view') {
            return {
                level: 'high',
                breaking: true,
                code: `${input.objectType}_removed`,
                reason: `Removing this ${input.objectType.replace('_', ' ')} can break dependent queries or applications.`,
            };
        }
        if (input.objectType === 'constraint' && (input.constraintKind === 'primary_key' || input.constraintKind === 'unique')) {
            return { level: 'high', breaking: true, code: 'key_constraint_removed', reason: 'Removing a primary or unique constraint changes the database contract.' };
        }
        if (input.objectType === 'index' && (input.indexPrimary || input.indexUnique)) {
            return { level: 'high', breaking: true, code: 'unique_index_removed', reason: 'Removing a primary or unique index changes integrity or key behavior.' };
        }
        return { level: 'medium', breaking: false, code: `${input.objectType}_removed`, reason: 'Removal may affect performance or dependent database behavior.' };
    }

    if (input.changeType === 'added') {
        if (input.objectType === 'column' && input.desiredNullable === false) {
            if (!input.desiredDefault) {
                return {
                    level: 'high',
                    breaking: true,
                    code: 'required_column_without_default',
                    reason: 'Existing rows require a value before this non-null column can be added safely.',
                };
            }
            return {
                level: 'medium',
                breaking: false,
                code: 'required_column_with_default',
                reason: 'Adding a non-null column with a default may rewrite or lock a populated table.',
            };
        }
        return { level: 'low', breaking: false, code: `${input.objectType}_added`, reason: `Adding this ${input.objectType.replace('_', ' ')} is additive.` };
    }

    if (input.objectType === 'column' && input.attribute === 'data_type') {
        if (input.typeChange === 'widening') {
            return { level: 'low', breaking: false, code: 'column_type_widened', reason: 'The desired type can represent at least the current value range.' };
        }
        return {
            level: 'high',
            breaking: true,
            code: input.typeChange === 'narrowing' ? 'column_type_narrowed' : 'column_type_incompatible',
            reason: input.typeChange === 'narrowing' ? 'The desired type has a narrower value range.' : 'The type change is not known to be backward compatible.',
        };
    }

    if (input.objectType === 'column' && input.attribute === 'nullable') {
        return {
            level: input.desiredValue === 'false' ? 'high' : 'medium',
            breaking: input.desiredValue === 'false',
            code: input.desiredValue === 'false' ? 'column_made_required' : 'column_made_nullable',
            reason: input.desiredValue === 'false' ? 'Existing null values can prevent this change.' : 'Making a column nullable weakens the data contract.',
        };
    }

    if (input.objectType === 'constraint' && (input.constraintKind === 'primary_key' || input.constraintKind === 'unique')) {
        return { level: 'high', breaking: true, code: 'key_constraint_modified', reason: 'Changing a primary or unique constraint changes key semantics.' };
    }

    if (input.changeType === 'renamed') {
        return { level: 'low', breaking: false, code: `${input.objectType}_renamed`, reason: 'The object definition is equivalent, but its database name differs.' };
    }

    return { level: 'medium', breaking: false, code: `${input.objectType}_modified`, reason: 'The desired definition changes existing database behavior.' };
}

type ChangeDraft = Omit<SchemaChange, 'changeId'>;

function makeChange(draft: ChangeDraft): SchemaChange {
    const changeId = stableSchemaHash({
        objectType: draft.objectType,
        changeType: draft.changeType,
        objectPath: draft.objectPath,
        attribute: draft.attribute,
        currentValue: draft.currentValue,
        desiredValue: draft.desiredValue,
    });
    return { changeId, ...draft };
}

function scalar(value: unknown): string | null {
    if (value === null || typeof value === 'undefined') return null;
    if (typeof value === 'string') return value;
    return stableStringify(value);
}

function tablePath(table: SchemaTable) {
    return qualifiedSchemaName(table.schema, table.name);
}

function compareColumns(family: SchemaDialectFamily, current: SchemaTable, desired: SchemaTable, canCompareExistence: boolean, changes: SchemaChange[]) {
    const currentColumns = mapBy(current.columns, column => normalizedName(column.name));
    const desiredColumns = mapBy(desired.columns, column => normalizedName(column.name));
    const names = new Set([...currentColumns.keys(), ...desiredColumns.keys()]);

    for (const name of [...names].sort()) {
        const left = currentColumns.get(name);
        const right = desiredColumns.get(name);
        const objectPath = `${tablePath(desired ?? current)}.${name}`;
        if (!left || !right) {
            if (!canCompareExistence) continue;
            const changeType = left ? 'removed' : 'added';
            const target = right ?? left!;
            changes.push(
                makeChange({
                    objectType: 'column',
                    changeType,
                    schema: current.schema,
                    table: current.name,
                    objectName: name,
                    objectPath,
                    attribute: null,
                    currentValue: left ? scalar(left) : null,
                    desiredValue: right ? scalar(right) : null,
                    risk: risk({
                        objectType: 'column',
                        changeType,
                        desiredNullable: target.nullable,
                        desiredDefault: target.defaultExpression,
                    }),
                    evidence: tableEvidence(current),
                }),
            );
            continue;
        }

        const typeChange = typeChangeKind(family, left.dataType, right.dataType);
        if (typeChange !== 'equal') {
            changes.push(
                makeChange({
                    objectType: 'column',
                    changeType: 'modified',
                    schema: current.schema,
                    table: current.name,
                    objectName: name,
                    objectPath,
                    attribute: 'data_type',
                    currentValue: left.dataType ?? null,
                    desiredValue: right.dataType ?? null,
                    risk: risk({ objectType: 'column', changeType: 'modified', attribute: 'data_type', typeChange }),
                    evidence: tableEvidence(current),
                }),
            );
        }
        if (left.nullable !== right.nullable) {
            changes.push(
                makeChange({
                    objectType: 'column',
                    changeType: 'modified',
                    schema: current.schema,
                    table: current.name,
                    objectName: name,
                    objectPath,
                    attribute: 'nullable',
                    currentValue: scalar(left.nullable),
                    desiredValue: scalar(right.nullable),
                    risk: risk({
                        objectType: 'column',
                        changeType: 'modified',
                        attribute: 'nullable',
                        currentValue: scalar(left.nullable),
                        desiredValue: scalar(right.nullable),
                    }),
                    evidence: tableEvidence(current),
                }),
            );
        }
        if (normalizedSql(left.defaultExpression) !== normalizedSql(right.defaultExpression)) {
            changes.push(
                makeChange({
                    objectType: 'column',
                    changeType: 'modified',
                    schema: current.schema,
                    table: current.name,
                    objectName: name,
                    objectPath,
                    attribute: 'default',
                    currentValue: left.defaultExpression ?? null,
                    desiredValue: right.defaultExpression ?? null,
                    risk: risk({ objectType: 'column', changeType: 'modified', attribute: 'default' }),
                    evidence: tableEvidence(current),
                }),
            );
        }
    }
}

function compareNamedObjects<T extends SchemaIndex | SchemaConstraint>(params: {
    objectType: 'index' | 'constraint';
    current: T[];
    desired: T[];
    table: SchemaTable;
    canCompareExistence: boolean;
    signature: (value: T) => string;
    changes: SchemaChange[];
}) {
    const currentByName = mapBy(params.current, item => normalizedName(item.name));
    const desiredByName = mapBy(params.desired, item => normalizedName(item.name));
    const matchedCurrent = new Set<string>();
    const matchedDesired = new Set<string>();

    for (const [name, left] of currentByName) {
        const right = desiredByName.get(name);
        if (!right) continue;
        matchedCurrent.add(name);
        matchedDesired.add(name);
        if (params.signature(left) === params.signature(right)) continue;
        const constraint = params.objectType === 'constraint' ? (right as SchemaConstraint) : null;
        const index = params.objectType === 'index' ? (right as SchemaIndex) : null;
        params.changes.push(
            makeChange({
                objectType: params.objectType,
                changeType: 'modified',
                schema: params.table.schema,
                table: params.table.name,
                objectName: name,
                objectPath: `${tablePath(params.table)}.${name}`,
                attribute: 'definition',
                currentValue: scalar(left),
                desiredValue: scalar(right),
                risk: risk({
                    objectType: params.objectType,
                    changeType: 'modified',
                    constraintKind: constraint?.kind,
                    indexPrimary: index?.primary,
                    indexUnique: index?.unique,
                }),
                evidence: tableEvidence(params.table, index ?? undefined),
            }),
        );
    }

    for (const [leftName, left] of currentByName) {
        if (matchedCurrent.has(leftName)) continue;
        const signature = params.signature(left);
        const renamed = [...desiredByName.entries()].find(([rightName, right]) => !matchedDesired.has(rightName) && params.signature(right) === signature);
        if (!renamed) continue;
        const [rightName, right] = renamed;
        matchedCurrent.add(leftName);
        matchedDesired.add(rightName);
        params.changes.push(
            makeChange({
                objectType: params.objectType,
                changeType: 'renamed',
                schema: params.table.schema,
                table: params.table.name,
                objectName: rightName,
                objectPath: `${tablePath(params.table)}.${rightName}`,
                attribute: 'name',
                currentValue: leftName,
                desiredValue: rightName,
                risk: risk({ objectType: params.objectType, changeType: 'renamed' }),
                evidence: tableEvidence(params.table, params.objectType === 'index' ? (right as SchemaIndex) : undefined),
            }),
        );
    }

    if (!params.canCompareExistence) return;

    for (const [name, item] of currentByName) {
        if (matchedCurrent.has(name)) continue;
        const constraint = params.objectType === 'constraint' ? (item as SchemaConstraint) : null;
        const index = params.objectType === 'index' ? (item as SchemaIndex) : null;
        params.changes.push(
            makeChange({
                objectType: params.objectType,
                changeType: 'removed',
                schema: params.table.schema,
                table: params.table.name,
                objectName: name,
                objectPath: `${tablePath(params.table)}.${name}`,
                attribute: null,
                currentValue: scalar(item),
                desiredValue: null,
                risk: risk({
                    objectType: params.objectType,
                    changeType: 'removed',
                    constraintKind: constraint?.kind,
                    indexPrimary: index?.primary,
                    indexUnique: index?.unique,
                }),
                evidence: tableEvidence(params.table, index ?? undefined),
            }),
        );
    }
    for (const [name, item] of desiredByName) {
        if (matchedDesired.has(name)) continue;
        const constraint = params.objectType === 'constraint' ? (item as SchemaConstraint) : null;
        const index = params.objectType === 'index' ? (item as SchemaIndex) : null;
        params.changes.push(
            makeChange({
                objectType: params.objectType,
                changeType: 'added',
                schema: params.table.schema,
                table: params.table.name,
                objectName: name,
                objectPath: `${tablePath(params.table)}.${name}`,
                attribute: null,
                currentValue: null,
                desiredValue: scalar(item),
                risk: risk({
                    objectType: params.objectType,
                    changeType: 'added',
                    constraintKind: constraint?.kind,
                    indexPrimary: index?.primary,
                    indexUnique: index?.unique,
                }),
                evidence: tableEvidence(params.table, index ?? undefined),
            }),
        );
    }
}

function compareViews(current: SchemaSnapshot, desired: SchemaSnapshot, coverage: SchemaSnapshotCoverage, changes: SchemaChange[]) {
    const currentViews = mapBy(current.views, viewKey);
    const desiredViews = mapBy(desired.views, viewKey);
    const keys = new Set([...currentViews.keys(), ...desiredViews.keys()]);
    const canCompareExistence = coverageComparable(coverage.views);

    for (const key of [...keys].sort()) {
        const left = currentViews.get(key);
        const right = desiredViews.get(key);
        if (!left || !right) {
            if (!canCompareExistence) continue;
            const target = right ?? left!;
            const changeType = left ? 'removed' : 'added';
            changes.push(
                makeChange({
                    objectType: target.kind,
                    changeType,
                    schema: target.schema,
                    table: null,
                    objectName: target.name,
                    objectPath: qualifiedSchemaName(target.schema, target.name),
                    attribute: null,
                    currentValue: left?.definition ?? null,
                    desiredValue: right?.definition ?? null,
                    risk: risk({ objectType: target.kind, changeType }),
                }),
            );
            continue;
        }
        if (normalizedSql(left.definition) === normalizedSql(right.definition)) continue;
        changes.push(
            makeChange({
                objectType: right.kind,
                changeType: 'modified',
                schema: right.schema,
                table: null,
                objectName: right.name,
                objectPath: qualifiedSchemaName(right.schema, right.name),
                attribute: 'definition',
                currentValue: left.definition,
                desiredValue: right.definition,
                risk: risk({ objectType: right.kind, changeType: 'modified', attribute: 'definition' }),
            }),
        );
    }
}

function compareTableAttributes(current: SchemaTable, desired: SchemaTable, changes: SchemaChange[]) {
    const left = current.attributes ?? {};
    const right = desired.attributes ?? {};
    for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
        if (scalar(left[key]) === scalar(right[key])) continue;
        changes.push(
            makeChange({
                objectType: 'table',
                changeType: 'modified',
                schema: desired.schema,
                table: desired.name,
                objectName: desired.name,
                objectPath: tablePath(desired),
                attribute: key,
                currentValue: scalar(left[key]),
                desiredValue: scalar(right[key]),
                risk: risk({ objectType: 'table', changeType: 'modified', attribute: key }),
                evidence: tableEvidence(current),
            }),
        );
    }
}

export function compareSchemaSnapshots(current: SchemaSnapshot, desired: SchemaSnapshot): SchemaComparisonResult {
    if (current.family !== desired.family) {
        throw new Error(`Schema comparison requires the same dialect family. Received ${current.family} and ${desired.family}.`);
    }

    const coverage = mergeCoverage(current.coverage, desired.coverage);
    const changes: SchemaChange[] = [];
    const currentTables = mapBy(current.tables, tableKey);
    const desiredTables = mapBy(desired.tables, tableKey);
    const tableKeys = new Set([...currentTables.keys(), ...desiredTables.keys()]);
    const canCompareTables = coverageComparable(coverage.tables);

    for (const key of [...tableKeys].sort()) {
        const left = currentTables.get(key);
        const right = desiredTables.get(key);
        if (!left || !right) {
            if (!canCompareTables) continue;
            const target = right ?? left!;
            const changeType = left ? 'removed' : 'added';
            changes.push(
                makeChange({
                    objectType: 'table',
                    changeType,
                    schema: target.schema,
                    table: target.name,
                    objectName: target.name,
                    objectPath: tablePath(target),
                    attribute: null,
                    currentValue: left ? scalar({ columns: left.columns.length, indexes: left.indexes.length, constraints: left.constraints.length }) : null,
                    desiredValue: right ? scalar({ columns: right.columns.length, indexes: right.indexes.length, constraints: right.constraints.length }) : null,
                    risk: risk({ objectType: 'table', changeType }),
                    evidence: tableEvidence(left),
                }),
            );
            continue;
        }

        compareTableAttributes(left, right, changes);
        compareColumns(current.family, left, right, coverageComparable(coverage.columns), changes);
        compareNamedObjects({
            objectType: 'index',
            current: left.indexes,
            desired: right.indexes,
            table: left,
            canCompareExistence: coverageComparable(coverage.indexes),
            signature: indexSignature,
            changes,
        });
        compareNamedObjects({
            objectType: 'constraint',
            current: left.constraints,
            desired: right.constraints,
            table: left,
            canCompareExistence: coverageComparable(coverage.constraints),
            signature: constraintSignature,
            changes,
        });
    }

    compareViews(current, desired, coverage, changes);
    changes.sort(
        (left, right) =>
            RISK_ORDER[left.risk.level] - RISK_ORDER[right.risk.level] ||
            left.objectPath.localeCompare(right.objectPath) ||
            left.changeType.localeCompare(right.changeType) ||
            (left.attribute ?? '').localeCompare(right.attribute ?? ''),
    );

    const hasCoverageGap = COVERAGE_KINDS.some(kind => coverage[kind] === 'partial' || coverage[kind] === 'unavailable');
    const breakingHigh = changes.some(change => change.risk.level === 'high' && change.risk.breaking);
    const materialRisk = changes.some(change => change.risk.level === 'high' || change.risk.level === 'medium');
    const readiness: SchemaComparisonReadiness = breakingHigh ? 'unsafe' : hasCoverageGap ? 'unknown' : materialRisk ? 'review_required' : 'compatible';
    const summary: SchemaComparisonSummary = {
        totalChanges: changes.length,
        breakingChanges: changes.filter(change => change.risk.breaking).length,
        added: changes.filter(change => change.changeType === 'added').length,
        removed: changes.filter(change => change.changeType === 'removed').length,
        modified: changes.filter(change => change.changeType === 'modified').length,
        renamed: changes.filter(change => change.changeType === 'renamed').length,
        highRisk: changes.filter(change => change.risk.level === 'high').length,
        mediumRisk: changes.filter(change => change.risk.level === 'medium').length,
        lowRisk: changes.filter(change => change.risk.level === 'low').length,
        unknownRisk: changes.filter(change => change.risk.level === 'unknown').length,
        readiness,
    };
    const warnings = [
        ...(current.warnings ?? []).map(warning => `Current: ${warning}`),
        ...(desired.warnings ?? []).map(warning => `Desired: ${warning}`),
        ...COVERAGE_KINDS.filter(kind => coverage[kind] === 'partial' || coverage[kind] === 'unavailable').map(
            kind => `${kind} coverage is ${coverage[kind]}; missing objects were not treated as removals.`,
        ),
    ];

    return {
        version: 1,
        family: current.family,
        currentHash: current.contentHash,
        desiredHash: desired.contentHash,
        coverage,
        summary,
        changes,
        warnings,
    };
}

export function schemaChangesToResultRows(changes: SchemaChange[]) {
    return changes.map(change => ({
        changeId: change.changeId,
        objectType: change.objectType,
        changeType: change.changeType,
        schema: change.schema,
        table: change.table,
        objectName: change.objectName,
        objectPath: change.objectPath,
        attribute: change.attribute,
        currentValue: change.currentValue,
        desiredValue: change.desiredValue,
        riskLevel: change.risk.level,
        breaking: change.risk.breaking,
        riskCode: change.risk.code,
        riskReason: change.risk.reason,
        estimatedRows: change.evidence?.estimatedRows ?? null,
        tableBytes: change.evidence?.tableBytes ?? null,
        indexScans: change.evidence?.indexScans ?? null,
        statisticsSource: change.evidence?.statisticsSource ?? 'unknown',
        changeCount: 1,
    }));
}

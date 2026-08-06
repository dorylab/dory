import type { DriverType, TableMutationAtomicity, TableMutationDialect, TableMutationValue, TableUpdateBatch, TableUpdateCell, TableUpdateRow } from './types';

export const TABLE_MUTATION_CONFLICT_CODE = 'TABLE_MUTATION_CONFLICT';
export const MAX_TABLE_UPDATE_ROWS = 100;
export const MAX_TABLE_UPDATE_CHANGES_PER_ROW = 200;

export class TableMutationConflictError extends Error {
    readonly code = TABLE_MUTATION_CONFLICT_CODE;

    constructor(
        message = 'The row changed after it was loaded. Refresh the table and review your pending changes.',
        readonly rowIndex?: number,
    ) {
        super(message);
        this.name = 'TableMutationConflictError';
    }
}

export const TABLE_MUTATION_IDENTITY_NOT_UNIQUE_CODE = 'TABLE_MUTATION_IDENTITY_NOT_UNIQUE';

export class TableMutationIdentityNotUniqueError extends Error {
    readonly code = TABLE_MUTATION_IDENTITY_NOT_UNIQUE_CODE;

    constructor(
        message = 'The selected row identity does not uniquely identify a row.',
        readonly rowIndex?: number,
    ) {
        super(message);
        this.name = 'TableMutationIdentityNotUniqueError';
    }
}

export const TABLE_MUTATION_PARTIAL_COMMIT_CODE = 'TABLE_MUTATION_PARTIAL_COMMIT';

export class TableMutationPartialCommitError extends Error {
    readonly code = TABLE_MUTATION_PARTIAL_COMMIT_CODE;

    constructor(
        readonly committedRowIndexes: number[],
        readonly pendingRowIndexes: number[],
        message = 'Some ClickHouse rows were updated, but the full batch could not be verified.',
    ) {
        super(message);
        this.name = 'TableMutationPartialCommitError';
    }
}

export type TableMutationStatement = {
    sql: string;
    params: TableMutationValue[];
    previewSql: string;
    rowIndex: number;
    key: Record<string, TableMutationValue>;
    changedColumns: string[];
};

export type TableIdentityCountStatement = {
    sql: string;
    params: TableMutationValue[];
    rowIndex: number;
};

type DialectConfig = {
    parameter: (index: number) => string;
    quoteIdentifier: (identifier: string) => string;
    nullSafeEquals: (left: string, right: string) => string;
};

export type TableMutationProfile = {
    dialect: TableMutationDialect;
    atomicity: TableMutationAtomicity;
};

const TABLE_MUTATION_PROFILES: Record<DriverType, TableMutationProfile> = {
    clickhouse: { dialect: 'clickhouse', atomicity: 'best-effort' },
    'cloudflare-d1': { dialect: 'sqlite', atomicity: 'atomic' },
    duckdb: { dialect: 'duckdb', atomicity: 'atomic' },
    mariadb: { dialect: 'mysql', atomicity: 'atomic' },
    mysql: { dialect: 'mysql', atomicity: 'atomic' },
    neon: { dialect: 'postgres', atomicity: 'atomic' },
    oracle: { dialect: 'oracle', atomicity: 'atomic' },
    postgres: { dialect: 'postgres', atomicity: 'atomic' },
    sqlite: { dialect: 'sqlite', atomicity: 'atomic' },
    snowflake: { dialect: 'snowflake', atomicity: 'atomic' },
    supabase: { dialect: 'postgres', atomicity: 'atomic' },
    sqlserver: { dialect: 'sqlserver', atomicity: 'atomic' },
};

export function getTableMutationProfile(driver?: string | null): TableMutationProfile | null {
    return driver && Object.prototype.hasOwnProperty.call(TABLE_MUTATION_PROFILES, driver) ? TABLE_MUTATION_PROFILES[driver as DriverType] : null;
}

export function isEditableTableMutationColumnType(columnType?: string | null): boolean {
    if (!columnType?.trim()) return false;
    return !/(json|array|struct|tuple|map|blob|binary|bytea|geometry|geography|interval|object|variant)/i.test(columnType);
}

function quoteDouble(identifier: string) {
    return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteBacktick(identifier: string) {
    return `\`${identifier.replaceAll('`', '``')}\``;
}

function quoteBracket(identifier: string) {
    return `[${identifier.replaceAll(']', ']]')}]`;
}

function getDialectConfig(dialect: TableMutationDialect): DialectConfig {
    switch (dialect) {
        case 'postgres':
            return {
                parameter: index => `$${index}`,
                quoteIdentifier: quoteDouble,
                nullSafeEquals: (left, right) => `${left} IS NOT DISTINCT FROM ${right}`,
            };
        case 'mysql':
            return {
                parameter: () => '?',
                quoteIdentifier: quoteBacktick,
                nullSafeEquals: (left, right) => `${left} <=> ${right}`,
            };
        case 'sqlite':
            return {
                parameter: () => '?',
                quoteIdentifier: quoteDouble,
                nullSafeEquals: (left, right) => `${left} IS ${right}`,
            };
        case 'duckdb':
            return {
                parameter: () => '?',
                quoteIdentifier: quoteDouble,
                nullSafeEquals: (left, right) => `${left} IS NOT DISTINCT FROM ${right}`,
            };
        case 'oracle':
            return {
                parameter: index => `:p${index}`,
                quoteIdentifier: quoteDouble,
                nullSafeEquals: (left, right) => `(${left} = ${right} OR (${left} IS NULL AND ${right} IS NULL))`,
            };
        case 'snowflake':
            return {
                parameter: () => '?',
                quoteIdentifier: quoteDouble,
                nullSafeEquals: (left, right) => `${left} IS NOT DISTINCT FROM ${right}`,
            };
        case 'sqlserver':
            return {
                parameter: index => `@p${index}`,
                quoteIdentifier: quoteBracket,
                nullSafeEquals: (left, right) => `(${left} = ${right} OR (${left} IS NULL AND ${right} IS NULL))`,
            };
        case 'clickhouse':
            return {
                parameter: index => `{p${index}:String}`,
                quoteIdentifier: quoteBacktick,
                nullSafeEquals: (left, right) => `${left} IS NOT DISTINCT FROM ${right}`,
            };
    }
}

function splitTableReference(table: string) {
    return table
        .split('.')
        .map(part => part.trim())
        .filter(Boolean);
}

export function getQualifiedTableParts(dialect: TableMutationDialect, database: string, table: string): string[] {
    const tableParts = splitTableReference(table);

    if (dialect === 'duckdb') {
        if (tableParts.length >= 2) return [database, ...tableParts.slice(-2)];
        return [database, 'main', tableParts[0] ?? table];
    }

    if (dialect === 'postgres' && tableParts.length >= 2) {
        return tableParts.slice(-2);
    }

    if (dialect === 'postgres') {
        return ['public', tableParts[0] ?? table];
    }

    if (dialect === 'oracle') {
        return tableParts.length >= 2 ? tableParts.slice(-2) : [tableParts[0] ?? table];
    }

    if (dialect === 'snowflake') {
        return tableParts.length >= 2 ? [database, ...tableParts.slice(-2)] : [database, 'PUBLIC', tableParts[0] ?? table];
    }

    if (dialect === 'sqlserver') {
        return tableParts.length >= 2 ? tableParts.slice(-2) : ['dbo', tableParts[0] ?? table];
    }

    if (dialect === 'clickhouse') {
        return [database, tableParts.at(-1) ?? table];
    }

    return [database, tableParts.at(-1) ?? table];
}

function formatPreviewLiteral(value: TableMutationValue): string {
    if (value === null) return 'NULL';
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error('Table mutation values must be finite numbers.');
        return String(value);
    }
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    return `'${value.replaceAll("'", "''")}'`;
}

function hasSameValue(left: TableMutationValue, right: TableMutationValue) {
    return Object.is(left, right);
}

function validateRow(row: TableUpdateRow, identityColumns: string[], rowIndex: number): TableUpdateCell[] {
    const keyColumns = Object.keys(row.key);
    if (keyColumns.length !== identityColumns.length || identityColumns.some(column => !Object.prototype.hasOwnProperty.call(row.key, column))) {
        throw new Error(`Row ${rowIndex + 1} does not contain the complete row identity.`);
    }

    const seen = new Set<string>();
    const changes = row.changes.filter(change => {
        if (!change.column || seen.has(change.column)) {
            throw new Error(`Row ${rowIndex + 1} contains a duplicate or empty changed column.`);
        }
        seen.add(change.column);
        if (identityColumns.includes(change.column)) {
            throw new Error(`Row identity column "${change.column}" is read-only.`);
        }
        return !hasSameValue(change.originalValue, change.nextValue);
    });

    if (!changes.length) {
        throw new Error(`Row ${rowIndex + 1} has no effective changes.`);
    }

    return changes;
}

export function buildTableUpdateStatements(dialect: TableMutationDialect, input: TableUpdateBatch): TableMutationStatement[] {
    const config = getDialectConfig(dialect);
    if (!input.database.trim() || !input.table.trim()) {
        throw new Error('A database and table are required for table updates.');
    }
    if (!input.identityColumns.length) {
        throw new Error('A row identity is required for table updates.');
    }
    if (!input.rows.length) {
        throw new Error('At least one changed row is required.');
    }

    const tableSql = getQualifiedTableParts(dialect, input.database, input.table).map(config.quoteIdentifier).join('.');

    return input.rows.map((row, rowIndex) => {
        const changes = validateRow(row, input.identityColumns, rowIndex);
        const params: TableMutationValue[] = [];
        const previewSet: string[] = [];
        const setSql = changes.map(change => {
            params.push(change.nextValue);
            previewSet.push(`${config.quoteIdentifier(change.column)} = ${formatPreviewLiteral(change.nextValue)}`);
            return `${config.quoteIdentifier(change.column)} = ${config.parameter(params.length)}`;
        });

        const previewWhere: string[] = [];
        const whereSql: string[] = [];
        for (const identityColumn of input.identityColumns) {
            const value = row.key[identityColumn]!;
            params.push(value);
            const quoted = config.quoteIdentifier(identityColumn);
            whereSql.push(config.nullSafeEquals(quoted, config.parameter(params.length)));
            previewWhere.push(config.nullSafeEquals(quoted, formatPreviewLiteral(value)));
        }

        for (const change of changes) {
            params.push(change.originalValue);
            const quoted = config.quoteIdentifier(change.column);
            whereSql.push(config.nullSafeEquals(quoted, config.parameter(params.length)));
            previewWhere.push(config.nullSafeEquals(quoted, formatPreviewLiteral(change.originalValue)));
        }

        return {
            sql: `UPDATE ${tableSql}\nSET ${setSql.join(', ')}\nWHERE ${whereSql.join(' AND ')}`,
            params,
            previewSql: `UPDATE ${tableSql}\nSET ${previewSet.join(', ')}\nWHERE ${previewWhere.join(' AND ')};`,
            rowIndex,
            key: row.key,
            changedColumns: changes.map(change => change.column),
        };
    });
}

export function buildTableIdentityCountStatements(dialect: TableMutationDialect, input: TableUpdateBatch): TableIdentityCountStatement[] {
    const config = getDialectConfig(dialect);
    if (!input.identityColumns.length) {
        throw new Error('A row identity is required for table updates.');
    }
    const tableSql = getQualifiedTableParts(dialect, input.database, input.table).map(config.quoteIdentifier).join('.');

    return input.rows.map((row, rowIndex) => {
        const params: TableMutationValue[] = [];
        const whereSql = input.identityColumns.map(column => {
            params.push(row.key[column]!);
            return config.nullSafeEquals(config.quoteIdentifier(column), config.parameter(params.length));
        });
        return {
            sql: `SELECT COUNT(*) AS identityCount FROM ${tableSql} WHERE ${whereSql.join(' AND ')}`,
            params,
            rowIndex,
        };
    });
}

export function bindTableMutationParams(dialect: TableMutationDialect, params: TableMutationValue[]): TableMutationValue[] | Record<string, TableMutationValue> {
    if (dialect === 'oracle' || dialect === 'sqlserver' || dialect === 'clickhouse') {
        return Object.fromEntries(params.map((value, index) => [`p${index + 1}`, value]));
    }
    return params;
}

export function buildTableUpdatePreview(dialect: TableMutationDialect, input: TableUpdateBatch) {
    if (dialect === 'clickhouse') return buildClickhouseUpdatePreview(input);
    return buildTableUpdateStatements(dialect, input)
        .map(statement => statement.previewSql)
        .join('\n\n');
}

function buildClickhouseUpdatePreview(input: TableUpdateBatch) {
    const tableSql = getQualifiedTableParts('clickhouse', input.database, input.table).map(quoteBacktick).join('.');
    const rows = input.rows.map((row, rowIndex) => {
        const changes = validateRow(row, input.identityColumns, rowIndex);
        const identityCondition = input.identityColumns
            .map(column => (row.key[column] === null ? `isNull(${quoteBacktick(column)})` : `${quoteBacktick(column)} = ${formatPreviewLiteral(row.key[column]!)}`))
            .join(' AND ');
        const originalCondition = changes
            .map(change =>
                change.originalValue === null ? `isNull(${quoteBacktick(change.column)})` : `${quoteBacktick(change.column)} = ${formatPreviewLiteral(change.originalValue)}`,
            )
            .join(' AND ');
        return {
            changes,
            fullCondition: [identityCondition, originalCondition].filter(Boolean).join(' AND '),
        };
    });
    const changedColumns = Array.from(new Set(rows.flatMap(row => row.changes.map(change => change.column))));
    const assignments = changedColumns.map(column => {
        const cases = rows.flatMap(row => {
            const change = row.changes.find(item => item.column === column);
            return change ? [row.fullCondition, formatPreviewLiteral(change.nextValue)] : [];
        });
        return `${quoteBacktick(column)} = multiIf(${[...cases, quoteBacktick(column)].join(', ')})`;
    });

    return `ALTER TABLE ${tableSql}\nUPDATE ${assignments.join(',\n    ')}\nWHERE ${rows.map(row => `(${row.fullCondition})`).join(' OR ')}\nSETTINGS mutations_sync = 1;`;
}

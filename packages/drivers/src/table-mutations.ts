import type { TableMutationDialect, TableMutationValue, TableUpdateBatch, TableUpdateCell, TableUpdateRow } from './types';

export const TABLE_MUTATION_CONFLICT_CODE = 'TABLE_MUTATION_CONFLICT';

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

export type TableMutationStatement = {
    sql: string;
    params: TableMutationValue[];
    previewSql: string;
    rowIndex: number;
    key: Record<string, TableMutationValue>;
    changedColumns: string[];
};

type DialectConfig = {
    parameter: (index: number) => string;
    quoteIdentifier: (identifier: string) => string;
    nullSafeEquals: (left: string, right: string) => string;
};

function quoteDouble(identifier: string) {
    return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteBacktick(identifier: string) {
    return `\`${identifier.replaceAll('`', '``')}\``;
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

function validateRow(row: TableUpdateRow, primaryKeyColumns: string[], rowIndex: number): TableUpdateCell[] {
    const keyColumns = Object.keys(row.key);
    if (keyColumns.length !== primaryKeyColumns.length || primaryKeyColumns.some(column => !Object.prototype.hasOwnProperty.call(row.key, column))) {
        throw new Error(`Row ${rowIndex + 1} does not contain the complete primary key.`);
    }

    const seen = new Set<string>();
    const changes = row.changes.filter(change => {
        if (!change.column || seen.has(change.column)) {
            throw new Error(`Row ${rowIndex + 1} contains a duplicate or empty changed column.`);
        }
        seen.add(change.column);
        if (primaryKeyColumns.includes(change.column)) {
            throw new Error(`Primary key column "${change.column}" is read-only.`);
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
    if (!input.primaryKeyColumns.length) {
        throw new Error('A primary key is required for table updates.');
    }
    if (!input.rows.length) {
        throw new Error('At least one changed row is required.');
    }

    const tableSql = getQualifiedTableParts(dialect, input.database, input.table).map(config.quoteIdentifier).join('.');

    return input.rows.map((row, rowIndex) => {
        const changes = validateRow(row, input.primaryKeyColumns, rowIndex);
        const params: TableMutationValue[] = [];
        const previewSet: string[] = [];
        const setSql = changes.map(change => {
            params.push(change.nextValue);
            previewSet.push(`${config.quoteIdentifier(change.column)} = ${formatPreviewLiteral(change.nextValue)}`);
            return `${config.quoteIdentifier(change.column)} = ${config.parameter(params.length)}`;
        });

        const previewWhere: string[] = [];
        const whereSql: string[] = [];
        for (const primaryKeyColumn of input.primaryKeyColumns) {
            const value = row.key[primaryKeyColumn]!;
            params.push(value);
            const quoted = config.quoteIdentifier(primaryKeyColumn);
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

export function buildTableUpdatePreview(dialect: TableMutationDialect, input: TableUpdateBatch) {
    return buildTableUpdateStatements(dialect, input)
        .map(statement => statement.previewSql)
        .join('\n\n');
}

import type { ConnectionMetadataAPI, DatabaseObjectRow, SchemaGraphOptions, SchemaGraphResult, TableColumnInfo } from '@dory/drivers/types';
import { buildSchemaGraphResult, type SchemaGraphRelationshipInput, type SchemaGraphTableInput } from '@dory/drivers/core';

import type { DuckDbDatasource } from '../datasource';
import { getDuckDbDatabases, getDuckDbTableColumns, getDuckDbTables } from '../runtime';

export type DuckDbMetadataAPI = Required<Pick<ConnectionMetadataAPI, 'getDatabases' | 'getSchemaGraph' | 'getTableColumns' | 'getTables' | 'getTablesOnly' | 'getViews'>>;

type SchemaGraphColumnRow = {
    schemaName?: string;
    tableName?: string;
    columnName?: string;
    dataType?: string | null;
    ordinal?: number | bigint | string | null;
    nullable?: string | null;
    primaryKey?: boolean | null;
};

type SchemaGraphRelationshipRow = {
    constraintName?: string | null;
    sourceSchemaName?: string;
    sourceTableName?: string;
    sourceColumnName?: string;
    targetSchemaName?: string;
    targetTableName?: string;
    targetColumnName?: string;
    sourceNullable?: string | null;
    updateAction?: string | null;
    deleteAction?: string | null;
};

async function getSchemaGraph(datasource: DuckDbDatasource, options: SchemaGraphOptions): Promise<SchemaGraphResult> {
    const [columnResult, relationshipResult] = await Promise.all([
        datasource.queryWithContext<SchemaGraphColumnRow>(
            `
                SELECT
                    cols.table_schema AS schemaName,
                    cols.table_name AS tableName,
                    cols.column_name AS columnName,
                    cols.data_type AS dataType,
                    cols.ordinal_position AS ordinal,
                    cols.is_nullable AS nullable,
                    EXISTS (
                        SELECT 1
                        FROM information_schema.table_constraints tc
                        JOIN information_schema.key_column_usage pk
                          ON pk.constraint_catalog = tc.constraint_catalog
                         AND pk.constraint_schema = tc.constraint_schema
                         AND pk.constraint_name = tc.constraint_name
                        WHERE tc.constraint_type = 'PRIMARY KEY'
                          AND tc.table_catalog = cols.table_catalog
                          AND tc.table_schema = cols.table_schema
                          AND tc.table_name = cols.table_name
                          AND pk.column_name = cols.column_name
                    ) AS primaryKey
                FROM information_schema.columns cols
                JOIN information_schema.tables tbl
                  ON tbl.table_catalog = cols.table_catalog
                 AND tbl.table_schema = cols.table_schema
                 AND tbl.table_name = cols.table_name
                WHERE cols.table_catalog = ?
                  AND tbl.table_type = 'BASE TABLE'
                ORDER BY cols.table_schema, cols.table_name, cols.ordinal_position
            `,
            { database: options.database, params: [options.database] },
        ),
        datasource
            .queryWithContext<SchemaGraphRelationshipRow>(
                `
                SELECT
                    fk.constraint_name AS constraintName,
                    fk.table_schema AS sourceSchemaName,
                    fk.table_name AS sourceTableName,
                    fk.column_name AS sourceColumnName,
                    target.table_schema AS targetSchemaName,
                    target.table_name AS targetTableName,
                    target.column_name AS targetColumnName,
                    source_col.is_nullable AS sourceNullable,
                    rc.update_rule AS updateAction,
                    rc.delete_rule AS deleteAction
                FROM information_schema.referential_constraints rc
                JOIN information_schema.key_column_usage fk
                  ON fk.constraint_catalog = rc.constraint_catalog
                 AND fk.constraint_schema = rc.constraint_schema
                 AND fk.constraint_name = rc.constraint_name
                JOIN information_schema.key_column_usage target
                  ON target.constraint_catalog = rc.unique_constraint_catalog
                 AND target.constraint_schema = rc.unique_constraint_schema
                 AND target.constraint_name = rc.unique_constraint_name
                 AND target.ordinal_position = fk.position_in_unique_constraint
                JOIN information_schema.columns source_col
                  ON source_col.table_catalog = fk.table_catalog
                 AND source_col.table_schema = fk.table_schema
                 AND source_col.table_name = fk.table_name
                 AND source_col.column_name = fk.column_name
                WHERE fk.table_catalog = ?
                ORDER BY fk.table_schema, fk.table_name, fk.constraint_name, fk.ordinal_position
            `,
                { database: options.database, params: [options.database] },
            )
            .catch(() => ({ rows: [], schemaGraphRelationshipsUnavailable: true as const })),
    ]);

    const tablesByKey = new Map<string, SchemaGraphTableInput>();
    for (const row of columnResult.rows) {
        const schema = row.schemaName?.trim();
        const tableName = row.tableName?.trim();
        const columnName = row.columnName?.trim();
        if (!schema || !tableName || !columnName) continue;
        const key = `${schema}\u0000${tableName}`;
        const table = tablesByKey.get(key) ?? { database: options.database, schema, name: tableName, columns: [] };
        const ordinal = typeof row.ordinal === 'bigint' ? Number(row.ordinal) : Number(row.ordinal);
        table.columns.push({
            name: columnName,
            dataType: row.dataType ?? null,
            ordinal: Number.isFinite(ordinal) ? ordinal : table.columns.length + 1,
            nullable: row.nullable ? row.nullable.toUpperCase() === 'YES' : null,
            isPrimaryKey: Boolean(row.primaryKey),
            isForeignKey: false,
        });
        tablesByKey.set(key, table);
    }

    const relationshipsByKey = new Map<string, SchemaGraphRelationshipInput>();
    for (const row of relationshipResult.rows) {
        const sourceSchema = row.sourceSchemaName?.trim();
        const sourceTable = row.sourceTableName?.trim();
        const sourceColumn = row.sourceColumnName?.trim();
        const targetSchema = row.targetSchemaName?.trim();
        const targetTable = row.targetTableName?.trim();
        const targetColumn = row.targetColumnName?.trim();
        if (!sourceSchema || !sourceTable || !sourceColumn || !targetSchema || !targetTable || !targetColumn) continue;
        const key = `${sourceSchema}\u0000${sourceTable}\u0000${row.constraintName ?? ''}`;
        const relationship = relationshipsByKey.get(key) ?? {
            constraintName: row.constraintName ?? null,
            sourceSchema,
            sourceTable,
            sourceColumns: [],
            targetSchema,
            targetTable,
            targetColumns: [],
            sourceUnique: null,
            sourceOptional: false,
            onUpdate: row.updateAction ?? null,
            onDelete: row.deleteAction ?? null,
        };
        relationship.sourceColumns.push(sourceColumn);
        relationship.targetColumns.push(targetColumn);
        relationship.sourceOptional = Boolean(relationship.sourceOptional) || row.sourceNullable?.toUpperCase() === 'YES';
        relationshipsByKey.set(key, relationship);
    }

    return buildSchemaGraphResult(options, Array.from(tablesByKey.values()), Array.from(relationshipsByKey.values()), {
        relationships: !('schemaGraphRelationshipsUnavailable' in relationshipResult),
        compositeForeignKeys: !('schemaGraphRelationshipsUnavailable' in relationshipResult),
        cardinality: false,
        referentialActions: !('schemaGraphRelationshipsUnavailable' in relationshipResult),
        constraintsEnforced: true,
    });
}

function getLocalFilesSchema(datasource: DuckDbDatasource) {
    const options = datasource.config.options;
    if (!options || typeof options !== 'object' || Array.isArray(options)) return null;
    if ((options as Record<string, unknown>).managedBy !== 'local-files' || (options as Record<string, unknown>).mode !== 'localFilesDataset') return null;
    const schemaName = (options as Record<string, unknown>).schemaName;
    return typeof schemaName === 'string' && schemaName.trim() ? schemaName.trim() : null;
}

function formatObjectName(name: string, schema: string | null | undefined, localFilesSchema: string | null) {
    if (!localFilesSchema || schema !== localFilesSchema) return name;
    const prefix = `${localFilesSchema}.`;
    return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

export function createDuckDbMetadataCapability(datasource: DuckDbDatasource): DuckDbMetadataAPI {
    return {
        async getDatabases() {
            return getDuckDbDatabases(datasource.getHandle());
        },
        async getTableColumns(database, table): Promise<TableColumnInfo[]> {
            return getDuckDbTableColumns(datasource.getHandle(), database, table);
        },
        async getTables(database) {
            const tables = await getDuckDbTables(datasource.getHandle(), database, undefined, getLocalFilesSchema(datasource));
            return tables.map(table => ({
                label: table.database && !database ? `${table.database}.${table.name}` : table.name,
                value: table.name,
                database: table.database,
                schema: table.schema,
            }));
        },
        async getTablesOnly(database): Promise<DatabaseObjectRow[]> {
            const localFilesSchema = getLocalFilesSchema(datasource);
            const tables = await getDuckDbTables(datasource.getHandle(), database, 'BASE TABLE', localFilesSchema);
            return tables.map(table => ({
                name: table.name,
                label: formatObjectName(table.name, table.schema, localFilesSchema),
                value: table.name,
                engine: 'duckdb',
                comment: table.comment,
            }));
        },
        async getViews(database): Promise<DatabaseObjectRow[]> {
            const localFilesSchema = getLocalFilesSchema(datasource);
            const views = await getDuckDbTables(datasource.getHandle(), database, 'VIEW', localFilesSchema);
            return views.map(view => ({
                name: view.name,
                label: formatObjectName(view.name, view.schema, localFilesSchema),
                value: view.name,
                engine: 'duckdb',
                comment: view.comment,
            }));
        },
        async getSchemaGraph(options) {
            return getSchemaGraph(datasource, options);
        },
    };
}

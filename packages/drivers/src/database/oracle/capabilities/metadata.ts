import type {
    ConnectionMetadataAPI,
    ConnectionSchemaMap,
    DatabaseFunctionDetail,
    DatabaseFunctionKind,
    DatabaseObjectRow,
    DatabaseSummary,
    DatabaseSummaryOptions,
    DatabaseSummaryRecommendation,
    DatabaseSummaryTable,
    SchemaGraphOptions,
    SchemaGraphResult,
    TableColumnInfo,
} from '@dory/drivers/types';
import { buildSchemaGraphResult, type SchemaGraphRelationshipInput, type SchemaGraphTableInput } from '@dory/drivers/core';
import type { OracleDatasource } from '../datasource';
import { normalizeOracleCatalogName, parseOracleTableReference, resolveOracleServiceName } from '../runtime';

export type OracleMetadataAPI = ConnectionMetadataAPI & {
    getSchemas: (database: string) => Promise<Array<{ label: string; value: string }>>;
    getTableColumns: (database: string, table: string) => Promise<TableColumnInfo[]>;
    getTablesOnly: (database: string) => Promise<DatabaseObjectRow[]>;
    getViews: (database: string) => Promise<DatabaseObjectRow[]>;
    getFunctions: (database?: string) => Promise<Array<{ label: string; value: string; schema?: string | null; kind?: DatabaseFunctionKind | null }>>;
    getFunctionDetail: (database: string, functionName: string, schema?: string | null) => Promise<DatabaseFunctionDetail | null>;
    getSequences: (database?: string) => Promise<DatabaseObjectRow[]>;
    getDatabaseSummary: (options: DatabaseSummaryOptions) => Promise<DatabaseSummary>;
    getDatabaseTablesDetail: (database: string) => Promise<DatabaseObjectRow[]>;
    getSchemaGraph: (options: SchemaGraphOptions) => Promise<SchemaGraphResult>;
};

type ObjectRow = {
    schemaName?: string | null;
    name?: string | null;
    type?: string | null;
    totalRows?: number | string | null;
    totalBytes?: number | string | null;
    comment?: string | null;
    lastModified?: string | Date | null;
};

type ColumnRow = {
    columnName?: string | null;
    columnType?: string | null;
    nullable?: string | null;
    defaultExpression?: string | null;
    comment?: string | null;
    primaryKey?: number | string | null;
};

type CountRow = {
    count?: number | string | null;
};

type ColumnCountRow = {
    name?: string | null;
    columnCount?: number | string | null;
};

type RelationshipRow = {
    sourceTableName?: string | null;
    targetTableName?: string | null;
};

type SchemaGraphColumnRow = {
    schemaName?: string | null;
    tableName?: string | null;
    columnName?: string | null;
    dataType?: string | null;
    ordinal?: number | string | null;
    nullable?: string | null;
    primaryKey?: number | string | null;
};

type SchemaGraphRelationshipRow = {
    constraintName?: string | null;
    sourceSchemaName?: string | null;
    sourceTableName?: string | null;
    sourceColumnName?: string | null;
    targetSchemaName?: string | null;
    targetTableName?: string | null;
    targetColumnName?: string | null;
    sourceNullable?: string | null;
    deleteAction?: string | null;
};

type FunctionRow = {
    schemaName?: string | null;
    name?: string | null;
    type?: string | null;
    status?: string | null;
    createdAt?: string | Date | null;
    modifiedAt?: string | Date | null;
};

type FunctionParameterRow = {
    name?: string | null;
    position?: number | string | null;
    dataType?: string | null;
    inOut?: string | null;
    defaulted?: string | null;
};

function toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function toIsoString(value: unknown): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function qualify(schemaName?: string | null, name?: string | null) {
    const schema = schemaName?.trim();
    const object = name?.trim();
    if (!object) return null;
    return schema ? `${schema}.${object}` : object;
}

export function normalizeOracleObjectRow(row: ObjectRow): DatabaseObjectRow | null {
    const name = qualify(row.schemaName, row.name);
    if (!name) return null;

    return {
        name,
        schema: row.schemaName ?? undefined,
        engine: row.type ?? null,
        totalBytes: toNumberOrNull(row.totalBytes),
        totalRows: toNumberOrNull(row.totalRows),
        comment: row.comment ?? null,
        lastModified: toIsoString(row.lastModified),
    };
}

function mapOracleFunctionKind(type?: string | null): DatabaseFunctionKind {
    switch ((type ?? '').toUpperCase()) {
        case 'FUNCTION':
            return 'function';
        case 'PROCEDURE':
            return 'procedure';
        case 'PACKAGE':
        case 'PACKAGE BODY':
            return 'unknown';
        default:
            return 'unknown';
    }
}

function buildRelationshipPaths(rows: RelationshipRow[]) {
    return rows
        .map(row => {
            const source = row.sourceTableName?.trim();
            const target = row.targetTableName?.trim();
            if (!source || !target || source === target) return null;
            return { path: `${source} -> ${target}` };
        })
        .filter((row): row is { path: string } => Boolean(row))
        .slice(0, 3);
}

function buildRecommendations(tables: DatabaseObjectRow[], relationshipRows: RelationshipRow[]): DatabaseSummaryRecommendation[] {
    const linked = new Set<string>();
    for (const row of relationshipRows) {
        if (row.sourceTableName) linked.add(row.sourceTableName);
        if (row.targetTableName) linked.add(row.targetTableName);
    }

    return tables
        .slice()
        .sort((a, b) => (linked.has(b.name) ? 1 : 0) - (linked.has(a.name) ? 1 : 0) || (b.totalRows ?? 0) - (a.totalRows ?? 0))
        .slice(0, 5)
        .map(table => ({
            name: table.name,
            reason: linked.has(table.name) ? 'centralInRelationships' : table.totalRows ? 'highRowVolume' : 'goodStartingPoint',
            bytes: table.totalBytes ?? null,
            rowsEstimate: table.totalRows ?? null,
        }));
}

function toSummaryTable(row: DatabaseObjectRow): DatabaseSummaryTable {
    return {
        name: row.name,
        bytes: row.totalBytes ?? null,
        rowsEstimate: row.totalRows ?? null,
        comment: row.comment ?? null,
    };
}

async function getCurrentSchema(datasource: OracleDatasource, database?: string) {
    const result = await datasource.queryWithContext<{ CURRENT_SCHEMA?: string }>('SELECT SYS_CONTEXT(:namespace, :parameter) AS "CURRENT_SCHEMA" FROM dual', {
        database,
        params: { namespace: 'USERENV', parameter: 'CURRENT_SCHEMA' },
    });
    return result.rows[0]?.CURRENT_SCHEMA ?? null;
}

async function getObjectRows(datasource: OracleDatasource, database: string, objectTypes: string[]): Promise<DatabaseObjectRow[]> {
    const result = await datasource.queryWithContext<ObjectRow>(
        `
            SELECT
                o.owner AS "schemaName",
                o.object_name AS "name",
                o.object_type AS "type",
                t.num_rows AS "totalRows",
                t.blocks * 8192 AS "totalBytes",
                c.comments AS "comment",
                o.last_ddl_time AS "lastModified"
            FROM all_objects o
            LEFT JOIN all_tables t
              ON t.owner = o.owner
             AND t.table_name = o.object_name
            LEFT JOIN all_tab_comments c
              ON c.owner = o.owner
             AND c.table_name = o.object_name
            JOIN all_users u
              ON u.username = o.owner
            WHERE o.object_type IN (${objectTypes.map((_, index) => `:type${index}`).join(', ')})
              AND u.oracle_maintained = 'N'
            ORDER BY o.owner, o.object_name
        `,
        {
            database,
            params: Object.fromEntries(objectTypes.map((type, index) => [`type${index}`, type])),
        },
    );

    return result.rows.map(normalizeOracleObjectRow).filter((row): row is DatabaseObjectRow => Boolean(row));
}

async function getSchemaGraph(datasource: OracleDatasource, options: SchemaGraphOptions): Promise<SchemaGraphResult> {
    const [columnResult, relationshipResult] = await Promise.all([
        datasource.queryWithContext<SchemaGraphColumnRow>(
            `
                SELECT
                    col.owner AS "schemaName",
                    col.table_name AS "tableName",
                    col.column_name AS "columnName",
                    col.data_type AS "dataType",
                    col.column_id AS "ordinal",
                    col.nullable AS "nullable",
                    CASE WHEN EXISTS (
                        SELECT 1
                        FROM all_constraints pk
                        JOIN all_cons_columns pk_col
                          ON pk_col.owner = pk.owner
                         AND pk_col.constraint_name = pk.constraint_name
                        WHERE pk.owner = col.owner
                          AND pk.table_name = col.table_name
                          AND pk.constraint_type = 'P'
                          AND pk_col.column_name = col.column_name
                    ) THEN 1 ELSE 0 END AS "primaryKey"
                FROM all_tab_columns col
                JOIN all_tables tbl ON tbl.owner = col.owner AND tbl.table_name = col.table_name
                JOIN all_users usr ON usr.username = col.owner
                WHERE usr.oracle_maintained = 'N'
                ORDER BY col.owner, col.table_name, col.column_id
            `,
            { database: options.database },
        ),
        datasource.queryWithContext<SchemaGraphRelationshipRow>(
            `
                SELECT
                    fk.constraint_name AS "constraintName",
                    fk.owner AS "sourceSchemaName",
                    fk.table_name AS "sourceTableName",
                    fk_col.column_name AS "sourceColumnName",
                    pk.owner AS "targetSchemaName",
                    pk.table_name AS "targetTableName",
                    pk_col.column_name AS "targetColumnName",
                    src_col.nullable AS "sourceNullable",
                    fk.delete_rule AS "deleteAction"
                FROM all_constraints fk
                JOIN all_cons_columns fk_col
                  ON fk_col.owner = fk.owner
                 AND fk_col.constraint_name = fk.constraint_name
                JOIN all_constraints pk
                  ON pk.owner = fk.r_owner
                 AND pk.constraint_name = fk.r_constraint_name
                JOIN all_cons_columns pk_col
                  ON pk_col.owner = pk.owner
                 AND pk_col.constraint_name = pk.constraint_name
                 AND pk_col.position = fk_col.position
                JOIN all_tab_columns src_col
                  ON src_col.owner = fk.owner
                 AND src_col.table_name = fk.table_name
                 AND src_col.column_name = fk_col.column_name
                JOIN all_users src_user ON src_user.username = fk.owner
                JOIN all_users tgt_user ON tgt_user.username = pk.owner
                WHERE fk.constraint_type = 'R'
                  AND src_user.oracle_maintained = 'N'
                  AND tgt_user.oracle_maintained = 'N'
                ORDER BY fk.owner, fk.table_name, fk.constraint_name, fk_col.position
            `,
            { database: options.database },
        ),
    ]);

    const tablesByKey = new Map<string, SchemaGraphTableInput>();
    for (const row of columnResult.rows) {
        const schema = row.schemaName?.trim();
        const tableName = row.tableName?.trim();
        const columnName = row.columnName?.trim();
        if (!schema || !tableName || !columnName) continue;
        const key = `${schema}\u0000${tableName}`;
        const table = tablesByKey.get(key) ?? { database: options.database, schema, name: tableName, columns: [] };
        table.columns.push({
            name: columnName,
            dataType: row.dataType ?? null,
            ordinal: toNumberOrNull(row.ordinal) ?? table.columns.length + 1,
            nullable: row.nullable ? row.nullable.toUpperCase() === 'Y' : null,
            isPrimaryKey: toNumberOrNull(row.primaryKey) === 1,
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
            onUpdate: null,
            onDelete: row.deleteAction ?? null,
        };
        relationship.sourceColumns.push(sourceColumn);
        relationship.targetColumns.push(targetColumn);
        relationship.sourceOptional = Boolean(relationship.sourceOptional) || row.sourceNullable?.toUpperCase() === 'Y';
        relationshipsByKey.set(key, relationship);
    }

    return buildSchemaGraphResult(options, Array.from(tablesByKey.values()), Array.from(relationshipsByKey.values()), {
        relationships: true,
        compositeForeignKeys: true,
        cardinality: false,
        referentialActions: true,
        constraintsEnforced: true,
    });
}

export function createOracleMetadataCapability(datasource: OracleDatasource): OracleMetadataAPI {
    return {
        async getDatabases() {
            const serviceName = resolveOracleServiceName(datasource.config);
            const fallback = serviceName ?? datasource.config.host;
            return [{ label: fallback, value: fallback }];
        },

        async getSchemas(database) {
            const result = await datasource.queryWithContext<{ SCHEMA_NAME?: string }>(
                `
                    SELECT DISTINCT o.owner AS "SCHEMA_NAME"
                    FROM all_objects o
                    JOIN all_users u
                      ON u.username = o.owner
                    WHERE u.oracle_maintained = 'N'
                      AND o.object_type IN ('TABLE', 'VIEW', 'FUNCTION', 'PROCEDURE', 'SEQUENCE')
                    ORDER BY o.owner
                `,
                { database },
            );

            return result.rows
                .map(row => row.SCHEMA_NAME?.trim())
                .filter((name): name is string => Boolean(name))
                .map(name => ({ label: name, value: name }));
        },

        async getTables(database) {
            const rows = await getObjectRows(datasource, database ?? resolveOracleServiceName(datasource.config) ?? '', ['TABLE']);
            return rows.map(row => ({
                label: row.name,
                value: row.name,
                database,
                schema: row.schema,
            }));
        },

        async getSchema(database) {
            const targetDatabase = database ?? resolveOracleServiceName(datasource.config) ?? '';
            const rows = await getObjectRows(datasource, targetDatabase, ['TABLE', 'VIEW']);
            return rows.reduce<ConnectionSchemaMap>((acc, row) => {
                const schema = row.schema ?? 'PUBLIC';
                if (!acc[schema]) acc[schema] = [];
                acc[schema].push(row.name);
                return acc;
            }, {});
        },

        async getTableColumns(database, table) {
            const currentSchema = await getCurrentSchema(datasource, database);
            const target = parseOracleTableReference(table, currentSchema);
            const result = await datasource.queryWithContext<ColumnRow>(
                `
                    SELECT
                        c.column_name AS "columnName",
                        CASE
                            WHEN c.data_type IN ('VARCHAR2', 'NVARCHAR2', 'CHAR', 'NCHAR') THEN c.data_type || '(' || c.char_length || ')'
                            WHEN c.data_type = 'NUMBER' AND c.data_precision IS NOT NULL THEN c.data_type || '(' || c.data_precision || ',' || NVL(c.data_scale, 0) || ')'
                            ELSE c.data_type
                        END AS "columnType",
                        c.nullable AS "nullable",
                        c.data_default AS "defaultExpression",
                        cc.comments AS "comment",
                        CASE WHEN pk.column_name IS NULL THEN 0 ELSE 1 END AS "primaryKey"
                    FROM all_tab_columns c
                    LEFT JOIN all_col_comments cc
                      ON cc.owner = c.owner
                     AND cc.table_name = c.table_name
                     AND cc.column_name = c.column_name
                    LEFT JOIN (
                        SELECT cons.owner, cons.table_name, cols.column_name
                        FROM all_constraints cons
                        JOIN all_cons_columns cols
                          ON cols.owner = cons.owner
                         AND cols.constraint_name = cons.constraint_name
                        WHERE cons.constraint_type = 'P'
                    ) pk
                      ON pk.owner = c.owner
                     AND pk.table_name = c.table_name
                     AND pk.column_name = c.column_name
                    WHERE c.owner = :owner
                      AND c.table_name = :tableName
                    ORDER BY c.column_id
                `,
                {
                    database,
                    params: {
                        owner: target.schema ?? currentSchema,
                        tableName: target.table,
                    },
                },
            );

            return result.rows.map(row => ({
                columnName: row.columnName ?? '',
                columnType: row.columnType ?? null,
                defaultKind: row.defaultExpression ? 'expression' : null,
                defaultExpression: row.defaultExpression ?? null,
                isPrimaryKey: row.primaryKey === 1 || row.primaryKey === '1',
                comment: row.comment ?? null,
            }));
        },

        async getTablesOnly(database) {
            return getObjectRows(datasource, database, ['TABLE']);
        },

        async getViews(database) {
            return getObjectRows(datasource, database, ['VIEW']);
        },

        async getFunctions(database) {
            const targetDatabase = database ?? resolveOracleServiceName(datasource.config) ?? '';
            const result = await datasource.queryWithContext<FunctionRow>(
                `
                    SELECT owner AS "schemaName", object_name AS "name", object_type AS "type"
                    FROM all_objects o
                    JOIN all_users u
                      ON u.username = o.owner
                    WHERE o.object_type IN ('FUNCTION', 'PROCEDURE')
                      AND u.oracle_maintained = 'N'
                    ORDER BY o.owner, o.object_name
                `,
                { database: targetDatabase },
            );

            return result.rows
                .map(row => {
                    const name = qualify(row.schemaName, row.name);
                    return name
                        ? {
                              label: name,
                              value: name,
                              schema: row.schemaName ?? null,
                              kind: mapOracleFunctionKind(row.type),
                          }
                        : null;
                })
                .filter((row): row is NonNullable<typeof row> => Boolean(row));
        },

        async getFunctionDetail(database, functionName, schema) {
            const currentSchema = await getCurrentSchema(datasource, database);
            const target = parseOracleTableReference(functionName, schema ?? currentSchema);
            const detail = await datasource.queryWithContext<FunctionRow>(
                `
                    SELECT owner AS "schemaName", object_name AS "name", object_type AS "type", status AS "status", created AS "createdAt", last_ddl_time AS "modifiedAt"
                    FROM all_objects
                    WHERE owner = :owner
                      AND object_name = :name
                      AND object_type IN ('FUNCTION', 'PROCEDURE')
                `,
                {
                    database,
                    params: {
                        owner: target.schema ?? currentSchema,
                        name: target.table,
                    },
                },
            );
            const row = detail.rows[0];
            if (!row?.name) return null;

            const parameters = await datasource.queryWithContext<FunctionParameterRow>(
                `
                    SELECT argument_name AS "name", position AS "position", data_type AS "dataType", in_out AS "inOut", defaulted AS "defaulted"
                    FROM all_arguments
                    WHERE owner = :owner
                      AND object_name = :name
                    ORDER BY sequence
                `,
                {
                    database,
                    params: {
                        owner: target.schema ?? currentSchema,
                        name: target.table,
                    },
                },
            );
            const kind = mapOracleFunctionKind(row.type);
            const qualifiedName = qualify(row.schemaName, row.name) ?? row.name;
            const normalizedParameters = parameters.rows.map(param => ({
                name: param.name ?? '',
                dataType: param.dataType ?? null,
                nullable: null,
                hasDefault: param.defaulted === 'Y',
                mode: param.inOut === 'OUT' ? ('out' as const) : param.inOut === 'IN/OUT' ? ('inout' as const) : ('in' as const),
            }));
            const args = normalizedParameters
                .filter(param => param.mode !== 'out')
                .map(param => `${param.name} => ${param.dataType?.includes('CHAR') ? "'sample'" : '1'}`)
                .join(', ');

            return {
                name: row.name,
                schema: row.schemaName ?? null,
                qualifiedName,
                kind,
                signature: `${qualifiedName}(${normalizedParameters.map(param => `${param.name} ${param.dataType ?? ''}`.trim()).join(', ')})`,
                owner: row.schemaName ?? null,
                createdAt: toIsoString(row.createdAt),
                modifiedAt: toIsoString(row.modifiedAt),
                parameters: normalizedParameters,
                returnType: null,
                returnColumns: [],
                definition: null,
                sampleCallSql: kind === 'procedure' ? `BEGIN ${qualifiedName}(${args}); END;` : `SELECT ${qualifiedName}(${args}) FROM dual;`,
                dependencies: [],
                usedBy: [],
            };
        },

        async getSequences(database) {
            const targetDatabase = database ?? resolveOracleServiceName(datasource.config) ?? '';
            const result = await datasource.queryWithContext<ObjectRow>(
                `
                    SELECT sequence_owner AS "schemaName", sequence_name AS "name", 'SEQUENCE' AS "type", NULL AS "totalRows", NULL AS "totalBytes", NULL AS "comment", NULL AS "lastModified"
                    FROM all_sequences s
                    JOIN all_users u
                      ON u.username = s.sequence_owner
                    WHERE u.oracle_maintained = 'N'
                    ORDER BY s.sequence_owner, s.sequence_name
                `,
                { database: targetDatabase },
            );

            return result.rows.map(normalizeOracleObjectRow).filter((row): row is DatabaseObjectRow => Boolean(row));
        },

        async getDatabaseTablesDetail(database) {
            return getObjectRows(datasource, database, ['TABLE', 'VIEW']);
        },

        async getDatabaseSummary(options) {
            const database = options.database;
            const tables = await getObjectRows(datasource, database, ['TABLE']);
            const views = await getObjectRows(datasource, database, ['VIEW']);
            const functions = await this.getFunctions?.(database);
            const relationships = await datasource.queryWithContext<RelationshipRow>(
                `
                    SELECT
                        child.owner || '.' || child.table_name AS "sourceTableName",
                        parent.owner || '.' || parent.table_name AS "targetTableName"
                    FROM all_constraints child
                    JOIN all_constraints parent
                      ON parent.owner = child.r_owner
                     AND parent.constraint_name = child.r_constraint_name
                    JOIN all_users child_user
                      ON child_user.username = child.owner
                    JOIN all_users parent_user
                      ON parent_user.username = parent.owner
                    WHERE child.constraint_type = 'R'
                      AND child_user.oracle_maintained = 'N'
                      AND parent_user.oracle_maintained = 'N'
                `,
                { database },
            );
            const columnCounts = await datasource.queryWithContext<ColumnCountRow>(
                `
                    SELECT owner || '.' || table_name AS "name", COUNT(*) AS "columnCount"
                    FROM all_tab_columns c
                    JOIN all_users u
                      ON u.username = c.owner
                    WHERE u.oracle_maintained = 'N'
                    GROUP BY c.owner, c.table_name
                `,
                { database },
            );
            const maxColumn = columnCounts.rows.slice().sort((a, b) => (toNumberOrNull(b.columnCount) ?? 0) - (toNumberOrNull(a.columnCount) ?? 0))[0];
            const totalColumns = columnCounts.rows.reduce((sum, row) => sum + (toNumberOrNull(row.columnCount) ?? 0), 0);
            const tablesWithColumnCounts = columnCounts.rows.length;
            const totalBytes = tables.reduce((sum, table) => sum + (table.totalBytes ?? 0), 0);
            const totalRows = tables.reduce((sum, table) => sum + (table.totalRows ?? 0), 0);
            const topTablesByBytes = tables
                .filter(table => typeof table.totalBytes === 'number')
                .sort((a, b) => (b.totalBytes ?? 0) - (a.totalBytes ?? 0))
                .slice(0, 5)
                .map(toSummaryTable);
            const topTablesByRows = tables
                .filter(table => typeof table.totalRows === 'number')
                .sort((a, b) => (b.totalRows ?? 0) - (a.totalRows ?? 0))
                .slice(0, 5)
                .map(toSummaryTable);
            const recentTables = tables
                .filter(table => table.lastModified)
                .sort((a, b) => String(b.lastModified).localeCompare(String(a.lastModified)))
                .slice(0, 5)
                .map(table => ({ name: table.name, lastUpdatedAt: table.lastModified ?? null }));
            const recommendations = buildRecommendations(tables, relationships.rows);
            const largeTables = tables.filter(table => (table.totalRows ?? 0) >= 1_000_000).length;

            return {
                databaseName: database,
                catalogName: options.catalogName ?? null,
                schemaName: options.schemaName ?? null,
                engine: options.engine ?? 'oracle',
                cluster: options.cluster ?? null,
                owner: null,
                tablesCount: tables.length,
                viewsCount: views.length,
                materializedViewsCount: null,
                functionsCount: functions?.length ?? null,
                totalBytes: totalBytes || null,
                totalRowsEstimate: totalRows || null,
                lastUpdatedAt: recentTables[0]?.lastUpdatedAt ?? null,
                lastQueriedAt: null,
                tableSizeDistribution: {
                    smallTablesCount: tables.length - largeTables,
                    mediumTablesCount: null,
                    largeTablesCount: largeTables,
                },
                columnComplexity: {
                    averageColumnsPerTable: tablesWithColumnCounts ? totalColumns / tablesWithColumnCounts : null,
                    maxColumns: toNumberOrNull(maxColumn?.columnCount),
                    maxColumnsTable: maxColumn?.name ?? null,
                },
                foreignKeyLinksCount: relationships.rows.length,
                relationshipPaths: buildRelationshipPaths(relationships.rows),
                detectedPatterns: [],
                coreTables: recommendations.slice(0, 3),
                topTablesByBytes,
                topTablesByRows,
                recentTables,
                startHere: recommendations.slice(0, 3),
                oneLineSummary: `${tables.length} tables and ${views.length} views available in Oracle service ${database}.`,
            };
        },
        getSchemaGraph: options => getSchemaGraph(datasource, options),
    };
}

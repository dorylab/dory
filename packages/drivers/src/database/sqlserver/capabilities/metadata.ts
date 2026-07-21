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
import type { SqlServerDatasource } from '../datasource';
import { parseSqlServerTableReference } from '../runtime';

export type SqlServerMetadataAPI = ConnectionMetadataAPI & {
    getSchemas: (database: string) => Promise<Array<{ label: string; value: string }>>;
    getTableColumns: (database: string, table: string) => Promise<TableColumnInfo[]>;
    getTablesOnly: (database: string) => Promise<DatabaseObjectRow[]>;
    getViews: (database: string) => Promise<DatabaseObjectRow[]>;
    getFunctions: (database?: string) => Promise<Array<{ label: string; value: string }>>;
    getFunctionDetail: (database: string, functionName: string, schema?: string | null) => Promise<DatabaseFunctionDetail | null>;
    getSequences: (database?: string) => Promise<DatabaseObjectRow[]>;
    getDatabaseSummary: (options: DatabaseSummaryOptions) => Promise<DatabaseSummary>;
    getDatabaseTablesDetail: (database: string) => Promise<DatabaseObjectRow[]>;
    getSchemaGraph: (options: SchemaGraphOptions) => Promise<SchemaGraphResult>;
};

type ObjectRow = {
    schemaName?: string;
    name?: string;
    type?: string | null;
    totalRows?: number | string | null;
    totalBytes?: number | string | null;
    comment?: string | null;
    lastModified?: string | Date | null;
};

type ColumnCountRow = {
    name?: string;
    columnCount?: number | string | null;
};

type RelationshipRow = {
    sourceTableName?: string;
    targetTableName?: string;
};

type SchemaGraphColumnRow = {
    schemaName?: string;
    tableName?: string;
    columnName?: string;
    dataType?: string | null;
    ordinal?: number | string | null;
    nullable?: boolean | number | null;
    primaryKey?: boolean | number | null;
};

type SchemaGraphRelationshipRow = {
    constraintName?: string | null;
    sourceSchemaName?: string;
    sourceTableName?: string;
    sourceColumnName?: string;
    targetSchemaName?: string;
    targetTableName?: string;
    targetColumnName?: string;
    sourceNullable?: boolean | number | null;
    updateAction?: string | null;
    deleteAction?: string | null;
};

type FunctionDetailRow = {
    objectId?: number | string;
    schemaName?: string | null;
    name?: string | null;
    type?: string | null;
    typeDescription?: string | null;
    owner?: string | null;
    createdAt?: string | Date | null;
    modifiedAt?: string | Date | null;
    definition?: string | null;
};

type FunctionParameterRow = {
    name?: string | null;
    parameterId?: number | string | null;
    userTypeName?: string | null;
    systemTypeName?: string | null;
    maxLength?: number | string | null;
    precision?: number | string | null;
    scale?: number | string | null;
    isOutput?: boolean | number | null;
    hasDefaultValue?: boolean | number | null;
    isNullable?: boolean | number | null;
};

type FunctionReturnColumnRow = {
    name?: string | null;
    typeName?: string | null;
    maxLength?: number | string | null;
    precision?: number | string | null;
    scale?: number | string | null;
    isNullable?: boolean | number | null;
};

type FunctionDependencyRow = {
    schemaName?: string | null;
    name?: string | null;
    type?: string | null;
};

const USER_OBJECTS_SQL = `
    SELECT
        s.name AS schemaName,
        o.name AS name,
        o.type_desc AS type,
        SUM(p.rows) AS totalRows,
        SUM(a.total_pages) * 8 * 1024 AS totalBytes,
        CAST(ep.value AS nvarchar(max)) AS comment,
        o.modify_date AS lastModified
    FROM sys.objects o
    JOIN sys.schemas s ON s.schema_id = o.schema_id
    LEFT JOIN sys.partitions p ON p.object_id = o.object_id AND p.index_id IN (0, 1)
    LEFT JOIN sys.allocation_units a ON a.container_id = p.partition_id
    LEFT JOIN sys.extended_properties ep
      ON ep.major_id = o.object_id
     AND ep.minor_id = 0
     AND ep.name = 'MS_Description'
    WHERE o.type IN ('U', 'V')
      AND o.is_ms_shipped = 0
    GROUP BY s.name, o.name, o.type_desc, CAST(ep.value AS nvarchar(max)), o.modify_date
    ORDER BY s.name, o.name
`;

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
    return schema && schema !== 'dbo' ? `${schema}.${object}` : object;
}

function splitSqlServerName(value: string, schema?: string | null): { schema: string; name: string } {
    const trimmed = value.trim().replace(/^\[|\]$/g, '');
    const parts = trimmed
        .split('.')
        .map(part => part.trim().replace(/^\[|\]$/g, ''))
        .filter(Boolean);
    if (parts.length >= 2) {
        return { schema: parts[parts.length - 2], name: parts[parts.length - 1] };
    }
    return { schema: schema?.trim() || 'dbo', name: parts[0] || trimmed };
}

function formatSqlServerType(row: Pick<FunctionParameterRow, 'systemTypeName' | 'userTypeName' | 'maxLength' | 'precision' | 'scale'>): string | null {
    const rawType = row.userTypeName || row.systemTypeName;
    if (!rawType) return null;
    const typeName = rawType.toUpperCase();
    const maxLength = toNumberOrNull(row.maxLength);
    const precision = toNumberOrNull(row.precision);
    const scale = toNumberOrNull(row.scale);
    if (['NVARCHAR', 'NCHAR'].includes(typeName) && maxLength) {
        return `${typeName}(${maxLength === -1 ? 'MAX' : maxLength / 2})`;
    }
    if (['VARCHAR', 'CHAR', 'VARBINARY', 'BINARY'].includes(typeName) && maxLength) {
        return `${typeName}(${maxLength === -1 ? 'MAX' : maxLength})`;
    }
    if (['DECIMAL', 'NUMERIC'].includes(typeName) && precision) {
        return `${typeName}(${precision},${scale ?? 0})`;
    }
    return typeName;
}

function mapSqlServerFunctionKind(type?: string | null): DatabaseFunctionKind {
    switch (type) {
        case 'FN':
        case 'FS':
        case 'FT':
            return 'scalar';
        case 'IF':
        case 'TF':
            return 'table';
        case 'AF':
            return 'aggregate';
        case 'P':
        case 'PC':
            return 'procedure';
        default:
            return 'unknown';
    }
}

function quoteSqlServerName(name: string) {
    return `[${name.replace(/]/g, ']]')}]`;
}

function buildSqlServerSignature(qualifiedName: string, parameters: DatabaseFunctionDetail['parameters'], returnType: string | null, kind: DatabaseFunctionKind) {
    const args = parameters
        .filter(param => param.mode !== 'return')
        .map(param => `${param.name} ${param.dataType ?? ''}`.trim())
        .join(', ');
    if (kind === 'procedure') return `${qualifiedName} ${args}`.trim();
    return `${qualifiedName}(${args})${returnType ? ` -> ${returnType}` : ''}`;
}

function buildSqlServerSampleCall(qualifiedName: string, parameters: DatabaseFunctionDetail['parameters'], kind: DatabaseFunctionKind) {
    const values = parameters
        .filter(param => param.mode !== 'return' && param.mode !== 'out')
        .map(param => sampleValueForType(param.dataType))
        .join(', ');
    if (kind === 'procedure') return `EXEC ${qualifiedName}${values ? ` ${values}` : ''};`;
    return `SELECT ${qualifiedName}(${values});`;
}

function sampleValueForType(type?: string | null) {
    const upper = (type ?? '').toUpperCase();
    if (upper.includes('CHAR') || upper.includes('TEXT') || upper.includes('UNIQUEIDENTIFIER')) return "'sample'";
    if (upper.includes('DATE') || upper.includes('TIME')) return "'2026-01-01'";
    if (upper.includes('BIT') || upper.includes('BOOL')) return '1';
    return '1';
}

function normalizeObjectRow(row: ObjectRow): DatabaseObjectRow | null {
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

function detectNamingPatterns(tables: DatabaseObjectRow[]) {
    const domainCounts = new Map<string, number>();
    for (const table of tables) {
        const unqualified = table.name.split('.').pop() ?? table.name;
        const domainPrefix = unqualified.split('_')[0]?.trim();
        if (domainPrefix && domainPrefix.length > 1 && unqualified.includes('_')) {
            domainCounts.set(domainPrefix, (domainCounts.get(domainPrefix) ?? 0) + 1);
        }
    }

    return Array.from(domainCounts.entries())
        .filter(([, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([prefix]) => ({
            kind: 'domain' as const,
            label: `${prefix}_*`,
        }));
}

function buildRelationshipPaths(rows: RelationshipRow[]) {
    return rows
        .map(row => {
            const source = row.sourceTableName?.trim();
            const target = row.targetTableName?.trim();
            return source && target && source !== target ? { path: `${source} -> ${target}` } : null;
        })
        .filter((row): row is { path: string } => Boolean(row))
        .slice(0, 3);
}

function summarizeReason(input: { hasRelationships: boolean; isLargestByRows: boolean; isLargestByBytes: boolean; isRecent: boolean }) {
    if (input.hasRelationships && input.isLargestByRows) return 'centralAndHighRowVolume' as const;
    if (input.hasRelationships && input.isLargestByBytes) return 'centralAndHighStorage' as const;
    if (input.hasRelationships) return 'centralInRelationships' as const;
    if (input.isLargestByRows) return 'highRowVolume' as const;
    if (input.isLargestByBytes) return 'largeStorageFootprint' as const;
    if (input.isRecent) return 'recentlyUpdated' as const;
    return 'goodStartingPoint' as const;
}

function buildRecommendations(tables: DatabaseObjectRow[], relationshipRows: RelationshipRow[]): DatabaseSummaryRecommendation[] {
    const related = new Set<string>();
    for (const row of relationshipRows) {
        if (row.sourceTableName) related.add(row.sourceTableName);
        if (row.targetTableName) related.add(row.targetTableName);
    }
    const topByRows = new Set(
        [...tables]
            .sort((a, b) => (b.totalRows ?? 0) - (a.totalRows ?? 0))
            .slice(0, 3)
            .map(table => table.name),
    );
    const topByBytes = new Set(
        [...tables]
            .sort((a, b) => (b.totalBytes ?? 0) - (a.totalBytes ?? 0))
            .slice(0, 3)
            .map(table => table.name),
    );
    const recent = new Set(
        [...tables]
            .filter(table => table.lastModified)
            .sort((a, b) => String(b.lastModified).localeCompare(String(a.lastModified)))
            .slice(0, 3)
            .map(table => table.name),
    );

    return tables
        .map(table => ({
            name: table.name,
            reason: summarizeReason({
                hasRelationships: related.has(table.name),
                isLargestByRows: topByRows.has(table.name),
                isLargestByBytes: topByBytes.has(table.name),
                isRecent: recent.has(table.name),
            }),
            bytes: table.totalBytes ?? null,
            rowsEstimate: table.totalRows ?? null,
            score: (related.has(table.name) ? 10 : 0) + (topByRows.has(table.name) ? 5 : 0) + (topByBytes.has(table.name) ? 5 : 0) + (recent.has(table.name) ? 1 : 0),
        }))
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
        .slice(0, 3)
        .map(({ score: _score, ...rest }) => rest);
}

async function getDatabases(datasource: SqlServerDatasource) {
    const result = await datasource.query<{ name: string }>(`
        SELECT name
        FROM sys.databases
        WHERE state = 0
        ORDER BY name
    `);

    return result.rows
        .map(row => row.name?.trim())
        .filter((name): name is string => Boolean(name))
        .map(name => ({ value: name, label: name }));
}

async function getSchemas(datasource: SqlServerDatasource, database: string) {
    const result = await datasource.queryWithContext<{ name?: string }>(
        `
            SELECT name
            FROM sys.schemas
            WHERE name NOT IN ('sys', 'INFORMATION_SCHEMA')
            ORDER BY name
        `,
        { database },
    );

    return result.rows
        .map(row => row.name?.trim())
        .filter((name): name is string => Boolean(name))
        .map(name => ({ value: name, label: name }));
}

async function getTables(datasource: SqlServerDatasource, database?: string) {
    if (!database) {
        return [];
    }

    const result = await datasource.queryWithContext<{ schemaName?: string; tableName?: string }>(
        `
            SELECT s.name AS schemaName, t.name AS tableName
            FROM sys.tables t
            JOIN sys.schemas s ON s.schema_id = t.schema_id
            WHERE t.is_ms_shipped = 0
            ORDER BY s.name, t.name
        `,
        { database },
    );

    return result.rows
        .map(row => {
            const value = qualify(row.schemaName, row.tableName);
            return value ? { value, label: value, database, schema: row.schemaName } : null;
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
}

async function getSchema(datasource: SqlServerDatasource, database?: string): Promise<ConnectionSchemaMap> {
    if (!database) return {};
    const result = await datasource.queryWithContext<{ schemaName?: string; tableName?: string; columnName?: string }>(
        `
            SELECT
                TABLE_SCHEMA AS schemaName,
                TABLE_NAME AS tableName,
                COLUMN_NAME AS columnName
            FROM INFORMATION_SCHEMA.COLUMNS
            ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
        `,
        { database },
    );

    return result.rows.reduce<ConnectionSchemaMap>((schema, row) => {
        const tableName = qualify(row.schemaName, row.tableName);
        const columnName = row.columnName?.trim();
        if (!tableName || !columnName) return schema;
        if (!schema[tableName]) schema[tableName] = [];
        schema[tableName].push(columnName);
        return schema;
    }, {});
}

async function getTableColumns(datasource: SqlServerDatasource, database: string, table: string): Promise<TableColumnInfo[]> {
    const target = parseSqlServerTableReference(table);
    const schemaName = target.schema ?? 'dbo';
    const tableName = target.table;
    const result = await datasource.queryWithContext<TableColumnInfo>(
        `
            SELECT
                c.COLUMN_NAME AS columnName,
                c.DATA_TYPE AS columnType,
                CASE WHEN c.COLUMN_DEFAULT IS NOT NULL THEN 'DEFAULT' ELSE NULL END AS defaultKind,
                c.COLUMN_DEFAULT AS defaultExpression,
                CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS isPrimaryKey,
                CAST(ep.value AS nvarchar(max)) AS comment
            FROM INFORMATION_SCHEMA.COLUMNS c
            LEFT JOIN (
                SELECT ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME
                FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
                  ON ku.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
                 AND ku.TABLE_SCHEMA = tc.TABLE_SCHEMA
                 AND ku.TABLE_NAME = tc.TABLE_NAME
                WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
            ) pk
              ON pk.TABLE_SCHEMA = c.TABLE_SCHEMA
             AND pk.TABLE_NAME = c.TABLE_NAME
             AND pk.COLUMN_NAME = c.COLUMN_NAME
            LEFT JOIN sys.objects o ON o.name = c.TABLE_NAME
            LEFT JOIN sys.schemas s ON s.schema_id = o.schema_id AND s.name = c.TABLE_SCHEMA
            LEFT JOIN sys.columns sc ON sc.object_id = o.object_id AND sc.name = c.COLUMN_NAME
            LEFT JOIN sys.extended_properties ep
              ON ep.major_id = o.object_id
             AND ep.minor_id = sc.column_id
             AND ep.name = 'MS_Description'
            WHERE c.TABLE_SCHEMA = @schemaName
              AND c.TABLE_NAME = @tableName
            ORDER BY c.ORDINAL_POSITION
        `,
        {
            database,
            params: { schemaName, tableName },
        },
    );

    return Array.isArray(result.rows) ? result.rows : [];
}

async function getDatabaseTablesDetail(datasource: SqlServerDatasource, database: string): Promise<DatabaseObjectRow[]> {
    const result = await datasource.queryWithContext<ObjectRow>(USER_OBJECTS_SQL, { database });
    return result.rows.map(normalizeObjectRow).filter((row): row is NonNullable<typeof row> => Boolean(row));
}

async function getTablesOnly(datasource: SqlServerDatasource, database: string): Promise<DatabaseObjectRow[]> {
    return (await getDatabaseTablesDetail(datasource, database)).filter(row => row.engine !== 'VIEW');
}

async function getViews(datasource: SqlServerDatasource, database: string): Promise<DatabaseObjectRow[]> {
    return (await getDatabaseTablesDetail(datasource, database)).filter(row => row.engine === 'VIEW');
}

async function getFunctions(datasource: SqlServerDatasource, database?: string) {
    if (!database) return [];
    const result = await datasource.queryWithContext<{ schemaName?: string; name?: string; type?: string | null }>(
        `
            SELECT s.name AS schemaName, o.name AS name, o.type AS type
            FROM sys.objects o
            JOIN sys.schemas s ON s.schema_id = o.schema_id
            WHERE o.type IN ('FN', 'IF', 'TF', 'P')
              AND o.is_ms_shipped = 0
            ORDER BY s.name, o.name
        `,
        { database },
    );

    return result.rows
        .map(row => {
            const name = qualify(row.schemaName, row.name);
            return name
                ? {
                      value: name,
                      label: name,
                      schema: row.schemaName ?? null,
                      kind: mapSqlServerFunctionKind(row.type),
                  }
                : null;
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
}

async function getFunctionDetail(datasource: SqlServerDatasource, database: string, functionName: string, schema?: string | null): Promise<DatabaseFunctionDetail | null> {
    const target = splitSqlServerName(functionName, schema);
    const detailResult = await datasource.queryWithContext<FunctionDetailRow>(
        `
            SELECT
                o.object_id AS objectId,
                s.name AS schemaName,
                o.name AS name,
                o.type AS type,
                o.type_desc AS typeDescription,
                USER_NAME(o.principal_id) AS owner,
                o.create_date AS createdAt,
                o.modify_date AS modifiedAt,
                m.definition AS definition
            FROM sys.objects o
            JOIN sys.schemas s ON s.schema_id = o.schema_id
            LEFT JOIN sys.sql_modules m ON m.object_id = o.object_id
            WHERE s.name = @schemaName
              AND o.name = @functionName
              AND o.type IN ('FN', 'IF', 'TF', 'AF', 'FS', 'FT', 'P', 'PC')
        `,
        { database, params: { schemaName: target.schema, functionName: target.name } },
    );
    const detail = detailResult.rows[0];
    if (!detail?.objectId || !detail.name) return null;

    const objectId = Number(detail.objectId);
    const [parameterResult, returnColumnResult, dependencyResult, usedByResult] = await Promise.all([
        datasource.queryWithContext<FunctionParameterRow>(
            `
                SELECT
                    p.name,
                    p.parameter_id AS parameterId,
                    TYPE_NAME(p.user_type_id) AS userTypeName,
                    TYPE_NAME(p.system_type_id) AS systemTypeName,
                    p.max_length AS maxLength,
                    p.precision,
                    p.scale,
                    p.is_output AS isOutput,
                    p.has_default_value AS hasDefaultValue,
                    p.is_nullable AS isNullable
                FROM sys.parameters p
                WHERE p.object_id = @objectId
                ORDER BY p.parameter_id
            `,
            { database, params: { objectId } },
        ),
        datasource.queryWithContext<FunctionReturnColumnRow>(
            `
                SELECT
                    c.name,
                    TYPE_NAME(c.user_type_id) AS typeName,
                    c.max_length AS maxLength,
                    c.precision,
                    c.scale,
                    c.is_nullable AS isNullable
                FROM sys.columns c
                WHERE c.object_id = @objectId
                ORDER BY c.column_id
            `,
            { database, params: { objectId } },
        ),
        datasource.queryWithContext<FunctionDependencyRow>(
            `
                SELECT DISTINCT
                    referenced_schema_name AS schemaName,
                    referenced_entity_name AS name,
                    referenced_class_desc AS type
                FROM sys.sql_expression_dependencies
                WHERE referencing_id = @objectId
                  AND referenced_entity_name IS NOT NULL
                ORDER BY referenced_schema_name, referenced_entity_name
            `,
            { database, params: { objectId } },
        ),
        datasource.queryWithContext<FunctionDependencyRow>(
            `
                SELECT DISTINCT
                    OBJECT_SCHEMA_NAME(referencing_id) AS schemaName,
                    OBJECT_NAME(referencing_id) AS name,
                    o.type_desc AS type
                FROM sys.sql_expression_dependencies d
                JOIN sys.objects o ON o.object_id = d.referencing_id
                WHERE d.referenced_id = @objectId
                ORDER BY OBJECT_SCHEMA_NAME(referencing_id), OBJECT_NAME(referencing_id)
            `,
            { database, params: { objectId } },
        ),
    ]);

    const parameters = parameterResult.rows
        .filter(row => Number(row.parameterId ?? 0) > 0)
        .map(row => ({
            name: row.name || `@param${row.parameterId}`,
            dataType: formatSqlServerType(row),
            nullable: row.isNullable == null ? null : Boolean(row.isNullable),
            hasDefault: row.hasDefaultValue == null ? null : Boolean(row.hasDefaultValue),
            mode: row.isOutput ? ('out' as const) : ('in' as const),
        }));
    const returnParameter = parameterResult.rows.find(row => Number(row.parameterId ?? -1) === 0);
    const kind = mapSqlServerFunctionKind(detail.type);
    const qualifiedName = `${quoteSqlServerName(detail.schemaName ?? target.schema)}.${quoteSqlServerName(detail.name)}`;
    const returnColumns = returnColumnResult.rows.map(row => ({
        name: row.name ?? '',
        dataType: formatSqlServerType({
            userTypeName: row.typeName,
            systemTypeName: row.typeName,
            maxLength: row.maxLength,
            precision: row.precision,
            scale: row.scale,
        }),
        nullable: row.isNullable == null ? null : Boolean(row.isNullable),
    }));
    const returnType = kind === 'table' ? 'TABLE' : returnParameter ? formatSqlServerType(returnParameter) : null;

    return {
        name: detail.name,
        schema: detail.schemaName ?? target.schema,
        qualifiedName,
        kind,
        signature: buildSqlServerSignature(qualifiedName, parameters, returnType, kind),
        owner: detail.owner ?? null,
        createdAt: toIsoString(detail.createdAt),
        modifiedAt: toIsoString(detail.modifiedAt),
        parameters,
        returnType,
        returnColumns,
        definition: detail.definition ?? null,
        sampleCallSql: buildSqlServerSampleCall(qualifiedName, parameters, kind),
        dependencies: dependencyResult.rows.filter(row => row.name).map(row => ({ name: row.name!, schema: row.schemaName ?? null, type: row.type ?? null })),
        usedBy: usedByResult.rows.filter(row => row.name).map(row => ({ name: row.name!, schema: row.schemaName ?? null, type: row.type ?? null })),
    };
}

async function getSequences(datasource: SqlServerDatasource, database?: string): Promise<DatabaseObjectRow[]> {
    if (!database) return [];
    const result = await datasource.queryWithContext<{ schemaName?: string; name?: string; currentValue?: number | string | null }>(
        `
            SELECT s.name AS schemaName, seq.name AS name, seq.current_value AS currentValue
            FROM sys.sequences seq
            JOIN sys.schemas s ON s.schema_id = seq.schema_id
            ORDER BY s.name, seq.name
        `,
        { database },
    );

    return result.rows
        .map<DatabaseObjectRow | null>(row => {
            const name = qualify(row.schemaName, row.name);
            return name
                ? {
                      name,
                      schema: row.schemaName,
                      engine: 'SEQUENCE',
                      totalBytes: null,
                      totalRows: toNumberOrNull(row.currentValue),
                      comment: null,
                      lastModified: null,
                  }
                : null;
        })
        .filter((row): row is DatabaseObjectRow => Boolean(row));
}

async function getSchemaGraph(datasource: SqlServerDatasource, options: SchemaGraphOptions): Promise<SchemaGraphResult> {
    const [columnResult, relationshipResult] = await Promise.all([
        datasource.queryWithContext<SchemaGraphColumnRow>(
            `
                SELECT
                    s.name AS schemaName,
                    t.name AS tableName,
                    c.name AS columnName,
                    TYPE_NAME(c.user_type_id) AS dataType,
                    c.column_id AS ordinal,
                    c.is_nullable AS nullable,
                    CASE WHEN EXISTS (
                        SELECT 1
                        FROM sys.indexes i
                        JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
                        WHERE i.object_id = t.object_id
                          AND i.is_primary_key = 1
                          AND ic.column_id = c.column_id
                    ) THEN 1 ELSE 0 END AS primaryKey
                FROM sys.tables t
                JOIN sys.schemas s ON s.schema_id = t.schema_id
                JOIN sys.columns c ON c.object_id = t.object_id
                WHERE t.is_ms_shipped = 0
                ORDER BY s.name, t.name, c.column_id
            `,
            { database: options.database },
        ),
        datasource.queryWithContext<SchemaGraphRelationshipRow>(
            `
                SELECT
                    fk.name AS constraintName,
                    src_schema.name AS sourceSchemaName,
                    src_table.name AS sourceTableName,
                    src_column.name AS sourceColumnName,
                    tgt_schema.name AS targetSchemaName,
                    tgt_table.name AS targetTableName,
                    tgt_column.name AS targetColumnName,
                    src_column.is_nullable AS sourceNullable,
                    fk.update_referential_action_desc AS updateAction,
                    fk.delete_referential_action_desc AS deleteAction
                FROM sys.foreign_keys fk
                JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
                JOIN sys.tables src_table ON src_table.object_id = fkc.parent_object_id
                JOIN sys.schemas src_schema ON src_schema.schema_id = src_table.schema_id
                JOIN sys.columns src_column ON src_column.object_id = src_table.object_id AND src_column.column_id = fkc.parent_column_id
                JOIN sys.tables tgt_table ON tgt_table.object_id = fkc.referenced_object_id
                JOIN sys.schemas tgt_schema ON tgt_schema.schema_id = tgt_table.schema_id
                JOIN sys.columns tgt_column ON tgt_column.object_id = tgt_table.object_id AND tgt_column.column_id = fkc.referenced_column_id
                WHERE src_table.is_ms_shipped = 0
                  AND tgt_table.is_ms_shipped = 0
                ORDER BY src_schema.name, src_table.name, fk.name, fkc.constraint_column_id
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
            nullable: row.nullable == null ? null : Boolean(row.nullable),
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
        relationship.sourceOptional = Boolean(relationship.sourceOptional) || Boolean(row.sourceNullable);
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

async function getDatabaseSummary(datasource: SqlServerDatasource, options: DatabaseSummaryOptions): Promise<DatabaseSummary> {
    const rows = await getDatabaseTablesDetail(datasource, options.database);
    const tables = rows.filter(row => row.engine !== 'VIEW');
    const views = rows.filter(row => row.engine === 'VIEW');

    const [columnCounts, relationshipResult, functions] = await Promise.all([
        datasource.queryWithContext<ColumnCountRow>(
            `
                SELECT CONCAT(TABLE_SCHEMA, '.', TABLE_NAME) AS name, COUNT(*) AS columnCount
                FROM INFORMATION_SCHEMA.COLUMNS
                GROUP BY TABLE_SCHEMA, TABLE_NAME
            `,
            { database: options.database },
        ),
        datasource.queryWithContext<RelationshipRow>(
            `
                SELECT DISTINCT
                    CONCAT(OBJECT_SCHEMA_NAME(fk.parent_object_id), '.', OBJECT_NAME(fk.parent_object_id)) AS sourceTableName,
                    CONCAT(OBJECT_SCHEMA_NAME(fk.referenced_object_id), '.', OBJECT_NAME(fk.referenced_object_id)) AS targetTableName
                FROM sys.foreign_keys fk
            `,
            { database: options.database },
        ),
        getFunctions(datasource, options.database),
    ]);

    const columnCountRows = columnCounts.rows ?? [];
    const relationshipRows = relationshipResult.rows ?? [];
    const totalBytes = tables.reduce((sum, table) => sum + (table.totalBytes ?? 0), 0);
    const totalRowsEstimate = tables.reduce((sum, table) => sum + (table.totalRows ?? 0), 0);
    const lastUpdatedAt =
        rows
            .map(row => row.lastModified)
            .filter((value): value is string => Boolean(value))
            .sort((a, b) => b.localeCompare(a))[0] ?? null;
    const avgColumns = columnCountRows.length > 0 ? columnCountRows.reduce((sum, row) => sum + (toNumberOrNull(row.columnCount) ?? 0), 0) / columnCountRows.length : null;
    const maxColumnRow = columnCountRows
        .map(row => ({ name: row.name ?? null, columnCount: toNumberOrNull(row.columnCount) }))
        .sort((a, b) => (b.columnCount ?? 0) - (a.columnCount ?? 0))[0];
    const recommendations = buildRecommendations(tables, relationshipRows);
    const topTablesByBytes: DatabaseSummaryTable[] = [...tables]
        .sort((a, b) => (b.totalBytes ?? 0) - (a.totalBytes ?? 0))
        .slice(0, 5)
        .map(table => ({ name: table.name, bytes: table.totalBytes ?? null, rowsEstimate: table.totalRows ?? null, comment: table.comment ?? null }));
    const topTablesByRows: DatabaseSummaryTable[] = [...tables]
        .sort((a, b) => (b.totalRows ?? 0) - (a.totalRows ?? 0))
        .slice(0, 5)
        .map(table => ({ name: table.name, bytes: table.totalBytes ?? null, rowsEstimate: table.totalRows ?? null, comment: table.comment ?? null }));

    return {
        databaseName: options.database,
        catalogName: options.catalogName ?? null,
        schemaName: options.schemaName ?? null,
        engine: options.engine ?? 'sqlserver',
        cluster: options.cluster ?? null,
        owner: null,
        tablesCount: tables.length,
        viewsCount: views.length,
        materializedViewsCount: null,
        functionsCount: functions.length,
        totalBytes,
        totalRowsEstimate,
        lastUpdatedAt,
        lastQueriedAt: null,
        tableSizeDistribution: {
            smallTablesCount: tables.filter(table => (table.totalBytes ?? 0) > 0 && (table.totalBytes ?? 0) < 10 * 1024 * 1024).length,
            mediumTablesCount: tables.filter(table => (table.totalBytes ?? 0) >= 10 * 1024 * 1024 && (table.totalBytes ?? 0) < 100 * 1024 * 1024).length,
            largeTablesCount: tables.filter(table => (table.totalBytes ?? 0) >= 100 * 1024 * 1024).length,
        },
        columnComplexity: {
            averageColumnsPerTable: avgColumns === null ? null : Number(avgColumns.toFixed(2)),
            maxColumns: maxColumnRow?.columnCount ?? null,
            maxColumnsTable: maxColumnRow?.name ?? null,
        },
        foreignKeyLinksCount: relationshipRows.length,
        relationshipPaths: buildRelationshipPaths(relationshipRows),
        detectedPatterns: detectNamingPatterns(tables),
        coreTables: recommendations,
        topTablesByBytes,
        topTablesByRows,
        recentTables: [...rows]
            .filter(row => row.lastModified)
            .sort((a, b) => String(b.lastModified ?? '').localeCompare(String(a.lastModified ?? '')))
            .slice(0, 5)
            .map(row => ({ name: row.name, lastUpdatedAt: row.lastModified ?? null })),
        startHere: recommendations,
        oneLineSummary:
            tables.length > 0 ? `${options.database} has ${tables.length} tables and ${views.length} views.` : `${options.database} is available but does not expose user tables.`,
    };
}

export function createSqlServerMetadataCapability(datasource: SqlServerDatasource): SqlServerMetadataAPI {
    return {
        getDatabases: () => getDatabases(datasource),
        getTables: database => getTables(datasource, database),
        getSchemas: database => getSchemas(datasource, database),
        getSchema: database => getSchema(datasource, database),
        getTableColumns: (database, table) => getTableColumns(datasource, database, table),
        getTablesOnly: database => getTablesOnly(datasource, database),
        getViews: database => getViews(datasource, database),
        getFunctions: database => getFunctions(datasource, database),
        getFunctionDetail: (database, functionName, schema) => getFunctionDetail(datasource, database, functionName, schema),
        getSequences: database => getSequences(datasource, database),
        getDatabaseSummary: options => getDatabaseSummary(datasource, options),
        getDatabaseTablesDetail: database => getDatabaseTablesDetail(datasource, database),
        getSchemaGraph: options => getSchemaGraph(datasource, options),
    };
}

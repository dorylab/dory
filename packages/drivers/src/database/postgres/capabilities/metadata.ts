import type {
    DatabaseExtensionMeta,
    ConnectionMetadataAPI,
    ConnectionSchemaMap,
    DatabaseFunctionDetail,
    DatabaseFunctionKind,
    DatabaseFunctionMeta,
    DatabaseObjectRow,
    DatabaseSummary,
    DatabaseSummaryRecommendation,
    DatabaseSummaryOptions,
    SchemaGraphOptions,
    SchemaGraphResult,
    TableColumnInfo,
} from '@dory/drivers/types';
import { buildSchemaGraphResult, type SchemaGraphRelationshipInput, type SchemaGraphTableInput } from '@dory/drivers/core';
import { normalizePostgresTableKind } from '../runtime';
import type { PostgresDatasource } from '../datasource';
import { getPostgresSchemaSnapshot } from './schema-snapshot';

export type PostgresMetadataAPI = ConnectionMetadataAPI & {
    getSchemas: (database: string) => Promise<{ label: string; value: string }[]>;
    getTableColumns: (database: string, table: string) => Promise<TableColumnInfo[]>;
    getTablesOnly: (database: string) => Promise<DatabaseObjectRow[]>;
    getViews: (database: string) => Promise<DatabaseObjectRow[]>;
    getMaterializedViews: (database: string) => Promise<DatabaseObjectRow[]>;
    getFunctions: (database?: string) => Promise<DatabaseFunctionMeta[]>;
    getFunctionDetail: (database: string, functionName: string, schema?: string | null) => Promise<DatabaseFunctionDetail | null>;
    getSequences: (database?: string) => Promise<DatabaseObjectRow[]>;
    getExtensions: (database?: string) => Promise<DatabaseExtensionMeta[]>;
    getDatabaseSummary: (options: DatabaseSummaryOptions) => Promise<DatabaseSummary>;
    getDatabaseTablesDetail: (database: string) => Promise<DatabaseObjectRow[]>;
    getSchemaGraph: (options: SchemaGraphOptions) => Promise<SchemaGraphResult>;
    getSchemaSnapshot: NonNullable<ConnectionMetadataAPI['getSchemaSnapshot']>;
};

type ObjectRow = {
    schemaName?: string;
    name?: string;
    relkind?: string;
    totalBytes?: number | string | null;
    totalRows?: number | string | null;
    comment?: string | null;
    lastModified?: string | null;
};

type FunctionRow = {
    schemaName?: string;
    name?: string;
};

type FunctionDetailRow = {
    oid?: number | string;
    schemaName?: string | null;
    name?: string | null;
    owner?: string | null;
    kind?: string | null;
    arguments?: string | null;
    identityArguments?: string | null;
    resultType?: string | null;
    definition?: string | null;
    returnsSet?: boolean | null;
    volatility?: string | null;
};

type FunctionParameterRow = {
    name?: string | null;
    mode?: string | null;
    dataType?: string | null;
    hasDefault?: boolean | null;
    ordinal?: number | string | null;
};

type FunctionReturnColumnRow = {
    name?: string | null;
    dataType?: string | null;
    nullable?: boolean | null;
};

type FunctionDependencyRow = {
    schemaName?: string | null;
    name?: string | null;
    type?: string | null;
};

type ExtensionRow = {
    name?: string;
    schemaName?: string | null;
    version?: string | null;
    relocatable?: boolean | null;
    comment?: string | null;
};

type TableColumnCountRow = {
    schemaName?: string;
    name?: string;
    columnCount?: number | string | null;
};

type RelationshipRow = {
    sourceSchemaName?: string;
    sourceTableName?: string;
    targetSchemaName?: string;
    targetTableName?: string;
};

type SchemaGraphColumnRow = {
    schemaName?: string;
    tableName?: string;
    columnName?: string;
    dataType?: string | null;
    ordinal?: number | string | null;
    nullable?: boolean | string | number | null;
    primaryKey?: boolean | string | number | null;
};

type SchemaGraphRelationshipRow = {
    constraintName?: string | null;
    sourceSchemaName?: string;
    sourceTableName?: string;
    sourceColumnName?: string;
    targetSchemaName?: string;
    targetTableName?: string;
    targetColumnName?: string;
    sourceUnique?: boolean | string | number | null;
    sourceNullable?: boolean | string | number | null;
    updateAction?: string | null;
    deleteAction?: string | null;
};

type OwnerRow = {
    owner?: string | null;
};

const SYSTEM_SCHEMA_FILTER = `
    n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n.nspname NOT LIKE 'pg_toast%'
`;

function toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value: unknown) {
    return value === true || value === 1 || value === '1' || value === 't' || value === 'true';
}

function postgresReferentialAction(value?: string | null) {
    switch (value) {
        case 'a':
            return 'NO ACTION';
        case 'r':
            return 'RESTRICT';
        case 'c':
            return 'CASCADE';
        case 'n':
            return 'SET NULL';
        case 'd':
            return 'SET DEFAULT';
        default:
            return null;
    }
}

function toIsoString(value: unknown): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function qualifyName(schemaName: string | undefined, objectName: string | undefined): string | null {
    if (!objectName) return null;
    if (!schemaName || schemaName === 'public') {
        return objectName;
    }
    return `${schemaName}.${objectName}`;
}

function splitPostgresFunctionName(value: string, schema?: string | null): { schema: string | null; name: string } {
    const trimmed = value.trim().replace(/^"|"$/g, '');
    const parts = trimmed
        .split('.')
        .map(part => part.trim().replace(/^"|"$/g, ''))
        .filter(Boolean);
    if (parts.length >= 2) {
        return { schema: parts[parts.length - 2], name: parts[parts.length - 1] };
    }
    return { schema: schema?.trim() || null, name: parts[0] || trimmed };
}

function quotePostgresName(name: string) {
    return `"${name.replace(/"/g, '""')}"`;
}

function mapPostgresFunctionKind(kind?: string | null): DatabaseFunctionKind {
    switch (kind) {
        case 'a':
            return 'aggregate';
        case 'p':
            return 'procedure';
        case 'w':
            return 'function';
        case 'f':
        default:
            return 'function';
    }
}

function mapPostgresParameterMode(mode?: string | null): 'in' | 'out' | 'inout' | 'unknown' {
    switch (mode) {
        case 'i':
            return 'in';
        case 'o':
            return 'out';
        case 'b':
            return 'inout';
        case 'v':
            return 'in';
        case 't':
            return 'out';
        default:
            return 'in';
    }
}

function samplePostgresValue(type?: string | null) {
    const upper = (type ?? '').toUpperCase();
    if (upper.includes('CHAR') || upper.includes('TEXT') || upper.includes('UUID')) return "'sample'";
    if (upper.includes('DATE') || upper.includes('TIME')) return "'2026-01-01'";
    if (upper.includes('BOOL')) return 'true';
    return '1';
}

function normalizeObjectRow(row: ObjectRow): DatabaseObjectRow | null {
    const name = qualifyName(row.schemaName, row.name);
    if (!name) return null;

    return {
        name,
        engine: normalizePostgresTableKind(row.relkind),
        totalBytes: toNumberOrNull(row.totalBytes),
        totalRows: toNumberOrNull(row.totalRows),
        comment: row.comment ?? null,
        lastModified: toIsoString(row.lastModified),
    };
}

function isTableLike(engine?: string | null) {
    return engine === 'table' || engine === 'partitioned' || engine === 'foreign_table';
}

function parseTableName(table: string): { schema: string | null; name: string } {
    const trimmed = table.trim();
    const [schema, ...rest] = trimmed.split('.');
    if (rest.length === 0) {
        return { schema: null, name: schema };
    }
    return {
        schema,
        name: rest.join('.'),
    };
}

function buildSchemaClause(alias: string) {
    return `AND ($1::text IS NULL OR ${alias} = $1)`;
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

function detectNamingPatterns(tables: DatabaseObjectRow[]) {
    const domainCounts = new Map<string, number>();
    const partitionCounts = new Map<string, number>();

    for (const table of tables) {
        const baseName = table.name.includes('.') ? table.name.split('.').slice(1).join('.') : table.name;
        const domainPrefix = baseName.split('_')[0]?.trim();
        if (domainPrefix && domainPrefix.length > 1 && baseName.includes('_')) {
            domainCounts.set(domainPrefix, (domainCounts.get(domainPrefix) ?? 0) + 1);
        }

        const partitionMatch = baseName.match(/^(.+)_p\d{4}.*$/i);
        if (partitionMatch?.[1]) {
            partitionCounts.set(partitionMatch[1], (partitionCounts.get(partitionMatch[1]) ?? 0) + 1);
        }
    }

    const patterns = [
        ...Array.from(partitionCounts.entries())
            .filter(([, count]) => count >= 2)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([prefix]) => ({
                kind: 'partition' as const,
                label: `${prefix}_p*`,
            })),
        ...Array.from(domainCounts.entries())
            .filter(([, count]) => count >= 2)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([prefix]) => ({
                kind: 'domain' as const,
                label: `${prefix}_*`,
            })),
    ];

    return patterns.slice(0, 4);
}

function buildRelationshipPaths(rows: RelationshipRow[]) {
    const edges = rows
        .map(row => {
            const source = qualifyName(row.sourceSchemaName, row.sourceTableName);
            const target = qualifyName(row.targetSchemaName, row.targetTableName);
            if (!source || !target) return null;
            return { source, target };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));

    const incoming = new Map<string, Set<string>>();
    const outgoing = new Map<string, Set<string>>();
    const degree = new Map<string, number>();

    for (const edge of edges) {
        if (!incoming.has(edge.target)) incoming.set(edge.target, new Set());
        if (!outgoing.has(edge.source)) outgoing.set(edge.source, new Set());
        incoming.get(edge.target)?.add(edge.source);
        outgoing.get(edge.source)?.add(edge.target);
        degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
        degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }

    const candidates = new Map<string, number>();

    for (const [middle, sources] of incoming.entries()) {
        const targets = outgoing.get(middle);
        if (!targets?.size) continue;
        for (const source of sources) {
            for (const target of targets) {
                if (source === target) continue;
                const path = `${source} -> ${middle} -> ${target}`;
                const score = (degree.get(source) ?? 0) + (degree.get(middle) ?? 0) + (degree.get(target) ?? 0);
                candidates.set(path, Math.max(candidates.get(path) ?? 0, score));
            }
        }
    }

    for (const edge of edges) {
        const path = `${edge.source} -> ${edge.target}`;
        const score = (degree.get(edge.source) ?? 0) + (degree.get(edge.target) ?? 0);
        candidates.set(path, Math.max(candidates.get(path) ?? 0, score));
    }

    return Array.from(candidates.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([path]) => ({ path }));
}

async function getSchemaOwner(datasource: PostgresDatasource, database: string, schemaName?: string | null) {
    if (!schemaName) return null;

    const result = await datasource.queryWithContext<OwnerRow>(
        `
            SELECT pg_get_userbyid(n.nspowner) AS owner
            FROM pg_namespace n
            WHERE n.nspname = $1
            LIMIT 1
        `,
        {
            database,
            params: [schemaName],
        },
    );

    return result.rows[0]?.owner ?? null;
}

async function getColumnCountsByTable(datasource: PostgresDatasource, database: string, schemaName?: string | null) {
    const result = await datasource.queryWithContext<TableColumnCountRow>(
        `
            SELECT
                n.nspname AS "schemaName",
                c.relname AS name,
                COUNT(a.attnum) AS "columnCount"
            FROM pg_class c
            JOIN pg_namespace n
              ON n.oid = c.relnamespace
            JOIN pg_attribute a
              ON a.attrelid = c.oid
            WHERE ${SYSTEM_SCHEMA_FILTER}
              ${buildSchemaClause('n.nspname')}
              AND c.relkind IN ('r', 'p', 'f')
              AND a.attnum > 0
              AND NOT a.attisdropped
            GROUP BY n.nspname, c.relname
            ORDER BY n.nspname, c.relname
        `,
        {
            database,
            params: [schemaName ?? null],
        },
    );

    return result.rows
        .map(row => {
            const name = qualifyName(row.schemaName, row.name);
            if (!name) return null;
            return {
                name,
                columnCount: toNumberOrNull(row.columnCount),
            };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
}

async function getForeignKeyRelationships(datasource: PostgresDatasource, database: string, schemaName?: string | null) {
    const result = await datasource.queryWithContext<RelationshipRow>(
        `
            SELECT
                src_ns.nspname AS "sourceSchemaName",
                src.relname AS "sourceTableName",
                tgt_ns.nspname AS "targetSchemaName",
                tgt.relname AS "targetTableName"
            FROM pg_constraint con
            JOIN pg_class src
              ON src.oid = con.conrelid
            JOIN pg_namespace src_ns
              ON src_ns.oid = src.relnamespace
            JOIN pg_class tgt
              ON tgt.oid = con.confrelid
            JOIN pg_namespace tgt_ns
              ON tgt_ns.oid = tgt.relnamespace
            WHERE con.contype = 'f'
              AND ${SYSTEM_SCHEMA_FILTER.replaceAll('n.', 'src_ns.')}
              AND ${SYSTEM_SCHEMA_FILTER.replaceAll('n.', 'tgt_ns.')}
              ${buildSchemaClause('src_ns.nspname')}
              AND ($1::text IS NULL OR tgt_ns.nspname = $1)
            ORDER BY src_ns.nspname, src.relname, tgt_ns.nspname, tgt.relname
        `,
        {
            database,
            params: [schemaName ?? null],
        },
    );

    return result.rows;
}

async function getSchemaGraph(datasource: PostgresDatasource, options: SchemaGraphOptions): Promise<SchemaGraphResult> {
    const [columnResult, relationshipResult] = await Promise.all([
        datasource.queryWithContext<SchemaGraphColumnRow>(
            `
                SELECT
                    ns.nspname AS "schemaName",
                    cls.relname AS "tableName",
                    att.attname AS "columnName",
                    pg_catalog.format_type(att.atttypid, att.atttypmod) AS "dataType",
                    att.attnum AS ordinal,
                    NOT att.attnotnull AS nullable,
                    EXISTS (
                        SELECT 1
                        FROM pg_index idx
                        WHERE idx.indrelid = cls.oid
                          AND idx.indisprimary
                          AND att.attnum = ANY(idx.indkey)
                    ) AS "primaryKey"
                FROM pg_class cls
                JOIN pg_namespace ns ON ns.oid = cls.relnamespace
                JOIN pg_attribute att ON att.attrelid = cls.oid
                WHERE ns.nspname NOT IN ('pg_catalog', 'information_schema')
                  AND ns.nspname NOT LIKE 'pg_toast%'
                  AND cls.relkind IN ('r', 'p', 'f')
                  AND att.attnum > 0
                  AND NOT att.attisdropped
                ORDER BY ns.nspname, cls.relname, att.attnum
            `,
            { database: options.database },
        ),
        datasource.queryWithContext<SchemaGraphRelationshipRow>(
            `
                SELECT
                    con.conname AS "constraintName",
                    src_ns.nspname AS "sourceSchemaName",
                    src.relname AS "sourceTableName",
                    src_att.attname AS "sourceColumnName",
                    tgt_ns.nspname AS "targetSchemaName",
                    tgt.relname AS "targetTableName",
                    tgt_att.attname AS "targetColumnName",
                    EXISTS (
                        SELECT 1
                        FROM pg_index idx
                        WHERE idx.indrelid = src.oid
                          AND idx.indisunique
                          AND idx.indpred IS NULL
                          AND idx.indnkeyatts = cardinality(con.conkey)
                          AND NOT EXISTS (
                              SELECT 1
                              FROM unnest(con.conkey) AS key_column(attnum)
                              WHERE NOT (key_column.attnum = ANY(idx.indkey))
                          )
                    ) AS "sourceUnique",
                    NOT src_att.attnotnull AS "sourceNullable",
                    con.confupdtype AS "updateAction",
                    con.confdeltype AS "deleteAction"
                FROM pg_constraint con
                JOIN pg_class src ON src.oid = con.conrelid
                JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace
                JOIN pg_class tgt ON tgt.oid = con.confrelid
                JOIN pg_namespace tgt_ns ON tgt_ns.oid = tgt.relnamespace
                JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS src_key(attnum, ordinality) ON TRUE
                JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS tgt_key(attnum, ordinality) ON tgt_key.ordinality = src_key.ordinality
                JOIN pg_attribute src_att ON src_att.attrelid = src.oid AND src_att.attnum = src_key.attnum
                JOIN pg_attribute tgt_att ON tgt_att.attrelid = tgt.oid AND tgt_att.attnum = tgt_key.attnum
                WHERE con.contype = 'f'
                  AND src_ns.nspname NOT IN ('pg_catalog', 'information_schema')
                  AND src_ns.nspname NOT LIKE 'pg_toast%'
                  AND tgt_ns.nspname NOT IN ('pg_catalog', 'information_schema')
                  AND tgt_ns.nspname NOT LIKE 'pg_toast%'
                ORDER BY src_ns.nspname, src.relname, con.conname, src_key.ordinality
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
            nullable: row.nullable == null ? null : toBoolean(row.nullable),
            isPrimaryKey: toBoolean(row.primaryKey),
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
            sourceUnique: row.sourceUnique == null ? null : toBoolean(row.sourceUnique),
            sourceOptional: false,
            onUpdate: postgresReferentialAction(row.updateAction),
            onDelete: postgresReferentialAction(row.deleteAction),
        };
        relationship.sourceColumns.push(sourceColumn);
        relationship.targetColumns.push(targetColumn);
        relationship.sourceOptional = Boolean(relationship.sourceOptional) || toBoolean(row.sourceNullable);
        relationshipsByKey.set(key, relationship);
    }

    return buildSchemaGraphResult(options, Array.from(tablesByKey.values()), Array.from(relationshipsByKey.values()), {
        relationships: true,
        compositeForeignKeys: true,
        cardinality: true,
        referentialActions: true,
        constraintsEnforced: true,
    });
}

async function getDatabases(datasource: PostgresDatasource) {
    const result = await datasource.query<{
        databaseName: string;
    }>(
        `
            SELECT datname AS "databaseName"
            FROM pg_database
            WHERE datallowconn
              AND NOT datistemplate
            ORDER BY datname
        `,
    );

    return result.rows.map(row => ({
        value: row.databaseName,
        label: row.databaseName,
    }));
}

async function getTables(datasource: PostgresDatasource, database?: string) {
    const result = await datasource.queryWithContext<{
        schemaName: string;
        tableName: string;
    }>(
        `
            SELECT
                table_schema AS "schemaName",
                table_name AS "tableName"
            FROM information_schema.tables
            WHERE table_type = 'BASE TABLE'
              AND table_schema NOT IN ('pg_catalog', 'information_schema')
            ORDER BY table_schema, table_name
        `,
        { database },
    );

    return result.rows
        .map(row => {
            const value = qualifyName(row.schemaName, row.tableName);
            if (!value) return null;
            return {
                value,
                label: value,
                database,
                schema: row.schemaName,
            };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));
}

async function getSchemas(datasource: PostgresDatasource, database: string) {
    const result = await datasource.queryWithContext<{
        schemaName: string;
    }>(
        `
            SELECT schema_name AS "schemaName"
            FROM information_schema.schemata
            WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
              AND schema_name NOT LIKE 'pg_toast%'
            ORDER BY schema_name
        `,
        { database },
    );

    return result.rows
        .map(row => row.schemaName?.trim())
        .filter((schemaName): schemaName is string => Boolean(schemaName))
        .map(schemaName => ({
            value: schemaName,
            label: schemaName,
        }));
}

async function getSchema(datasource: PostgresDatasource, database?: string): Promise<ConnectionSchemaMap> {
    const result = await datasource.queryWithContext<{
        schemaName: string;
        tableName: string;
        columnName: string;
    }>(
        `
            SELECT
                table_schema AS "schemaName",
                table_name AS "tableName",
                column_name AS "columnName"
            FROM information_schema.columns
            WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
            ORDER BY table_schema, table_name, ordinal_position
        `,
        { database },
    );

    return result.rows.reduce<ConnectionSchemaMap>((acc, row) => {
        const tableName = qualifyName(row.schemaName, row.tableName);
        const columnName = row.columnName?.trim();
        if (!tableName || !columnName) {
            return acc;
        }
        if (!acc[tableName]) {
            acc[tableName] = [];
        }
        acc[tableName].push(columnName);
        return acc;
    }, {});
}

async function getTableColumns(datasource: PostgresDatasource, database: string, table: string): Promise<TableColumnInfo[]> {
    const parsed = parseTableName(table);
    const result = await datasource.queryWithContext<TableColumnInfo>(
        `
            SELECT
                cols.column_name AS "columnName",
                cols.udt_name AS "columnType",
                CASE WHEN cols.column_default IS NULL THEN NULL ELSE 'DEFAULT' END AS "defaultKind",
                cols.column_default AS "defaultExpression",
                cols.is_nullable = 'YES' AS nullable,
                EXISTS (
                    SELECT 1
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                      ON tc.constraint_name = kcu.constraint_name
                     AND tc.table_schema = kcu.table_schema
                     AND tc.table_name = kcu.table_name
                    WHERE tc.constraint_type = 'PRIMARY KEY'
                      AND tc.table_schema = cols.table_schema
                      AND tc.table_name = cols.table_name
                      AND kcu.column_name = cols.column_name
                ) AS "isPrimaryKey",
                pgd.description AS comment
            FROM information_schema.columns cols
            JOIN pg_catalog.pg_class cls
              ON cls.relname = cols.table_name
            JOIN pg_catalog.pg_namespace ns
              ON ns.oid = cls.relnamespace
             AND ns.nspname = cols.table_schema
            LEFT JOIN pg_catalog.pg_description pgd
              ON pgd.objoid = cls.oid
             AND pgd.objsubid = cols.ordinal_position
            WHERE cols.table_schema = COALESCE($1, current_schema())
              AND cols.table_name = $2
            ORDER BY cols.ordinal_position
        `,
        {
            database,
            params: [parsed.schema, parsed.name],
        },
    );

    return Array.isArray(result.rows) ? result.rows : [];
}

async function getDatabaseTablesDetail(datasource: PostgresDatasource, database: string, schemaName?: string | null): Promise<DatabaseObjectRow[]> {
    const result = await datasource.queryWithContext<ObjectRow>(
        `
            SELECT
                n.nspname AS "schemaName",
                c.relname AS name,
                c.relkind AS relkind,
                pg_total_relation_size(c.oid) AS "totalBytes",
                COALESCE(s.n_live_tup, c.reltuples) AS "totalRows",
                obj_description(c.oid, 'pg_class') AS comment,
                GREATEST(s.last_vacuum, s.last_autovacuum, s.last_analyze, s.last_autoanalyze) AS "lastModified"
            FROM pg_class c
            JOIN pg_namespace n
              ON n.oid = c.relnamespace
            LEFT JOIN pg_stat_user_tables s
              ON s.relid = c.oid
            WHERE ${SYSTEM_SCHEMA_FILTER}
              ${buildSchemaClause('n.nspname')}
              AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
            ORDER BY n.nspname, c.relname
        `,
        {
            database,
            params: [schemaName ?? null],
        },
    );

    return result.rows.map(normalizeObjectRow).filter((row): row is DatabaseObjectRow => Boolean(row));
}

async function getTablesOnly(datasource: PostgresDatasource, database: string): Promise<DatabaseObjectRow[]> {
    const rows = await getDatabaseTablesDetail(datasource, database);
    return rows.filter(row => isTableLike(row.engine));
}

async function getViews(datasource: PostgresDatasource, database: string): Promise<DatabaseObjectRow[]> {
    const rows = await getDatabaseTablesDetail(datasource, database);
    return rows.filter(row => row.engine === 'view');
}

async function getMaterializedViews(datasource: PostgresDatasource, database: string): Promise<DatabaseObjectRow[]> {
    const rows = await getDatabaseTablesDetail(datasource, database);
    return rows.filter(row => row.engine === 'materialized_view');
}

async function getFunctions(datasource: PostgresDatasource, database?: string, schemaName?: string | null) {
    const result = await datasource.queryWithContext<FunctionRow>(
        `
            SELECT
                n.nspname AS "schemaName",
                p.proname AS name
            FROM pg_proc p
            JOIN pg_namespace n
              ON n.oid = p.pronamespace
            WHERE ${SYSTEM_SCHEMA_FILTER}
              ${buildSchemaClause('n.nspname')}
            ORDER BY n.nspname, p.proname
        `,
        {
            database,
            params: [schemaName ?? null],
        },
    );

    return result.rows
        .map<DatabaseFunctionMeta | null>(row => {
            const name = qualifyName(row.schemaName, row.name);
            if (!name) return null;
            return { label: name, value: name, schema: row.schemaName ?? null, kind: 'function' as const };
        })
        .filter((row): row is DatabaseFunctionMeta => Boolean(row));
}

async function getFunctionDetail(datasource: PostgresDatasource, database: string, functionName: string, schema?: string | null): Promise<DatabaseFunctionDetail | null> {
    const target = splitPostgresFunctionName(functionName, schema);
    const detailResult = await datasource.queryWithContext<FunctionDetailRow>(
        `
            SELECT
                p.oid,
                n.nspname AS "schemaName",
                p.proname AS name,
                pg_get_userbyid(p.proowner) AS owner,
                p.prokind AS kind,
                pg_get_function_arguments(p.oid) AS arguments,
                pg_get_function_identity_arguments(p.oid) AS "identityArguments",
                pg_get_function_result(p.oid) AS "resultType",
                pg_get_functiondef(p.oid) AS definition,
                p.proretset AS "returnsSet",
                p.provolatile AS volatility
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE p.proname = $1
              AND ($2::text IS NULL OR n.nspname = $2)
              AND ${SYSTEM_SCHEMA_FILTER}
            ORDER BY n.nspname, p.proname
            LIMIT 1
        `,
        { database, params: [target.name, target.schema] },
    );
    const detail = detailResult.rows[0];
    if (!detail?.oid || !detail.name) return null;
    const oid = Number(detail.oid);

    const [parameterResult, returnColumnResult, dependencyResult, usedByResult] = await Promise.all([
        datasource.queryWithContext<FunctionParameterRow>(
            `
                SELECT
                    COALESCE(parameter_name, '') AS name,
                    parameter_mode AS mode,
                    data_type AS "dataType",
                    parameter_default IS NOT NULL AS "hasDefault",
                    ordinal_position AS ordinal
                FROM information_schema.parameters
                WHERE specific_schema = $1
                  AND specific_name LIKE $2 || '\\_%'
                ORDER BY ordinal_position
            `,
            { database, params: [detail.schemaName, detail.name] },
        ),
        datasource.queryWithContext<FunctionReturnColumnRow>(
            `
                SELECT
                    a.attname AS name,
                    pg_catalog.format_type(a.atttypid, a.atttypmod) AS "dataType",
                    NOT a.attnotnull AS nullable
                FROM pg_attribute a
                WHERE a.attrelid = (
                    SELECT p.prorettype
                    FROM pg_proc p
                    WHERE p.oid = $1::oid
                )
                  AND a.attnum > 0
                  AND NOT a.attisdropped
                ORDER BY a.attnum
            `,
            { database, params: [oid] },
        ),
        datasource
            .queryWithContext<FunctionDependencyRow>(
                `
                SELECT DISTINCT
                    rn.nspname AS "schemaName",
                    rc.relname AS name,
                    CASE rc.relkind
                        WHEN 'r' THEN 'table'
                        WHEN 'v' THEN 'view'
                        WHEN 'm' THEN 'materialized_view'
                        WHEN 'S' THEN 'sequence'
                        ELSE rc.relkind::text
                    END AS type
                FROM pg_depend d
                JOIN pg_rewrite rw ON rw.oid = d.objid
                JOIN pg_class rc ON rc.oid = d.refobjid
                JOIN pg_namespace rn ON rn.oid = rc.relnamespace
                WHERE rw.ev_class = $1::oid
                ORDER BY rn.nspname, rc.relname
            `,
                { database, params: [oid] },
            )
            .catch(() => ({ rows: [] as FunctionDependencyRow[] })),
        datasource
            .queryWithContext<FunctionDependencyRow>(
                `
                SELECT DISTINCT
                    n.nspname AS "schemaName",
                    p.proname AS name,
                    CASE p.prokind WHEN 'p' THEN 'procedure' WHEN 'a' THEN 'aggregate' ELSE 'function' END AS type
                FROM pg_depend d
                JOIN pg_proc p ON p.oid = d.objid
                JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE d.refobjid = $1::oid
                ORDER BY n.nspname, p.proname
            `,
                { database, params: [oid] },
            )
            .catch(() => ({ rows: [] as FunctionDependencyRow[] })),
    ]);

    const parameters = parameterResult.rows
        .filter(row => row.mode !== 'OUT' && row.mode !== 'TABLE')
        .map((row, index) => ({
            name: row.name?.trim() || `arg${index + 1}`,
            dataType: row.dataType ?? null,
            nullable: null,
            hasDefault: row.hasDefault ?? null,
            mode: mapPostgresParameterMode(row.mode?.slice(0, 1).toLowerCase()),
        }));
    const kind = mapPostgresFunctionKind(detail.kind);
    const schemaName = detail.schemaName ?? target.schema;
    const qualifiedName = schemaName ? `${quotePostgresName(schemaName)}.${quotePostgresName(detail.name)}` : quotePostgresName(detail.name);
    const returnColumns = returnColumnResult.rows.map(row => ({
        name: row.name ?? '',
        dataType: row.dataType ?? null,
        nullable: row.nullable ?? null,
    }));
    const callArgs = parameters
        .filter(param => param.mode !== 'out')
        .map(param => samplePostgresValue(param.dataType))
        .join(', ');
    const sampleCallSql = kind === 'procedure' ? `CALL ${qualifiedName}(${callArgs});` : `SELECT ${qualifiedName}(${callArgs});`;
    const returnType = detail.resultType ?? null;

    return {
        name: detail.name,
        schema: schemaName ?? null,
        qualifiedName,
        kind: returnColumns.length > 0 ? 'table' : kind,
        signature: `${qualifiedName}(${detail.identityArguments ?? detail.arguments ?? ''})${returnType ? ` -> ${returnType}` : ''}`,
        owner: detail.owner ?? null,
        createdAt: null,
        modifiedAt: null,
        parameters,
        returnType,
        returnColumns,
        definition: detail.definition ?? null,
        sampleCallSql,
        dependencies: dependencyResult.rows.filter(row => row.name).map(row => ({ name: row.name!, schema: row.schemaName ?? null, type: row.type ?? null })),
        usedBy: usedByResult.rows.filter(row => row.name).map(row => ({ name: row.name!, schema: row.schemaName ?? null, type: row.type ?? null })),
    };
}

async function getSequences(datasource: PostgresDatasource, database?: string) {
    const result = await datasource.queryWithContext<ObjectRow>(
        `
            SELECT
                n.nspname AS "schemaName",
                c.relname AS name,
                c.relkind AS relkind,
                obj_description(c.oid, 'pg_class') AS comment
            FROM pg_class c
            JOIN pg_namespace n
              ON n.oid = c.relnamespace
            WHERE ${SYSTEM_SCHEMA_FILTER}
              AND c.relkind = 'S'
            ORDER BY n.nspname, c.relname
        `,
        { database },
    );

    return result.rows.map(normalizeObjectRow).filter((row): row is DatabaseObjectRow => Boolean(row));
}

async function getExtensions(datasource: PostgresDatasource, database?: string): Promise<DatabaseExtensionMeta[]> {
    const result = await datasource.queryWithContext<ExtensionRow>(
        `
            SELECT
                ext.extname AS name,
                ns.nspname AS "schemaName",
                ext.extversion AS version,
                ext.extrelocatable AS relocatable,
                obj_description(ext.oid, 'pg_extension') AS comment
            FROM pg_extension ext
            LEFT JOIN pg_namespace ns
              ON ns.oid = ext.extnamespace
            ORDER BY ext.extname
        `,
        { database },
    );

    return result.rows
        .filter(row => row.name)
        .map(row => ({
            name: row.name as string,
            schema: row.schemaName ?? null,
            version: row.version ?? null,
            relocatable: row.relocatable ?? null,
            comment: row.comment ?? null,
        }));
}

async function getDatabaseSummary(datasource: PostgresDatasource, options: DatabaseSummaryOptions): Promise<DatabaseSummary> {
    const rows = await getDatabaseTablesDetail(datasource, options.database, options.schemaName);
    const tables = rows.filter(row => isTableLike(row.engine));
    const views = rows.filter(row => row.engine === 'view');
    const materializedViews = rows.filter(row => row.engine === 'materialized_view');
    const [functions, columnCounts, relationshipRows, owner] = await Promise.all([
        getFunctions(datasource, options.database, options.schemaName),
        getColumnCountsByTable(datasource, options.database, options.schemaName),
        getForeignKeyRelationships(datasource, options.database, options.schemaName),
        getSchemaOwner(datasource, options.database, options.schemaName),
    ]);
    const recentTables = [...rows]
        .sort((a, b) => {
            const left = a.lastModified ? new Date(a.lastModified).getTime() : 0;
            const right = b.lastModified ? new Date(b.lastModified).getTime() : 0;
            return right - left;
        })
        .slice(0, 5)
        .map(row => ({
            name: row.name,
            lastUpdatedAt: row.lastModified ?? null,
        }));

    const topTablesByBytes = [...tables]
        .sort((a, b) => (b.totalBytes ?? 0) - (a.totalBytes ?? 0))
        .slice(0, 5)
        .map(row => ({
            name: row.name,
            bytes: row.totalBytes ?? null,
            rowsEstimate: row.totalRows ?? null,
            comment: row.comment ?? null,
        }));

    const topTablesByRows = [...tables]
        .sort((a, b) => (b.totalRows ?? 0) - (a.totalRows ?? 0))
        .slice(0, 5)
        .map(row => ({
            name: row.name,
            bytes: row.totalBytes ?? null,
            rowsEstimate: row.totalRows ?? null,
            comment: row.comment ?? null,
        }));

    const lastUpdatedAt = recentTables[0]?.lastUpdatedAt ?? null;
    const rowsForDistribution = tables.map(row => row.totalRows ?? 0);
    const smallTablesCount = rowsForDistribution.filter(rowCount => rowCount < 1000).length;
    const mediumTablesCount = rowsForDistribution.filter(rowCount => rowCount >= 1000 && rowCount <= 100000).length;
    const largeTablesCount = rowsForDistribution.filter(rowCount => rowCount > 100000).length;
    const averageColumnsPerTable = columnCounts.length > 0 ? Number((columnCounts.reduce((sum, row) => sum + (row.columnCount ?? 0), 0) / columnCounts.length).toFixed(1)) : null;
    const widestTable =
        [...columnCounts]
            .sort((a, b) => (b.columnCount ?? 0) - (a.columnCount ?? 0))
            .map(row => ({
                name: row.name,
                columnCount: row.columnCount ?? null,
            }))[0] ?? null;
    const relationshipPaths = buildRelationshipPaths(relationshipRows);
    const relationshipDegree = new Map<string, number>();

    for (const row of relationshipRows) {
        const source = qualifyName(row.sourceSchemaName, row.sourceTableName);
        const target = qualifyName(row.targetSchemaName, row.targetTableName);
        if (source) relationshipDegree.set(source, (relationshipDegree.get(source) ?? 0) + 1);
        if (target) relationshipDegree.set(target, (relationshipDegree.get(target) ?? 0) + 1);
    }

    const largestByRowsName = topTablesByRows[0]?.name ?? null;
    const largestByBytesName = topTablesByBytes[0]?.name ?? null;
    const recentNames = new Set(recentTables.slice(0, 3).map(row => row.name));
    const recommendationCandidates = [...tables]
        .map(row => {
            const degree = relationshipDegree.get(row.name) ?? 0;
            const rowScore = row.totalRows ?? 0;
            const byteScore = row.totalBytes ?? 0;
            const recentBoost = recentNames.has(row.name) ? 1 : 0;
            return {
                ...row,
                score: degree * 1_000_000_000 + rowScore + byteScore / 1024 + recentBoost * 100_000_000,
                reason: summarizeReason({
                    hasRelationships: degree > 0,
                    isLargestByRows: row.name === largestByRowsName,
                    isLargestByBytes: row.name === largestByBytesName,
                    isRecent: recentNames.has(row.name),
                }),
            };
        })
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    const coreTables: DatabaseSummaryRecommendation[] = recommendationCandidates.slice(0, 3).map(row => ({
        name: row.name,
        reason: row.reason,
        bytes: row.totalBytes ?? null,
        rowsEstimate: row.totalRows ?? null,
    }));
    const startHere: DatabaseSummaryRecommendation[] =
        coreTables.length > 0
            ? coreTables
            : topTablesByBytes.slice(0, 3).map(row => ({
                  name: row.name,
                  reason: row.name === largestByBytesName ? 'largeStorageFootprint' : 'goodStartingPoint',
                  bytes: row.bytes,
                  rowsEstimate: row.rowsEstimate,
              }));
    const detectedPatterns = detectNamingPatterns(tables);

    return {
        databaseName: options.database,
        catalogName: options.catalogName ?? null,
        schemaName: options.schemaName ?? null,
        engine: options.engine ?? 'postgres',
        cluster: options.cluster ?? null,
        owner,
        tablesCount: tables.length,
        viewsCount: views.length,
        materializedViewsCount: materializedViews.length,
        functionsCount: functions.length,
        totalBytes: tables.reduce<number>((sum, row) => sum + (row.totalBytes ?? 0), 0),
        totalRowsEstimate: tables.reduce<number>((sum, row) => sum + (row.totalRows ?? 0), 0),
        lastUpdatedAt,
        lastQueriedAt: null,
        tableSizeDistribution: {
            smallTablesCount,
            mediumTablesCount,
            largeTablesCount,
        },
        columnComplexity: {
            averageColumnsPerTable,
            maxColumns: widestTable?.columnCount ?? null,
            maxColumnsTable: widestTable?.name ?? null,
        },
        foreignKeyLinksCount: relationshipRows.length,
        relationshipPaths,
        detectedPatterns,
        coreTables,
        topTablesByBytes,
        topTablesByRows,
        recentTables,
        startHere,
        oneLineSummary: null,
    };
}

export function createPostgresMetadataCapability(datasource: PostgresDatasource): PostgresMetadataAPI {
    return {
        getDatabases: () => getDatabases(datasource),
        getTables: database => getTables(datasource, database),
        getSchemas: database => getSchemas(datasource, database),
        getSchema: database => getSchema(datasource, database),
        getTableColumns: (database, table) => getTableColumns(datasource, database, table),
        getTablesOnly: database => getTablesOnly(datasource, database),
        getViews: database => getViews(datasource, database),
        getMaterializedViews: database => getMaterializedViews(datasource, database),
        getFunctions: database => getFunctions(datasource, database),
        getFunctionDetail: (database, functionName, schema) => getFunctionDetail(datasource, database, functionName, schema),
        getSequences: database => getSequences(datasource, database),
        getExtensions: database => getExtensions(datasource, database),
        getDatabaseSummary: options => getDatabaseSummary(datasource, options),
        getDatabaseTablesDetail: database => getDatabaseTablesDetail(datasource, database),
        getSchemaGraph: options => getSchemaGraph(datasource, options),
        getSchemaSnapshot: input => getPostgresSchemaSnapshot(datasource, datasource.config.type, input),
    };
}

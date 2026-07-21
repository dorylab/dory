import { DEFAULT_MAX_RESULT_ROWS } from '@dory/drivers/types';
import { compileParams, enforceSelectLimit } from '@dory/drivers/core';
import type { DriverQueryParams } from '@dory/drivers/core';
import type { BaseConfig, DriverQueryRowStream, HealthInfo, QueryResult, SchemaGraphOptions, SchemaGraphResult, TableColumnInfo, TablePreviewOptions } from '@dory/drivers/types';
import { buildSchemaGraphResult, type SchemaGraphRelationshipInput, type SchemaGraphTableInput } from '@dory/drivers/core';
import { buildTablePreviewClauses, normalizeTablePreviewLimit, normalizeTablePreviewOffset } from '../shared/table-preview-query';
import { CloudflareD1Dialect } from './dialect';

type CloudflareD1Meta = {
    changed_db?: boolean;
    changes?: number;
    duration?: number;
    last_row_id?: number;
    rows_read?: number;
    rows_written?: number;
    served_by_colo?: string;
    served_by_primary?: boolean;
    served_by_region?: string;
    size_after?: number;
    timings?: {
        sql_duration_ms?: number;
    };
};

type CloudflareD1Result = {
    success?: boolean;
    results?:
        | Array<Record<string, unknown>>
        | {
              columns?: string[];
              rows?: unknown[][];
          };
    meta?: CloudflareD1Meta;
    error?: string;
};

type CloudflareD1Response = {
    success?: boolean;
    errors?: Array<{ code?: number | string; message?: string }>;
    messages?: Array<{ code?: number | string; message?: string }>;
    result?: CloudflareD1Result[];
};

type CountRow = {
    totalRows?: number | string | bigint | null;
};

const DEFAULT_API_BASE_URL = 'https://api.cloudflare.com/client/v4';
const D1_PRIMARY_DATABASE = 'main';

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function requiredString(value: unknown, label: string) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) {
        throw new Error(`${label} is required`);
    }
    return normalized;
}

function normalizeApiBaseUrl(value: unknown) {
    const raw = typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_API_BASE_URL;
    return raw.replace(/\/+$/, '');
}

function getD1Config(config: BaseConfig) {
    const options = asRecord(config.options);
    return {
        accountId: requiredString(options.accountId, 'Cloudflare account ID'),
        databaseId: requiredString(config.database, 'Cloudflare D1 database ID'),
        apiToken: requiredString(config.password, 'Cloudflare API token'),
        apiBaseUrl: normalizeApiBaseUrl(options.apiBaseUrl),
    };
}

function quoteIdentifier(identifier: string) {
    return `"${identifier.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string) {
    return `'${value.replace(/'/g, "''")}'`;
}

function normalizeDatabaseName(database?: string | null): string {
    const normalized = database?.trim();
    return normalized || D1_PRIMARY_DATABASE;
}

function buildQualifiedName(database: string, objectName: string) {
    return `${quoteIdentifier(normalizeDatabaseName(database))}.${quoteIdentifier(objectName)}`;
}

function buildPragma(database: string, pragmaName: string, value: string) {
    return `PRAGMA ${quoteIdentifier(normalizeDatabaseName(database))}.${pragmaName}(${quoteLiteral(value)})`;
}

function formatColumnDdl(column: TableColumnInfo) {
    const parts = [quoteIdentifier(column.columnName)];
    if (column.columnType?.trim()) {
        parts.push(column.columnType.trim());
    }
    if (column.isPrimaryKey) {
        parts.push('PRIMARY KEY');
    }
    if (column.defaultExpression?.trim()) {
        parts.push(`DEFAULT ${column.defaultExpression.trim()}`);
    }
    return parts.join(' ');
}

async function synthesizeCloudflareD1TableDdl(config: BaseConfig, database: string, table: string): Promise<string | null> {
    const columns = await getCloudflareD1TableColumns(config, database, table);
    if (!columns.length) {
        return null;
    }

    return `CREATE TABLE ${quoteIdentifier(table)} (\n${columns.map(column => `    ${formatColumnDdl(column)}`).join(',\n')}\n);`;
}

function normalizeParams(sql: string, params?: DriverQueryParams) {
    const compiled = compileParams(CloudflareD1Dialect, sql, params);
    return {
        sql: compiled.sql,
        params: compiled.params,
    };
}

function normalizeRows(results: CloudflareD1Result['results']): Record<string, unknown>[] {
    if (!results) return [];
    if (Array.isArray(results)) {
        return results.map(row => asRecord(row));
    }

    const columns = Array.isArray(results.columns) ? results.columns : [];
    const rows = Array.isArray(results.rows) ? results.rows : [];
    return rows.map(row => {
        const mapped: Record<string, unknown> = {};
        columns.forEach((column, index) => {
            mapped[column] = row[index];
        });
        return mapped;
    });
}

function normalizeColumns(rows: Record<string, unknown>[]) {
    const names = new Set<string>();
    for (const row of rows) {
        for (const key of Object.keys(row)) {
            names.add(key);
        }
    }
    return Array.from(names).map(name => ({ name }));
}

function getErrorMessage(payload: CloudflareD1Response, fallback: string) {
    const errors = Array.isArray(payload.errors) ? payload.errors : [];
    const messages = errors.map(error => error.message).filter((message): message is string => Boolean(message?.trim()));
    return messages.join('; ') || fallback;
}

function isReaderSql(sql: string) {
    return /^\s*(select|with|pragma)\b/i.test(sql);
}

export function getCloudflareD1Databases() {
    return [{ label: D1_PRIMARY_DATABASE, value: D1_PRIMARY_DATABASE }];
}

export async function executeCloudflareD1Query<Row = any>(config: BaseConfig, sql: string, params?: DriverQueryParams): Promise<QueryResult<Row>> {
    const d1 = getD1Config(config);
    const { sql: compiledSql, params: compiledParams } = normalizeParams(sql, params);
    const effectiveSql = enforceSelectLimit(compiledSql, DEFAULT_MAX_RESULT_ROWS);
    const body: Record<string, unknown> = { sql: effectiveSql };
    if (Array.isArray(compiledParams) && compiledParams.length > 0) {
        body.params = compiledParams;
    }

    const started = Date.now();
    const response = await fetch(`${d1.apiBaseUrl}/accounts/${encodeURIComponent(d1.accountId)}/d1/database/${encodeURIComponent(d1.databaseId)}/query`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${d1.apiToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const payload = (await response.json().catch(() => null)) as CloudflareD1Response | null;
    if (!response.ok || !payload?.success) {
        throw new Error(getErrorMessage(payload ?? {}, `Cloudflare D1 query failed with status ${response.status}`));
    }

    const firstResult = Array.isArray(payload.result) ? payload.result[0] : undefined;
    if (firstResult?.success === false) {
        throw new Error(firstResult.error || 'Cloudflare D1 query failed');
    }

    const rows = normalizeRows(firstResult?.results) as Row[];
    const meta = firstResult?.meta;
    const reader = isReaderSql(compiledSql);

    return {
        rows,
        rowCount: reader ? rows.length : (meta?.changes ?? rows.length),
        columns: normalizeColumns(rows as Record<string, unknown>[]),
        limited: reader && rows.length >= DEFAULT_MAX_RESULT_ROWS,
        limit: reader ? DEFAULT_MAX_RESULT_ROWS : undefined,
        tookMs: Date.now() - started,
        statistics: {
            cloudflare: {
                meta,
                messages: payload.messages ?? [],
                resultCount: payload.result?.length ?? 0,
            },
        },
    };
}

export async function executeCloudflareD1QueryRowStream<Row = any>(config: BaseConfig, sql: string, params?: DriverQueryParams): Promise<DriverQueryRowStream<Row>> {
    const d1 = getD1Config(config);
    const { sql: compiledSql, params: compiledParams } = normalizeParams(sql, params);
    const body: Record<string, unknown> = { sql: compiledSql };
    if (Array.isArray(compiledParams) && compiledParams.length > 0) {
        body.params = compiledParams;
    }

    const started = Date.now();
    const response = await fetch(`${d1.apiBaseUrl}/accounts/${encodeURIComponent(d1.accountId)}/d1/database/${encodeURIComponent(d1.databaseId)}/query`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${d1.apiToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const payload = (await response.json().catch(() => null)) as CloudflareD1Response | null;
    if (!response.ok || !payload?.success) {
        throw new Error(getErrorMessage(payload ?? {}, `Cloudflare D1 query failed with status ${response.status}`));
    }

    const firstResult = Array.isArray(payload.result) ? payload.result[0] : undefined;
    if (firstResult?.success === false) {
        throw new Error(firstResult.error || 'Cloudflare D1 query failed');
    }

    const rows = normalizeRows(firstResult?.results) as Row[];
    const meta = firstResult?.meta;
    const reader = isReaderSql(compiledSql);

    return {
        rows: (async function* () {
            for (const row of rows) {
                yield row;
            }
        })(),
        rowCount: reader ? null : (meta?.changes ?? rows.length),
        columns: normalizeColumns(rows as Record<string, unknown>[]),
        limited: false,
        tookMs: Date.now() - started,
        statistics: {
            cloudflare: {
                meta,
                messages: payload.messages ?? [],
                resultCount: payload.result?.length ?? 0,
                streamingMode: 'buffered-api',
            },
        },
        close: () => undefined,
    };
}

export async function pingCloudflareD1(config: BaseConfig): Promise<HealthInfo> {
    const started = Date.now();
    await executeCloudflareD1Query(config, 'SELECT 1 AS ok');
    return {
        ok: true,
        tookMs: Date.now() - started,
    };
}

export async function getCloudflareD1Tables(config: BaseConfig, database?: string | null) {
    const targetDatabase = normalizeDatabaseName(database);
    const result = await executeCloudflareD1Query<{ name: string; comment: string | null }>(
        config,
        `SELECT name, NULL AS comment
         FROM ${quoteIdentifier(targetDatabase)}.sqlite_schema
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
    );

    return result.rows.map(row => ({
        name: row.name,
        comment: row.comment,
    }));
}

export async function getCloudflareD1Views(config: BaseConfig, database?: string | null) {
    const targetDatabase = normalizeDatabaseName(database);
    const result = await executeCloudflareD1Query<{ name: string; comment: string | null }>(
        config,
        `SELECT name, NULL AS comment
         FROM ${quoteIdentifier(targetDatabase)}.sqlite_schema
         WHERE type = 'view'
         ORDER BY name`,
    );

    return result.rows.map(row => ({
        name: row.name,
        comment: row.comment,
    }));
}

export async function getCloudflareD1TableColumns(config: BaseConfig, database: string, table: string): Promise<TableColumnInfo[]> {
    const result = await executeCloudflareD1Query<{
        name: string;
        type: string | null;
        notnull: number;
        dflt_value: string | null;
        pk: number;
        hidden?: number;
    }>(config, buildPragma(database, 'table_xinfo', table));

    return result.rows
        .filter(row => !row.hidden)
        .map(row => ({
            columnName: row.name,
            columnType: row.type,
            defaultExpression: row.dflt_value,
            isPrimaryKey: row.pk > 0,
        }));
}

export async function getCloudflareD1SchemaGraph(config: BaseConfig, options: SchemaGraphOptions): Promise<SchemaGraphResult> {
    const database = normalizeDatabaseName(options.database);
    const tableRows = await getCloudflareD1Tables(config, database);
    const entries = await Promise.all(
        tableRows.map(async tableRow => {
            const [columnResult, foreignKeyResult] = await Promise.all([
                executeCloudflareD1Query<{
                    cid: number;
                    name: string;
                    type: string | null;
                    notnull: number;
                    pk: number;
                    hidden?: number;
                }>(config, buildPragma(database, 'table_xinfo', tableRow.name)),
                executeCloudflareD1Query<{
                    id: number;
                    seq: number;
                    table: string;
                    from: string;
                    to: string;
                    on_update?: string | null;
                    on_delete?: string | null;
                }>(config, buildPragma(database, 'foreign_key_list', tableRow.name)),
            ]);
            const foreignColumns = new Set(foreignKeyResult.rows.map(row => row.from));
            const table: SchemaGraphTableInput = {
                database,
                schema: null,
                name: tableRow.name,
                columns: columnResult.rows
                    .filter(row => !row.hidden)
                    .map(row => ({
                        name: row.name,
                        dataType: row.type,
                        ordinal: row.cid + 1,
                        nullable: row.pk > 0 ? false : row.notnull === 0,
                        isPrimaryKey: row.pk > 0,
                        isForeignKey: foreignColumns.has(row.name),
                    })),
            };
            const grouped = new Map<number, SchemaGraphRelationshipInput>();
            for (const row of foreignKeyResult.rows.sort((left, right) => left.id - right.id || left.seq - right.seq)) {
                const relationship = grouped.get(row.id) ?? {
                    constraintName: `fk_${tableRow.name}_${row.id}`,
                    sourceSchema: null,
                    sourceTable: tableRow.name,
                    sourceColumns: [],
                    targetSchema: null,
                    targetTable: row.table,
                    targetColumns: [],
                    sourceUnique: null,
                    sourceOptional: false,
                    onUpdate: row.on_update ?? null,
                    onDelete: row.on_delete ?? null,
                };
                relationship.sourceColumns.push(row.from);
                relationship.targetColumns.push(row.to);
                const sourceColumn = columnResult.rows.find(column => column.name === row.from);
                relationship.sourceOptional = Boolean(relationship.sourceOptional) || (sourceColumn?.pk === 0 && sourceColumn.notnull === 0);
                grouped.set(row.id, relationship);
            }
            return { table, relationships: Array.from(grouped.values()) };
        }),
    );

    return buildSchemaGraphResult(
        options,
        entries.map(entry => entry.table),
        entries.flatMap(entry => entry.relationships),
        {
            relationships: true,
            compositeForeignKeys: true,
            cardinality: false,
            referentialActions: true,
            constraintsEnforced: true,
        },
    );
}

export async function getCloudflareD1TableDdl(config: BaseConfig, database: string, table: string): Promise<string | null> {
    const result = await executeCloudflareD1Query<{ sql?: string | null }>(
        config,
        `SELECT sql
         FROM sqlite_master
         WHERE type IN ('table', 'view') AND name = ?`,
        [table],
    );
    const ddl = result.rows[0]?.sql?.trim();
    if (ddl) {
        return ddl;
    }

    const schemaResult = await executeCloudflareD1Query<{ sql?: string | null }>(
        config,
        `SELECT sql
         FROM ${quoteIdentifier(normalizeDatabaseName(database))}.sqlite_schema
         WHERE type IN ('table', 'view') AND name = ?`,
        [table],
    );
    const schemaDdl = schemaResult.rows[0]?.sql?.trim();
    if (schemaDdl) {
        return schemaDdl;
    }

    return synthesizeCloudflareD1TableDdl(config, database, table);
}

export async function previewCloudflareD1Table(
    config: BaseConfig,
    database: string,
    table: string,
    limit?: number,
    offset: number = 0,
    options?: TablePreviewOptions,
): Promise<QueryResult<Record<string, unknown>>> {
    const preview = buildTablePreviewClauses({
        ...options,
        dialect: 'sqlite',
        quoteIdentifier,
    });
    const normalizedLimit = normalizeTablePreviewLimit(limit);
    const normalizedOffset = normalizeTablePreviewOffset(offset);
    const qualifiedName = buildQualifiedName(database, table);
    const shouldCount = options?.countMode !== 'none';
    const countResult = shouldCount
        ? await executeCloudflareD1Query<CountRow>(config, `SELECT COUNT(*) AS totalRows FROM ${qualifiedName}${preview.whereSql}`, preview.params)
        : null;
    const unfilteredCountResult =
        shouldCount && preview.whereSql.length > 0 ? await executeCloudflareD1Query<CountRow>(config, `SELECT COUNT(*) AS totalRows FROM ${qualifiedName}`) : countResult;
    const sql = `SELECT * FROM ${qualifiedName}${preview.whereSql}${preview.orderBySql} LIMIT ? OFFSET ?`;
    const result = await executeCloudflareD1Query<Record<string, unknown>>(config, sql, [...(preview.params as unknown[]), normalizedLimit, normalizedOffset]);

    return {
        ...result,
        totalRows: countResult ? Number(countResult.rows[0]?.totalRows ?? 0) : null,
        unfilteredTotalRows: unfilteredCountResult ? Number(unfilteredCountResult.rows[0]?.totalRows ?? 0) : null,
        limited: true,
        limit: normalizedLimit,
    };
}

export async function renameCloudflareD1Table(config: BaseConfig, database: string, table: string, nextName: string): Promise<void> {
    const normalizedNextName = nextName.trim();
    if (!normalizedNextName || normalizedNextName.includes('.')) {
        throw new Error('New table name must be an unqualified table name.');
    }

    await executeCloudflareD1Query(config, `ALTER TABLE ${buildQualifiedName(database, table)} RENAME TO ${quoteIdentifier(normalizedNextName)}`);
}

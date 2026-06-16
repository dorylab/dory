import type { ConnectionType } from '@dory/shared/types/connections';

const DEFAULT_QUERY_TABLE_LIMIT = 200;

function splitQualifiedTableName(tableName: string) {
    const parts = tableName
        .split('.')
        .map(part => part.trim())
        .filter(Boolean);

    if (parts.length >= 2) {
        return {
            schema: parts.slice(0, -1).join('.'),
            table: parts[parts.length - 1],
        };
    }

    return {
        schema: null,
        table: tableName.trim(),
    };
}

function quoteDouble(value: string) {
    return `"${value.replaceAll('"', '""')}"`;
}

function quoteBacktick(value: string) {
    return `\`${value.replaceAll('`', '``')}\``;
}

function quoteSqlServer(value: string) {
    return `[${value.replaceAll(']', ']]')}]`;
}

function limitSql(sql: string, connectionType: ConnectionType | undefined, limit = DEFAULT_QUERY_TABLE_LIMIT) {
    if (connectionType === 'sqlserver') {
        return sql.replace(/^SELECT \*/i, `SELECT TOP (${limit}) *`);
    }
    if (connectionType === 'oracle') {
        return `${sql}\nFETCH FIRST ${limit} ROWS ONLY`;
    }
    return `${sql}\nLIMIT ${limit}`;
}

function formatQualifiedName(parts: string[], quoteIdentifier: (value: string) => string) {
    return parts.filter(Boolean).map(quoteIdentifier).join('.');
}

export function buildQueryTableSql({
    connectionType,
    database,
    schema,
    tableName,
}: {
    connectionType?: ConnectionType;
    database?: string | null;
    schema?: string | null;
    tableName: string;
}) {
    const parsed = splitQualifiedTableName(tableName);
    const schemaName = parsed.schema ?? schema?.trim() ?? null;
    const table = parsed.table;

    const from =
        connectionType === 'mysql' || connectionType === 'mariadb'
            ? formatQualifiedName([database ?? '', table], quoteBacktick)
            : connectionType === 'sqlserver'
              ? formatQualifiedName([schemaName ?? 'dbo', table], quoteSqlServer)
              : connectionType === 'clickhouse'
                ? formatQualifiedName([database ?? '', table], quoteBacktick)
                : connectionType === 'sqlite' || connectionType === 'cloudflare-d1'
                  ? formatQualifiedName([database ?? 'main', table], quoteDouble)
                  : connectionType === 'duckdb'
                    ? formatQualifiedName([database ?? '', schemaName ?? 'main', table], quoteDouble)
                    : formatQualifiedName([schemaName ?? '', table], quoteDouble);

    return `${limitSql(`SELECT *\nFROM ${from}`, connectionType)};`;
}

export function applyRenamedTableName(tableName: string, nextName: string) {
    const parsed = splitQualifiedTableName(tableName);
    return parsed.schema ? `${parsed.schema}.${nextName}` : nextName;
}

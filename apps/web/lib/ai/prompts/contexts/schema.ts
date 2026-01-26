import { BaseConnection } from '@/lib/connection/base/base-connection';
import { ensureConnectionPoolForUser } from '@/app/api/connection/utils';

type ColumnInfo = {
    columnName?: string;
    columnType?: string;
    defaultExpression?: string | null;
    defaultKind?: string | null;
    isPrimaryKey?: boolean | number | string | null;
    comment?: string | null;
};

type SchemaContextOptions = {
    userId: string;
    teamId: string;
    datasourceId: string;
    database?: string | null;
    table?: string | null;
    tableSampleLimit?: number;
    columnSampleLimit?: number;
};

export const SCHEMA_PROMPT = `
--- Database Context ---
{schema}
-----------------------
`;

const DEFAULT_TABLE_SAMPLE_LIMIT = parsePositiveIntFromEnv(process.env.CHATBOT_TABLE_SAMPLE_LIMIT, 50);
const DEFAULT_COLUMN_SAMPLE_LIMIT = parsePositiveIntFromEnv(process.env.CHATBOT_COLUMN_SAMPLE_LIMIT, 50);

export function getDefaultSchemaSampleLimits() {
    return {
        table: DEFAULT_TABLE_SAMPLE_LIMIT,
        column: DEFAULT_COLUMN_SAMPLE_LIMIT,
    };
}

/**
 * Constructs the schema text context used by LLM.
 * - If table is specified: focus on the table and list some fields.
 * - Otherwise: List some representative tables, each table lists some fields.
 */
export async function buildSchemaContext(options: SchemaContextOptions): Promise<string | null> {
    const { userId, teamId, datasourceId, database, table, tableSampleLimit = DEFAULT_TABLE_SAMPLE_LIMIT, columnSampleLimit = DEFAULT_COLUMN_SAMPLE_LIMIT } = options;

    try {
        const { entry, config } = await ensureConnectionPoolForUser(userId, teamId, datasourceId, null);
        const instance = entry.instance;
        const resolvedDatabase = await resolveDatabaseName(instance, config.database, database, table);

        if (!resolvedDatabase) {
            return null;
        }

        const effectiveTableLimit = sanitizeLimit(tableSampleLimit, DEFAULT_TABLE_SAMPLE_LIMIT);
        const effectiveColumnLimit = sanitizeLimit(columnSampleLimit, DEFAULT_COLUMN_SAMPLE_LIMIT);

        const lines: string[] = [];

        lines.push(`Current database: ${resolvedDatabase}`);
        lines.push('Below are representative tables and columns for context; this is not a complete list.');
        lines.push('');

        if (table) {
            //Focus on single table mode: only display column information of the specified table
            const columns = await fetchColumns(instance, resolvedDatabase, table, effectiveColumnLimit);
            lines.push(`Table: ${table}`);
            if (columns.length > 0) {
                lines.push(`Column examples (up to ${Math.min(effectiveColumnLimit, columns.length)}):`);
                for (const column of columns) {
                    lines.push(`- ${formatColumnLine(column)}`);
                }
            } else {
                lines.push('- <no column info found>');
            }
        } else {
            //Multi-table mode: List some representative tables, each table displays several fields
            const tables = await instance.getTables(resolvedDatabase);
            if (!tables || tables.length === 0) {
                lines.push('No tables found.');
            } else {
                const limitedTables = tables.slice(0, effectiveTableLimit);
                lines.push(`Sample tables (up to ${Math.min(effectiveTableLimit, tables.length)}):`);

                //Concurrently pull column information from each table to avoid serial performance issues
                const tableTasks = limitedTables.map(async (tableMeta: any) => {
                    const tableName = tableMeta.value || tableMeta.label;
                    if (!tableName) return null;

                    const targetDatabase = tableMeta.database || resolvedDatabase;
                    const columns = await fetchColumns(instance, targetDatabase, tableName, effectiveColumnLimit);

                    const block: string[] = [];
                    block.push(`- Table: ${tableName}`);
                    if (columns.length > 0) {
                        for (const column of columns) {
                            block.push(`    • ${formatColumnLine(column)}`);
                        }
                    } else {
                        block.push('    • <no column info found>');
                    }
                    return block.join('\n');
                });

                const tableBlocks = await Promise.all(tableTasks);
                for (const block of tableBlocks) {
                    if (block) {
                        lines.push(block);
                    }
                }
            }
        }

        lines.push('');
        lines.push('Please write SQL and answer based on the real schema above.');
        lines.push('If the schema is insufficient to support a field or table, say you are not sure rather than guessing.');

        return lines.join('\n');
    } catch (error) {
        console.error('[chat] failed to build schema context', error);
        return null;
    }
}

/* =======================
 * Utility function
 * ======================= */

function parsePositiveIntFromEnv(rawValue: string | undefined, fallback: number): number {
    const parsed = Number(rawValue);
    if (Number.isFinite(parsed) && parsed > 0) {
        return Math.floor(parsed);
    }
    return fallback;
}

function sanitizeLimit(value: number | undefined | null, fallback: number) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return Math.floor(value);
    }
    return fallback;
}

async function resolveDatabaseName(instance: BaseConnection, configuredDatabase?: string, providedDatabase?: string | null, table?: string | null): Promise<string | undefined> {
    const trimmedProvided = providedDatabase?.trim();
    if (trimmedProvided) {
        return trimmedProvided;
    }

    if (table) {
        //Try to check the database to which the table belongs in the result of getTables
        const tables = await instance.getTables();
        const matched = tables.find(meta => meta.value === table || meta.label === table);
        if (matched?.database?.trim()) {
            return matched.database.trim();
        }
    }

    if (configuredDatabase?.trim()) {
        return configuredDatabase.trim();
    }

    const databases = await instance.getDatabases();
    return databases[0]?.value;
}

async function fetchColumns(instance: BaseConnection, database: string, table: string, limit: number): Promise<ColumnInfo[]> {
    if (!database || !table) {
        return [];
    }

    const columnLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : undefined;

    //It is assumed here that it is ClickHouse, directly check system.columns
    const query = `
        SELECT
            name AS columnName,
            type AS columnType,
            default_expression AS defaultExpression,
            default_kind AS defaultKind,
            is_in_primary_key AS isPrimaryKey,
            comment
        FROM system.columns
        WHERE database = {db:String}
          AND table = {tbl:String}
        ORDER BY position
        ${columnLimit ? 'LIMIT {limit:UInt32}' : ''}
    `;

    const params: Record<string, unknown> = { db: database, tbl: table };
    if (columnLimit) {
        params.limit = columnLimit;
    }

    try {
        const result = await instance.query<ColumnInfo>(query, params);
        return Array.isArray(result.rows) ? result.rows : [];
    } catch (error) {
        console.error('[chat] failed to fetch columns', { database, table, error });
        return [];
    }
}

function formatColumnLine(column: ColumnInfo) {
    const name = column.columnName || '<unknown>';
    const type = column.columnType || 'unknown';
    const primaryKey = column.isPrimaryKey ? ' (primary key)' : '';
    const comment = column.comment?.trim() ? `, comment: ${column.comment.trim()}` : '';
    return `${name} ${type}${primaryKey}${comment}`;
}

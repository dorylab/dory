import { BaseConnection } from '@/lib/connection/base/base-connection';
import { ensureConnectionPoolForUser } from '@/app/api/connection/utils';

type ColumnInfo = {
    columnName?: string;
    columnType?: string | null;
    defaultExpression?: string | null;
    defaultKind?: string | null;
    isPrimaryKey?: boolean | number | string | null;
    comment?: string | null;
};

type SchemaContextOptions = {
    userId: string;
    organizationId: string;
    datasourceId: string;
    database?: string | null;
    table?: string | null;
    tableSampleLimit?: number;
    columnSampleLimit?: number;
};

type SchemaTableRef = {
    database?: string | null;
    schema?: string | null;
    name: string;
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
    const { userId, organizationId, datasourceId, database, table, tableSampleLimit = DEFAULT_TABLE_SAMPLE_LIMIT, columnSampleLimit = DEFAULT_COLUMN_SAMPLE_LIMIT } = options;

    try {
        const { entry, config } = await ensureConnectionPoolForUser(userId, organizationId, datasourceId, null);
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
            const metadata = instance.capabilities.metadata;
            if (!metadata) {
                return null;
            }
            const tables = await metadata.getTables(resolvedDatabase);
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

export async function buildSchemaContextForTables(options: {
    userId: string;
    organizationId: string;
    datasourceId: string;
    database?: string | null;
    schema?: string | null;
    tables: SchemaTableRef[];
    columnSampleLimit?: number;
}): Promise<string | null> {
    const { userId, organizationId, datasourceId, database, schema, tables, columnSampleLimit = DEFAULT_COLUMN_SAMPLE_LIMIT } = options;

    if (!tables.length) {
        return null;
    }

    try {
        const { entry, config } = await ensureConnectionPoolForUser(userId, organizationId, datasourceId, null);
        const instance = entry.instance;
        const effectiveColumnLimit = sanitizeLimit(columnSampleLimit, DEFAULT_COLUMN_SAMPLE_LIMIT);

        const dedupedTables = dedupeSchemaTables(tables);
        const lines: string[] = [];

        lines.push('Below are the real columns for the tables referenced by the current SQL.');
        lines.push('Use only these columns unless the schema is clearly incomplete.');
        lines.push('');

        for (const table of dedupedTables) {
            const resolvedDatabase =
                table.database?.trim() ||
                (await resolveDatabaseName(instance, config.database, database, qualifyTableName(table)));

            const resolvedTable = qualifyTableRef({
                ...table,
                schema: table.schema?.trim() || schema?.trim() || null,
            });

            lines.push(
                `Table: ${resolvedDatabase ? `${resolvedDatabase}.` : ''}${resolvedTable}`,
            );

            if (!resolvedDatabase) {
                lines.push('- <database could not be resolved>');
                lines.push('');
                continue;
            }

            const columns = await fetchColumns(instance, resolvedDatabase, resolvedTable, effectiveColumnLimit);
            if (columns.length > 0) {
                lines.push(`Column examples (up to ${Math.min(effectiveColumnLimit, columns.length)}):`);
                for (const column of columns) {
                    lines.push(`- ${formatColumnLine(column)}`);
                }
            } else {
                lines.push('- <no column info found>');
            }

            lines.push('');
        }

        lines.push('If a referenced field is not listed here, do not invent it.');

        return lines.join('\n');
    } catch (error) {
        console.error('[copilot-action] failed to build schema context for tables', error);
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

function dedupeSchemaTables(tables: SchemaTableRef[]): SchemaTableRef[] {
    const seen = new Set<string>();
    const deduped: SchemaTableRef[] = [];

    for (const table of tables) {
        const name = table.name?.trim();
        if (!name) continue;

        const database = table.database?.trim() || null;
        const schema = table.schema?.trim() || null;
        const key = `${database ?? ''}:${schema ?? ''}:${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push({ database, schema, name });
    }

    return deduped;
}

function qualifyTableRef(table: SchemaTableRef): string {
    const schema = table.schema?.trim();
    const name = table.name.trim();

    if (!schema || schema === 'public') {
        return name;
    }

    return `${schema}.${name}`;
}

function qualifyTableName(table: SchemaTableRef): string {
    return qualifyTableRef(table);
}

async function resolveDatabaseName(instance: BaseConnection, configuredDatabase?: string, providedDatabase?: string | null, table?: string | null): Promise<string | undefined> {
    const trimmedProvided = providedDatabase?.trim();
    if (trimmedProvided) {
        return trimmedProvided;
    }

    if (table) {
        //Try to check the database to which the table belongs in the result of getTables
        const metadata = instance.capabilities.metadata;
        if (!metadata) {
            return configuredDatabase?.trim() || undefined;
        }
        const tables = await metadata.getTables();
        const matched = tables.find(meta => meta.value === table || meta.label === table);
        if (matched?.database?.trim()) {
            return matched.database.trim();
        }
    }

    if (configuredDatabase?.trim()) {
        return configuredDatabase.trim();
    }

    const metadata = instance.capabilities.metadata;
    if (!metadata) {
        return undefined;
    }
    const databases = await metadata.getDatabases();
    return databases[0]?.value;
}

async function fetchColumns(instance: BaseConnection, database: string, table: string, limit: number): Promise<ColumnInfo[]> {
    if (!database || !table) {
        return [];
    }

    const metadata = instance.capabilities.metadata;
    if (!metadata?.getTableColumns) {
        return [];
    }

    try {
        const columns = await metadata.getTableColumns(database, table);
        const effectiveLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : columns.length;
        return columns.slice(0, effectiveLimit);
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

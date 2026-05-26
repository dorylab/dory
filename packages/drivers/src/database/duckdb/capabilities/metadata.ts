import type { ConnectionMetadataAPI, DatabaseObjectRow, TableColumnInfo } from '@dory/drivers/types';

import type { DuckDbDatasource } from '../datasource';
import { getDuckDbDatabases, getDuckDbTableColumns, getDuckDbTables } from '../runtime';

export type DuckDbMetadataAPI = Required<Pick<ConnectionMetadataAPI, 'getDatabases' | 'getTableColumns' | 'getTables' | 'getTablesOnly' | 'getViews'>>;

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
    };
}

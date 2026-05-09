import type { ConnectionMetadataAPI, DatabaseObjectRow, TableColumnInfo } from '@/lib/connection/base/types';

import type { DuckDbDatasource } from '../DuckDbDatasource';
import { getDuckDbDatabases, getDuckDbTableColumns, getDuckDbTables } from '../duckdb-driver';

export type DuckDbMetadataAPI = Required<Pick<ConnectionMetadataAPI, 'getDatabases' | 'getTableColumns' | 'getTables' | 'getTablesOnly' | 'getViews'>>;

export function createDuckDbMetadataCapability(datasource: DuckDbDatasource): DuckDbMetadataAPI {
    return {
        async getDatabases() {
            return getDuckDbDatabases(datasource.getHandle());
        },
        async getTableColumns(database, table): Promise<TableColumnInfo[]> {
            return getDuckDbTableColumns(datasource.getHandle(), database, table);
        },
        async getTables(database) {
            const tables = await getDuckDbTables(datasource.getHandle(), database);
            return tables.map(table => ({
                label: table.database && !database ? `${table.database}.${table.name}` : table.name,
                value: table.name,
                database: table.database,
                schema: table.schema,
            }));
        },
        async getTablesOnly(database): Promise<DatabaseObjectRow[]> {
            const tables = await getDuckDbTables(datasource.getHandle(), database, 'BASE TABLE');
            return tables.map(table => ({
                name: table.name,
                engine: 'duckdb',
                comment: table.comment,
            }));
        },
        async getViews(database): Promise<DatabaseObjectRow[]> {
            const views = await getDuckDbTables(datasource.getHandle(), database, 'VIEW');
            return views.map(view => ({
                name: view.name,
                engine: 'duckdb',
                comment: view.comment,
            }));
        },
    };
}

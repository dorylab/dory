import type { ConnectionMetadataAPI } from '@dory/drivers/types';
import { getSqliteDatabases, getSqliteSchemaGraph, getSqliteTableColumns, getSqliteTables, getSqliteViews } from '../runtime';
import type { SqliteDatasource } from '../datasource';
import { getSqliteFamilySchemaSnapshot } from './schema-snapshot';

export type SqliteMetadataAPI = Required<
    Pick<ConnectionMetadataAPI, 'getDatabases' | 'getSchemaGraph' | 'getSchemaSnapshot' | 'getTableColumns' | 'getTables' | 'getTablesOnly' | 'getViews'>
>;

export function createSqliteMetadataCapability(datasource: SqliteDatasource): SqliteMetadataAPI {
    return {
        async getDatabases() {
            return getSqliteDatabases();
        },
        async getTableColumns(database, table) {
            return getSqliteTableColumns(datasource.getDatabase(), database, table);
        },
        async getTables(database) {
            const tables = getSqliteTables(datasource.getDatabase(), database);
            return tables.map(table => ({
                label: table.name,
                value: table.name,
                database: database ?? 'main',
            }));
        },
        async getTablesOnly(database) {
            return getSqliteTables(datasource.getDatabase(), database);
        },
        async getViews(database) {
            return getSqliteViews(datasource.getDatabase(), database);
        },
        async getSchemaGraph(options) {
            return getSqliteSchemaGraph(datasource.getDatabase(), options);
        },
        async getSchemaSnapshot(input) {
            return getSqliteFamilySchemaSnapshot(datasource, datasource.config.type, input);
        },
    };
}

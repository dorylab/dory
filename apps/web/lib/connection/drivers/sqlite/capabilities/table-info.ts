import type { GetTableInfoAPI } from '@/lib/connection/base/types';
import { getSqliteTableDdl, getSqliteTableIndexes, getSqliteTableProperties, previewSqliteTable } from '../sqlite-driver';
import type { SqliteDatasource } from '../SqliteDatasource';

export function createSqliteTableInfoCapability(datasource: SqliteDatasource): GetTableInfoAPI {
    return {
        async properties(database, table) {
            return getSqliteTableProperties(datasource.getDatabase(), database, table);
        },
        async ddl(database, table) {
            return getSqliteTableDdl(datasource.getDatabase(), database, table);
        },
        async stats() {
            return null;
        },
        async preview(database, table, options) {
            return previewSqliteTable(datasource.getDatabase(), database, table, options?.limit ?? 100, options?.offset ?? 0);
        },
        async indexes(database, table) {
            return getSqliteTableIndexes(datasource.getDatabase(), database, table);
        },
    };
}

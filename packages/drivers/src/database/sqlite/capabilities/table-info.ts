import type { GetTableInfoAPI } from '@dory/drivers/types';
import { getSqliteTableDdl, getSqliteTableIndexes, getSqliteTableProperties, previewSqliteTable } from '../runtime';
import type { SqliteDatasource } from '../datasource';

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
            return previewSqliteTable(datasource.getDatabase(), database, table, options?.limit, options?.offset, options);
        },
        async indexes(database, table) {
            return getSqliteTableIndexes(datasource.getDatabase(), database, table);
        },
    };
}

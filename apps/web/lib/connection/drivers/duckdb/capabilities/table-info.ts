import type { GetTableInfoAPI } from '@/lib/connection/base/types';

import type { DuckDbDatasource } from '../DuckDbDatasource';
import { getDuckDbTableDdl, getDuckDbTableIndexes, getDuckDbTableProperties, previewDuckDbTable } from '../duckdb-driver';

export function createDuckDbTableInfoCapability(datasource: DuckDbDatasource): GetTableInfoAPI {
    return {
        async properties(database, table) {
            return getDuckDbTableProperties(datasource.getHandle(), database, table);
        },
        async ddl(database, table) {
            return getDuckDbTableDdl(datasource.getHandle(), database, table);
        },
        async stats() {
            return null;
        },
        async preview(database, table, options) {
            return previewDuckDbTable(datasource.getHandle(), database, table, options?.limit ?? 100, options?.offset ?? 0);
        },
        async indexes() {
            return getDuckDbTableIndexes();
        },
    };
}

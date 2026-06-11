import type { GetTableInfoAPI } from '@dory/drivers/types';

import type { DuckDbDatasource } from '../datasource';
import { getDuckDbTableDdl, getDuckDbTableIndexes, getDuckDbTableProperties, previewDuckDbTable } from '../runtime';

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
            return previewDuckDbTable(datasource.getHandle(), database, table, options?.limit ?? 100, options?.offset ?? 0, options);
        },
        async indexes() {
            return getDuckDbTableIndexes();
        },
    };
}

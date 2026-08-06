import type { GetTableInfoAPI } from '@dory/drivers/types';

import type { DuckDbDatasource } from '../datasource';
import { buildDuckDbTableReadQuery, getDuckDbTableDdl, getDuckDbTableIndexes, getDuckDbTableProperties, previewDuckDbTable, renameDuckDbTable } from '../runtime';

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
            return previewDuckDbTable(datasource.getHandle(), database, table, options?.limit, options?.offset, options);
        },
        async openRows(database, table, options) {
            const query = buildDuckDbTableReadQuery(database, table, options);
            return datasource.openRowCursorWithContext(query.sql, { database, params: query.params });
        },
        async indexes() {
            return getDuckDbTableIndexes();
        },
        async rename(database, table, nextName) {
            return renameDuckDbTable(datasource.getHandle(), database, table, nextName);
        },
    };
}

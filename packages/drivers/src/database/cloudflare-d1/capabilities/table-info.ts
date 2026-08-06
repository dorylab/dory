import type { GetTableInfoAPI } from '@dory/drivers/types';
import type { CloudflareD1Datasource } from '../datasource';
import { buildCloudflareD1TableReadQuery, getCloudflareD1TableDdl, previewCloudflareD1Table, renameCloudflareD1Table } from '../runtime';

export function createCloudflareD1TableInfoCapability(datasource: CloudflareD1Datasource): GetTableInfoAPI {
    return {
        async properties() {
            return null;
        },
        async ddl(database, table) {
            return getCloudflareD1TableDdl(datasource.config, database, table);
        },
        async stats() {
            return null;
        },
        async preview(database, table, options) {
            return previewCloudflareD1Table(datasource.config, database, table, options?.limit, options?.offset, options);
        },
        async openRows(database, table, options) {
            const query = buildCloudflareD1TableReadQuery(database, table, options);
            return datasource.openRowCursorWithContext(query.sql, { database, params: query.params });
        },
        async indexes() {
            return [];
        },
        async rename(database, table, nextName) {
            return renameCloudflareD1Table(datasource.config, database, table, nextName);
        },
    };
}

import type { ConnectionMetadataAPI } from '@dory/drivers/types';
import type { CloudflareD1Datasource } from '../datasource';
import { getCloudflareD1Databases, getCloudflareD1SchemaGraph, getCloudflareD1TableColumns, getCloudflareD1Tables, getCloudflareD1Views } from '../runtime';
import { getSqliteFamilySchemaSnapshot } from '../../sqlite/capabilities/schema-snapshot';

export type CloudflareD1MetadataAPI = Required<
    Pick<ConnectionMetadataAPI, 'getDatabases' | 'getSchemaGraph' | 'getSchemaSnapshot' | 'getTableColumns' | 'getTables' | 'getTablesOnly' | 'getViews'>
>;

export function createCloudflareD1MetadataCapability(datasource: CloudflareD1Datasource): CloudflareD1MetadataAPI {
    return {
        async getDatabases() {
            return getCloudflareD1Databases();
        },
        async getTableColumns(database, table) {
            return getCloudflareD1TableColumns(datasource.config, database, table);
        },
        async getTables(database) {
            const tables = await getCloudflareD1Tables(datasource.config, database);
            return tables.map(table => ({
                label: table.name,
                value: table.name,
                database: database ?? 'main',
            }));
        },
        async getTablesOnly(database) {
            return getCloudflareD1Tables(datasource.config, database);
        },
        async getViews(database) {
            return getCloudflareD1Views(datasource.config, database);
        },
        async getSchemaGraph(options) {
            return getCloudflareD1SchemaGraph(datasource.config, options);
        },
        async getSchemaSnapshot(input) {
            return getSqliteFamilySchemaSnapshot(datasource, datasource.config.type, input);
        },
    };
}

import type { ConnectionType } from '@dory/shared/types/connections';
import type { SidebarConfig } from './types';
import { isPostgresFamilyConnectionType } from '@dory/drivers/types';

const DEFAULT_CONFIG: SidebarConfig = {
    dialect: 'default',
    supportsSchemas: false,
    hiddenDatabases: ['system', 'information_schema'],
};

const SIDEBAR_CONFIG_BY_DIALECT: Record<ConnectionType, SidebarConfig> = {
    clickhouse: {
        dialect: 'clickhouse',
        supportsSchemas: false,
        hiddenDatabases: ['system', 'information_schema'],
    },
    'cloudflare-d1': {
        dialect: 'sqlite',
        supportsSchemas: false,
        hiddenDatabases: [],
    },
    doris: {
        dialect: 'doris',
        supportsSchemas: false,
        hiddenDatabases: ['information_schema'],
    },
    duckdb: {
        dialect: 'duckdb',
        supportsSchemas: false,
        hiddenDatabases: ['information_schema', 'system'],
    },
    mariadb: {
        dialect: 'mariadb',
        supportsSchemas: false,
        hiddenDatabases: ['information_schema', 'mysql', 'performance_schema', 'sys'],
    },
    mysql: {
        dialect: 'mysql',
        supportsSchemas: false,
        hiddenDatabases: ['information_schema', 'mysql', 'performance_schema', 'sys'],
    },
    oracle: {
        dialect: 'oracle',
        supportsSchemas: true,
        hiddenDatabases: ['SYS', 'SYSTEM', 'XDB', 'MDSYS', 'CTXSYS', 'ORDSYS'],
    },
    neon: {
        dialect: 'postgres',
        supportsSchemas: true,
        defaultSchemaName: 'public',
        hiddenDatabases: ['system', 'information_schema'],
    },
    postgres: {
        dialect: 'postgres',
        supportsSchemas: true,
        defaultSchemaName: 'public',
        hiddenDatabases: ['system', 'information_schema'],
    },
    sqlite: {
        dialect: 'sqlite',
        supportsSchemas: false,
        hiddenDatabases: [],
    },
    snowflake: {
        dialect: 'snowflake',
        supportsSchemas: true,
        defaultSchemaName: 'PUBLIC',
        hiddenDatabases: ['SNOWFLAKE', 'SNOWFLAKE_SAMPLE_DATA', 'INFORMATION_SCHEMA'],
    },
    sqlserver: {
        dialect: 'sqlserver',
        supportsSchemas: true,
        defaultSchemaName: 'dbo',
        hiddenDatabases: ['master', 'model', 'msdb', 'tempdb', 'system', 'information_schema'],
    },
};

export function getSidebarConfig(connectionType?: ConnectionType | null): SidebarConfig {
    if (!connectionType) {
        return DEFAULT_CONFIG;
    }

    if (isPostgresFamilyConnectionType(connectionType)) {
        return SIDEBAR_CONFIG_BY_DIALECT.postgres;
    }

    return SIDEBAR_CONFIG_BY_DIALECT[connectionType] ?? DEFAULT_CONFIG;
}

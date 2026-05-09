import type { ConnectionType } from '@/types/connections';
import type { SidebarConfig } from './types';
import { isPostgresFamilyConnectionType } from '@/lib/connection/postgres-family';

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

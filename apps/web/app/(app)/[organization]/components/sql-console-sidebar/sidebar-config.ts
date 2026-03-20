import type { ConnectionType } from '@/types/connections';
import type { SidebarConfig } from './types';

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
    mysql: {
        dialect: 'mysql',
        supportsSchemas: false,
        hiddenDatabases: ['information_schema', 'mysql', 'performance_schema', 'sys'],
    },
    postgres: {
        dialect: 'postgres',
        supportsSchemas: true,
        defaultSchemaName: 'public',
        hiddenDatabases: ['system', 'information_schema'],
    },
};

export function getSidebarConfig(connectionType?: ConnectionType | null): SidebarConfig {
    if (!connectionType) {
        return DEFAULT_CONFIG;
    }

    return SIDEBAR_CONFIG_BY_DIALECT[connectionType] ?? DEFAULT_CONFIG;
}

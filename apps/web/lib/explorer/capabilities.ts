import type { ExplorerDriver, ExplorerListKind, ExplorerObjectKind } from './types';
import { isPostgresFamilyConnectionType } from '@dory/drivers/types';

export type DriverCapabilities = {
    driver: ExplorerDriver;
    supportsSchema: boolean;
    supportsDatabase: boolean;
    supportsCatalog: boolean;
    listKinds: ExplorerListKind[];
    objectKinds: ExplorerObjectKind[];
};

export const EXPLORER_CAPABILITIES: Record<ExplorerDriver, DriverCapabilities> = {
    postgres: {
        driver: 'postgres',
        supportsSchema: true,
        supportsDatabase: true,
        supportsCatalog: false,
        listKinds: ['schemas', 'tables', 'views', 'materializedViews', 'functions', 'sequences'],
        objectKinds: ['database', 'schema', 'table', 'view', 'materializedView', 'function', 'sequence'],
    },
    clickhouse: {
        driver: 'clickhouse',
        supportsSchema: false,
        supportsDatabase: true,
        supportsCatalog: false,
        listKinds: ['tables', 'views', 'materializedViews', 'dictionaries'],
        objectKinds: ['database', 'table', 'view', 'materializedView', 'dictionary'],
    },
    'cloudflare-d1': {
        driver: 'cloudflare-d1',
        supportsSchema: false,
        supportsDatabase: true,
        supportsCatalog: false,
        listKinds: ['tables', 'views'],
        objectKinds: ['database', 'table', 'view'],
    },
    mysql: {
        driver: 'mysql',
        supportsSchema: false,
        supportsDatabase: true,
        supportsCatalog: false,
        listKinds: ['tables', 'views'],
        objectKinds: ['database', 'table', 'view'],
    },
    mariadb: {
        driver: 'mariadb',
        supportsSchema: false,
        supportsDatabase: true,
        supportsCatalog: false,
        listKinds: ['tables', 'views'],
        objectKinds: ['database', 'table', 'view'],
    },
    doris: {
        driver: 'doris',
        supportsSchema: false,
        supportsDatabase: true,
        supportsCatalog: false,
        listKinds: ['tables', 'views', 'materializedViews'],
        objectKinds: ['database', 'table', 'view', 'materializedView'],
    },
    duckdb: {
        driver: 'duckdb',
        supportsSchema: false,
        supportsDatabase: true,
        supportsCatalog: false,
        listKinds: ['tables', 'views'],
        objectKinds: ['database', 'table', 'view'],
    },
    sqlite: {
        driver: 'sqlite',
        supportsSchema: false,
        supportsDatabase: true,
        supportsCatalog: false,
        listKinds: ['tables', 'views'],
        objectKinds: ['database', 'table', 'view'],
    },
    snowflake: {
        driver: 'snowflake',
        supportsSchema: true,
        supportsDatabase: true,
        supportsCatalog: false,
        listKinds: ['schemas', 'tables', 'views'],
        objectKinds: ['database', 'schema', 'table', 'view'],
    },
    sqlserver: {
        driver: 'sqlserver',
        supportsSchema: true,
        supportsDatabase: true,
        supportsCatalog: false,
        listKinds: ['schemas', 'tables', 'views', 'functions', 'sequences'],
        objectKinds: ['database', 'schema', 'table', 'view', 'function', 'sequence'],
    },
    oracle: {
        driver: 'oracle',
        supportsSchema: true,
        supportsDatabase: true,
        supportsCatalog: false,
        listKinds: ['schemas', 'tables', 'views', 'functions', 'sequences'],
        objectKinds: ['database', 'schema', 'table', 'view', 'function', 'sequence'],
    },
    trino: {
        driver: 'trino',
        supportsSchema: true,
        supportsDatabase: true,
        supportsCatalog: true,
        listKinds: ['schemas', 'tables', 'views', 'functions'],
        objectKinds: ['database', 'schema', 'table', 'view', 'function'],
    },
    unknown: {
        driver: 'unknown',
        supportsSchema: false,
        supportsDatabase: true,
        supportsCatalog: false,
        listKinds: ['tables', 'views'],
        objectKinds: ['database', 'table', 'view'],
    },
};

export function resolveExplorerDriver(driver?: string | null): ExplorerDriver {
    if (!driver) {
        return 'unknown';
    }

    if (isPostgresFamilyConnectionType(driver)) {
        return 'postgres';
    }

    const normalized = driver.toLowerCase() as ExplorerDriver;
    return EXPLORER_CAPABILITIES[normalized] ? normalized : 'unknown';
}

export function getDriverCapabilities(driver?: string | null): DriverCapabilities {
    return EXPLORER_CAPABILITIES[resolveExplorerDriver(driver)];
}

export function supportsDatabaseSummary(driver?: string | null): boolean {
    const resolvedDriver = resolveExplorerDriver(driver);

    return (
        resolvedDriver === 'postgres' ||
        resolvedDriver === 'mysql' ||
        resolvedDriver === 'mariadb' ||
        resolvedDriver === 'clickhouse' ||
        resolvedDriver === 'oracle' ||
        resolvedDriver === 'snowflake' ||
        resolvedDriver === 'sqlserver'
    );
}

export function driverSupportsSchema(driver?: string | null): boolean {
    return getDriverCapabilities(driver).supportsSchema;
}

export function isSupportedListKind(driver: string | undefined | null, listKind: string | undefined | null): listKind is ExplorerListKind {
    if (!listKind) return false;
    return getDriverCapabilities(driver).listKinds.includes(listKind as ExplorerListKind);
}

export function isSupportedObjectKind(driver: string | undefined | null, objectKind: string | undefined | null): objectKind is ExplorerObjectKind {
    if (!objectKind) return false;
    return getDriverCapabilities(driver).objectKinds.includes(objectKind as ExplorerObjectKind);
}

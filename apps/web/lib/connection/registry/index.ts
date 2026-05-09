import type { ConnectionType } from '../base/types';
import type { ConnectionDriverCtor } from './types';
import { ClickhouseDatasource } from '../drivers/clickhouse/ClickhouseDatasource';
import { MariaDbDatasource } from '../drivers/mariadb/MariaDbDatasource';
import { MySqlDatasource } from '../drivers/mysql/MySqlDatasource';
import { PostgresDatasource } from '../drivers/postgres/PostgresDatasource';
import { SqliteDatasource } from '../drivers/sqlite/SqliteDatasource';

const registry = new Map<ConnectionType, ConnectionDriverCtor>();
let duckDbDriverCtorPromise: Promise<ConnectionDriverCtor> | null = null;

registry.set('clickhouse', ClickhouseDatasource);
registry.set('mariadb', MariaDbDatasource);
registry.set('mysql', MySqlDatasource);
registry.set('neon', PostgresDatasource);
registry.set('postgres', PostgresDatasource);
registry.set('sqlite', SqliteDatasource);

export function registerDriver(type: ConnectionType, ctor: ConnectionDriverCtor) {
    registry.set(type, ctor);
}

async function loadDuckDbDriver(): Promise<ConnectionDriverCtor> {
    if (!duckDbDriverCtorPromise) {
        duckDbDriverCtorPromise = import('../drivers/duckdb/DuckDbDatasource').then(module => module.DuckDbDatasource);
    }

    return duckDbDriverCtorPromise;
}

export async function getDriver(type: ConnectionType): Promise<ConnectionDriverCtor | undefined> {
    if (type === 'duckdb') {
        return loadDuckDbDriver();
    }

    return registry.get(type);
}

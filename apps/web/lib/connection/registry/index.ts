import type { ConnectionType } from '../base/types';
import type { ConnectionDriverCtor } from './types';
import { ClickhouseDatasource } from '../drivers/clickhouse/ClickhouseDatasource';
import { DuckDbDatasource } from '../drivers/duckdb/DuckDbDatasource';
import { MariaDbDatasource } from '../drivers/mariadb/MariaDbDatasource';
import { MySqlDatasource } from '../drivers/mysql/MySqlDatasource';
import { PostgresDatasource } from '../drivers/postgres/PostgresDatasource';
import { SqliteDatasource } from '../drivers/sqlite/SqliteDatasource';

const registry = new Map<ConnectionType, ConnectionDriverCtor>();

registry.set('clickhouse', ClickhouseDatasource);
registry.set('duckdb', DuckDbDatasource);
registry.set('mariadb', MariaDbDatasource);
registry.set('mysql', MySqlDatasource);
registry.set('neon', PostgresDatasource);
registry.set('postgres', PostgresDatasource);
registry.set('sqlite', SqliteDatasource);

export function registerDriver(type: ConnectionType, ctor: ConnectionDriverCtor) {
    registry.set(type, ctor);
}

export function getDriver(type: ConnectionType): ConnectionDriverCtor | undefined {
    return registry.get(type);
}

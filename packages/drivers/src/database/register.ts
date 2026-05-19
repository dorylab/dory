import { registerDriver } from '../core/registry';
import type { DriverCtor } from '../core/registry/types';
import type { DriverType } from '../types';
import { ClickhouseDatasource } from './clickhouse/ClickhouseDatasource';
import { MariaDbDatasource } from './mariadb/MariaDbDatasource';
import { MySqlDatasource } from './mysql/MySqlDatasource';
import { OracleDatasource } from './oracle/OracleDatasource';
import { PostgresDatasource } from './postgres/PostgresDatasource';
import { SqliteDatasource } from './sqlite/SqliteDatasource';
import { SqlServerDatasource } from './sqlserver/SqlServerDatasource';

let duckDbDriverCtorPromise: Promise<DriverCtor> | null = null;
let registered = false;

async function loadDuckDbDriver(): Promise<DriverCtor> {
    if (!duckDbDriverCtorPromise) {
        duckDbDriverCtorPromise = import('./duckdb/DuckDbDatasource').then(module => module.DuckDbDatasource);
    }

    return duckDbDriverCtorPromise;
}

export function registerDatabaseDrivers() {
    if (registered) return;
    registered = true;

    registerDriver('clickhouse', ClickhouseDatasource);
    registerDriver('mariadb', MariaDbDatasource);
    registerDriver('mysql', MySqlDatasource);
    registerDriver('neon', PostgresDatasource);
    registerDriver('oracle', OracleDatasource);
    registerDriver('postgres', PostgresDatasource);
    registerDriver('sqlite', SqliteDatasource);
    registerDriver('sqlserver', SqlServerDatasource);
    registerDriver('duckdb', loadDuckDbDriver);
}

export function isDatabaseDriverType(value: unknown): value is DriverType {
    return (
        value === 'clickhouse' ||
        value === 'duckdb' ||
        value === 'mariadb' ||
        value === 'mysql' ||
        value === 'neon' ||
        value === 'oracle' ||
        value === 'postgres' ||
        value === 'sqlite' ||
        value === 'sqlserver'
    );
}

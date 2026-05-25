import { registerDriver } from '../core/registry';
import type { DriverCtor } from '../core/registry/types';
import type { DriverType } from '../types';
import { ClickhouseDatasource } from './clickhouse/datasource';
import { MariaDbDatasource } from './mariadb/datasource';
import { MySqlDatasource } from './mysql/datasource';
import { OracleDatasource } from './oracle/datasource';
import { PostgresDatasource } from './postgres/datasource';
import { SqliteDatasource } from './sqlite/datasource';
import { SqlServerDatasource } from './sqlserver/datasource';

let duckDbDriverCtorPromise: Promise<DriverCtor> | null = null;
let registered = false;

async function loadDuckDbDriver(): Promise<DriverCtor> {
    if (!duckDbDriverCtorPromise) {
        duckDbDriverCtorPromise = import('./duckdb/datasource').then(module => module.DuckDbDatasource);
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

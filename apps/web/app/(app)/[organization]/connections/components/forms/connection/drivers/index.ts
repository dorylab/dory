import type { ComponentType } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { RefinementCtx } from 'zod';
import {
    ClickhouseConnectionFields,
    createClickhouseConnectionDefaults,
    normalizeClickhouseConnectionForForm,
    normalizeClickhouseConnectionForSubmit,
    validateClickhouseConnection,
} from './clickhouse';
import { createDuckDbConnectionDefaults, DuckDbConnectionFields, normalizeDuckDbConnectionForForm, normalizeDuckDbConnectionForSubmit, validateDuckDbConnection } from './duckdb';
import {
    createMariaDbConnectionDefaults,
    MariaDbConnectionFields,
    normalizeMariaDbConnectionForForm,
    normalizeMariaDbConnectionForSubmit,
    validateMariaDbConnection,
} from './mariadb';
import { createNeonConnectionDefaults, NeonConnectionFields, normalizeNeonConnectionForForm, normalizeNeonConnectionForSubmit, validateNeonConnection } from './neon';
import { createOracleConnectionDefaults, normalizeOracleConnectionForForm, normalizeOracleConnectionForSubmit, OracleConnectionFields, validateOracleConnection } from './oracle';
import {
    PostgresConnectionFields,
    createPostgresConnectionDefaults,
    normalizePostgresConnectionForForm,
    normalizePostgresConnectionForSubmit,
    validatePostgresConnection,
} from './postgres';
import { createMysqlConnectionDefaults, MysqlConnectionFields, normalizeMysqlConnectionForForm, normalizeMysqlConnectionForSubmit, validateMysqlConnection } from './mysql';
import { createSqliteConnectionDefaults, normalizeSqliteConnectionForForm, normalizeSqliteConnectionForSubmit, SqliteConnectionFields, validateSqliteConnection } from './sqlite';
import {
    createSqlServerConnectionDefaults,
    normalizeSqlServerConnectionForForm,
    normalizeSqlServerConnectionForSubmit,
    SqlServerConnectionFields,
    validateSqlServerConnection,
} from './sqlserver';

export type SupportedConnectionDriver = 'clickhouse' | 'duckdb' | 'mariadb' | 'mysql' | 'neon' | 'oracle' | 'postgres' | 'sqlite' | 'sqlserver';

type DriverDefinition = {
    label: string;
    FormComponent: ComponentType<{ form: UseFormReturn<any> }>;
    createDefaults: () => any;
    normalizeForForm: (connection: any) => any;
    normalizeForSubmit: (connection: any) => any;
    validate: (connection: any, ctx: RefinementCtx) => void;
};

const DRIVERS: Record<SupportedConnectionDriver, DriverDefinition> = {
    clickhouse: {
        label: 'ClickHouse',
        FormComponent: ClickhouseConnectionFields,
        createDefaults: createClickhouseConnectionDefaults,
        normalizeForForm: normalizeClickhouseConnectionForForm,
        normalizeForSubmit: normalizeClickhouseConnectionForSubmit,
        validate: validateClickhouseConnection,
    },
    duckdb: {
        label: 'DuckDB',
        FormComponent: DuckDbConnectionFields,
        createDefaults: createDuckDbConnectionDefaults,
        normalizeForForm: normalizeDuckDbConnectionForForm,
        normalizeForSubmit: normalizeDuckDbConnectionForSubmit,
        validate: validateDuckDbConnection,
    },
    postgres: {
        label: 'PostgreSQL',
        FormComponent: PostgresConnectionFields,
        createDefaults: createPostgresConnectionDefaults,
        normalizeForForm: normalizePostgresConnectionForForm,
        normalizeForSubmit: normalizePostgresConnectionForSubmit,
        validate: validatePostgresConnection,
    },
    neon: {
        label: 'Neon',
        FormComponent: NeonConnectionFields,
        createDefaults: createNeonConnectionDefaults,
        normalizeForForm: normalizeNeonConnectionForForm,
        normalizeForSubmit: normalizeNeonConnectionForSubmit,
        validate: validateNeonConnection,
    },
    oracle: {
        label: 'Oracle',
        FormComponent: OracleConnectionFields,
        createDefaults: createOracleConnectionDefaults,
        normalizeForForm: normalizeOracleConnectionForForm,
        normalizeForSubmit: normalizeOracleConnectionForSubmit,
        validate: validateOracleConnection,
    },
    mariadb: {
        label: 'MariaDB',
        FormComponent: MariaDbConnectionFields,
        createDefaults: createMariaDbConnectionDefaults,
        normalizeForForm: normalizeMariaDbConnectionForForm,
        normalizeForSubmit: normalizeMariaDbConnectionForSubmit,
        validate: validateMariaDbConnection,
    },
    mysql: {
        label: 'MySQL',
        FormComponent: MysqlConnectionFields,
        createDefaults: createMysqlConnectionDefaults,
        normalizeForForm: normalizeMysqlConnectionForForm,
        normalizeForSubmit: normalizeMysqlConnectionForSubmit,
        validate: validateMysqlConnection,
    },
    sqlite: {
        label: 'SQLite',
        FormComponent: SqliteConnectionFields,
        createDefaults: createSqliteConnectionDefaults,
        normalizeForForm: normalizeSqliteConnectionForForm,
        normalizeForSubmit: normalizeSqliteConnectionForSubmit,
        validate: validateSqliteConnection,
    },
    sqlserver: {
        label: 'SQL Server',
        FormComponent: SqlServerConnectionFields,
        createDefaults: createSqlServerConnectionDefaults,
        normalizeForForm: normalizeSqlServerConnectionForForm,
        normalizeForSubmit: normalizeSqlServerConnectionForSubmit,
        validate: validateSqlServerConnection,
    },
};

export const CONNECTION_TYPE_OPTIONS = (Object.entries(DRIVERS) as Array<[SupportedConnectionDriver, DriverDefinition]>).map(([value, driver]) => ({
    value,
    label: driver.label,
}));

export function getConnectionDriver(type?: string): DriverDefinition {
    if (type === 'mariadb') {
        return DRIVERS.mariadb;
    }
    if (type === 'mysql') {
        return DRIVERS.mysql;
    }
    if (type === 'postgres') {
        return DRIVERS.postgres;
    }
    if (type === 'duckdb') {
        return DRIVERS.duckdb;
    }
    if (type === 'neon') {
        return DRIVERS.neon;
    }
    if (type === 'oracle') {
        return DRIVERS.oracle;
    }
    if (type === 'sqlite') {
        return DRIVERS.sqlite;
    }
    if (type === 'sqlserver') {
        return DRIVERS.sqlserver;
    }
    return DRIVERS.clickhouse;
}

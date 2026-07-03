import type { ComponentType } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import type { RefinementCtx } from 'zod';
import {
    ClickhouseConnectionFields,
    createClickhouseConnectionDefaults,
    normalizeClickhouseConnectionForForm,
    normalizeClickhouseConnectionForSubmit,
    validateClickhouseConnection,
} from './clickhouse';
import {
    CloudflareD1ConnectionFields,
    createCloudflareD1ConnectionDefaults,
    normalizeCloudflareD1ConnectionForForm,
    normalizeCloudflareD1ConnectionForSubmit,
    validateCloudflareD1Connection,
} from './cloudflare-d1';
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
import {
    createSnowflakeConnectionDefaults,
    normalizeSnowflakeConnectionForForm,
    normalizeSnowflakeConnectionForSubmit,
    SnowflakeConnectionFields,
    validateSnowflakeConnection,
} from './snowflake';
import {
    createSupabaseConnectionDefaults,
    normalizeSupabaseConnectionForForm,
    normalizeSupabaseConnectionForSubmit,
    SupabaseConnectionFields,
    validateSupabaseConnection,
} from './supabase';
import { createSqliteConnectionDefaults, normalizeSqliteConnectionForForm, normalizeSqliteConnectionForSubmit, SqliteConnectionFields, validateSqliteConnection } from './sqlite';
import {
    createSqlServerConnectionDefaults,
    normalizeSqlServerConnectionForForm,
    normalizeSqlServerConnectionForSubmit,
    SqlServerConnectionFields,
    validateSqlServerConnection,
} from './sqlserver';

export type SupportedConnectionDriver =
    | 'clickhouse'
    | 'cloudflare-d1'
    | 'duckdb'
    | 'mariadb'
    | 'mysql'
    | 'neon'
    | 'oracle'
    | 'postgres'
    | 'sqlite'
    | 'snowflake'
    | 'supabase'
    | 'sqlserver';

type DriverDefinition = {
    label: string;
    FormComponent: ComponentType<{ form: UseFormReturn<FieldValues> }>;
    createDefaults(): FieldValues;
    normalizeForForm(connection: FieldValues | null | undefined): FieldValues;
    normalizeForSubmit(connection: FieldValues | null | undefined): FieldValues;
    validate(connection: FieldValues | null | undefined, ctx: RefinementCtx): void;
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
    'cloudflare-d1': {
        label: 'Cloudflare D1',
        FormComponent: CloudflareD1ConnectionFields,
        createDefaults: createCloudflareD1ConnectionDefaults,
        normalizeForForm: normalizeCloudflareD1ConnectionForForm,
        normalizeForSubmit: normalizeCloudflareD1ConnectionForSubmit,
        validate: validateCloudflareD1Connection,
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
    snowflake: {
        label: 'Snowflake',
        FormComponent: SnowflakeConnectionFields,
        createDefaults: createSnowflakeConnectionDefaults,
        normalizeForForm: normalizeSnowflakeConnectionForForm,
        normalizeForSubmit: normalizeSnowflakeConnectionForSubmit,
        validate: validateSnowflakeConnection,
    },
    supabase: {
        label: 'Supabase',
        FormComponent: SupabaseConnectionFields,
        createDefaults: createSupabaseConnectionDefaults,
        normalizeForForm: normalizeSupabaseConnectionForForm,
        normalizeForSubmit: normalizeSupabaseConnectionForSubmit,
        validate: validateSupabaseConnection,
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
    if (type === 'cloudflare-d1') {
        return DRIVERS['cloudflare-d1'];
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
    if (type === 'snowflake') {
        return DRIVERS.snowflake;
    }
    if (type === 'supabase') {
        return DRIVERS.supabase;
    }
    if (type === 'sqlserver') {
        return DRIVERS.sqlserver;
    }
    return DRIVERS.clickhouse;
}

import type { BaseDriver } from '../base/base-driver';
import type { DriverConfig, DriverType } from '../../types';

export type ConnectionDriverType = DriverType;
export type DriverCtor = new (config: DriverConfig) => BaseDriver;
export type DriverCtorLoader = () => Promise<DriverCtor>;

export type ConnectionParameterDialect =
    | {
          id: DriverType;
          parameterStyle: 'named';
      }
    | {
          id: DriverType;
          parameterStyle: 'positional';
      };

export type ConnectionDriverCtor = DriverCtor;

export function isConnectionDriverType(value: unknown): value is ConnectionDriverType {
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

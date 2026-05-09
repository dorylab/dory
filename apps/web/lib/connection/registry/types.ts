import type { BaseConfig, ConnectionType } from '../base/types';
import type { BaseConnection } from '../base/base-connection';

export type ConnectionDriverType = ConnectionType;

export type ConnectionParameterDialect =
    | {
          id: ConnectionDriverType;
          parameterStyle: 'named';
      }
    | {
          id: ConnectionDriverType;
          parameterStyle: 'positional';
      };

export type ConnectionDriverCtor = new (config: BaseConfig) => BaseConnection;

export function isConnectionDriverType(value: unknown): value is ConnectionDriverType {
    return value === 'clickhouse' || value === 'duckdb' || value === 'mariadb' || value === 'mysql' || value === 'neon' || value === 'postgres' || value === 'sqlite';
}

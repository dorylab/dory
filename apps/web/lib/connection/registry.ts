import type { ConnectionType } from './base/types';
import type { BaseConnection } from './base/base-connection';
import { ClickhouseDatasource } from './drivers/clickhouse/ClickhouseDatasource';

type Ctor = new (...args: any[]) => BaseConnection;

const registry = new Map<ConnectionType, Ctor>();
registry.set('clickhouse', ClickhouseDatasource);

export function getDriver(type: ConnectionType): Ctor | undefined {
    return registry.get(type);
}

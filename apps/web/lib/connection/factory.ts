import { getDriver } from './registry';
import type { BaseConnection } from './base/base-connection';
import type { BaseConfig } from './base/types';
import { UnsupportedTypeError } from './base/errors';

export async function createProvider(config: BaseConfig): Promise<BaseConnection> {
    const Ctor = getDriver(config.type as any);
    if (!Ctor) throw new UnsupportedTypeError(String(config.type));
    const ds = new Ctor(config);
    await ds.init(); // Idempotent
    return ds;
}

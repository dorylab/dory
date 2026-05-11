import { getDriver } from './registry';
import type { BaseDriver } from './base/base-driver';
import type { DriverConfig } from '../types';
import { UnsupportedTypeError } from './base/errors';

export async function createDriver(config: DriverConfig): Promise<BaseDriver> {
    const Ctor = await getDriver(config.type as any);
    if (!Ctor) throw new UnsupportedTypeError(String(config.type));
    const ds = new Ctor(config);
    await ds.init(); // Idempotent
    return ds;
}

export { createDriver as createProvider };

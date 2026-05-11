import type { DriverType } from '../../types';
import type { DriverCtor, DriverCtorLoader } from './types';

const registry = new Map<DriverType, DriverCtor | DriverCtorLoader>();

export function registerDriver(type: DriverType, ctor: DriverCtor | DriverCtorLoader) {
    registry.set(type, ctor);
}

function isLoader(ctor: DriverCtor | DriverCtorLoader): ctor is DriverCtorLoader {
    return !('prototype' in ctor);
}

export async function getDriver(type: DriverType): Promise<DriverCtor | undefined> {
    const ctor = registry.get(type);
    if (!ctor) return undefined;
    return isLoader(ctor) ? ctor() : ctor;
}

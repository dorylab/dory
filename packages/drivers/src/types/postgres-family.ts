import type { DriverType } from './index';

export type PostgresFamilyConnectionType = 'postgres' | 'neon';

export function isPostgresFamilyConnectionType(value?: string | null): value is PostgresFamilyConnectionType {
    return value === 'postgres' || value === 'neon';
}

export function normalizePostgresFamilyConnectionType(value?: string | null): DriverType | 'unknown' {
    return isPostgresFamilyConnectionType(value) ? 'postgres' : ((value ?? 'unknown') as DriverType | 'unknown');
}

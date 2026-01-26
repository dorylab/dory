// src/datasource/utils.ts
export const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';
export function timeIt<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
    const t0 = (globalThis.performance ?? { now: () => Date.now() }).now();
    return fn().then(value => ({ value, ms: ((globalThis.performance ?? { now: () => Date.now() }).now() - t0) as number }));
}

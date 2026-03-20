import type { CacheEntry, HydrateSetters } from '../types';

export const RESULTS_CACHE = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 8;

export function makeCacheKey(tabId?: string | null, sessionId?: string | null | undefined, setIndex = 0) {
    return tabId && sessionId ? `${tabId}:${sessionId}#${setIndex}` : null;
}

export function evictLRU(max = MAX_CACHE_ENTRIES) {
    if (RESULTS_CACHE.size <= max) return;
    const arr = [...RESULTS_CACHE.entries()].sort((a, b) => a[1].lastUpdated - b[1].lastUpdated);
    const remove = RESULTS_CACHE.size - max;
    for (let i = 0; i < remove; i++) RESULTS_CACHE.delete(arr[i][0]);
}

export function touchCache(key: string, patch: Partial<CacheEntry>) {
    const prev = RESULTS_CACHE.get(key);
    const next: CacheEntry = {
        results: prev?.results ?? [],
        meta: { ...(prev?.meta ?? {}), ...(patch.meta ?? {}) },
        sessionStatus: patch.sessionStatus ?? prev?.sessionStatus ?? null,
        fullyLoaded: patch.fullyLoaded ?? prev?.fullyLoaded ?? false,
        dataVersion: patch.dataVersion ?? prev?.dataVersion,
        lastUpdated: Date.now(),
    };
    if (patch.results) next.results = patch.results;
    RESULTS_CACHE.set(key, next);
    evictLRU();
}

export function hydrateFromCache(key: string, setters: HydrateSetters): boolean {
    const hit = RESULTS_CACHE.get(key);
    if (!hit) return false;
    setters.resultsRef.current = hit.results;
    setters.setResults(hit.results.slice());
    setters.setMeta(prev => ({ ...prev, ...(hit.meta ?? {}) }));
    setters.setSessionStatus(hit.sessionStatus ?? null);
    setters.setLoading(false);
    return true;
}

import type { InsightRewriteRequest, InsightRewriteResponse } from './result-set-insights';
import { executeActionClient } from '@/lib/actions/client';

const insightRewriteCache = new Map<string, InsightRewriteResponse | null>();
const insightRewriteInflight = new Map<string, Promise<InsightRewriteResponse | null>>();

export function makeInsightRewriteCacheKey(request: InsightRewriteRequest | null | undefined) {
    return request ? JSON.stringify(request) : null;
}

export function getCachedInsightRewrite(cacheKey: string | null | undefined) {
    return cacheKey ? insightRewriteCache.get(cacheKey) : undefined;
}

export function invalidateCachedInsightRewrite(cacheKey: string | null | undefined) {
    if (!cacheKey) return;
    insightRewriteCache.delete(cacheKey);
    insightRewriteInflight.delete(cacheKey);
}

export async function fetchInsightRewrite(cacheKey: string) {
    if (insightRewriteCache.has(cacheKey)) {
        return insightRewriteCache.get(cacheKey) ?? null;
    }

    const inflight = insightRewriteInflight.get(cacheKey);
    if (inflight) return inflight;

    const request = executeActionClient<InsightRewriteResponse | null>('ai.resultInsights', JSON.parse(cacheKey))
        .then(payload => {
            insightRewriteCache.set(cacheKey, payload);
            return payload;
        })
        .catch(() => {
            insightRewriteCache.set(cacheKey, null);
            return null;
        })
        .finally(() => {
            insightRewriteInflight.delete(cacheKey);
        });

    insightRewriteInflight.set(cacheKey, request);
    return request;
}

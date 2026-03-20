import { QueryInsightsFilters } from '@/types/monitoring';


export function formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let v = bytes;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i++;
    }
    return `${v.toFixed(1)} ${units[i]}`;
}

export function formatNumber(n: number, locale: string = 'en-US'): string {
    return n.toLocaleString(locale);
}

export function getTimeRangeLabel(
    range: QueryInsightsFilters['timeRange'],
    labels: Partial<Record<QueryInsightsFilters['timeRange'], string>> = {},
): string {
    switch (range) {
        case '1h':
            return labels['1h'] ?? '1 hour';
        case '6h':
            return labels['6h'] ?? '6 hours';
        case '24h':
            return labels['24h'] ?? '24 hours';
        case '7d':
            return labels['7d'] ?? '7 days';
        default:
            return '';
    }
}

import type { QueryTimelinePoint, TimeRange } from '@/types/monitoring';
import { TIME_RANGE_BUCKET_MS } from './constants';

export function fillTimelineBuckets(points: QueryTimelinePoint[], timeRange: TimeRange): QueryTimelinePoint[] {
    if (!points.length) return [];

    const bucketMs = TIME_RANGE_BUCKET_MS[timeRange] ?? 60 * 1000;

    const sorted = [...points].sort((a, b) => a.ts - b.ts);

    const startTs = sorted[0]!.ts;
    const endTs = sorted[sorted.length - 1]!.ts;

    const byTs = new Map<number, QueryTimelinePoint>();
    for (const p of sorted) {
        byTs.set(p.ts, p);
    }

    const filled: QueryTimelinePoint[] = [];

    for (let ts = startTs; ts <= endTs; ts += bucketMs) {
        const found = byTs.get(ts);
        if (found) {
            filled.push(found);
        } else {
            
            
            
            filled.push({
                ts,
                p50Ms: null as unknown as number,
                p95Ms: null as unknown as number,
                qpm: 0,
                errorCount: 0,
                slowCount: 0,
            });
        }
    }

    return filled;
}

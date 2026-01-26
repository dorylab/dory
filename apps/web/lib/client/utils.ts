import { ENABLE_COMPRESSION } from '@/app/config/sql-console';
import { encodeRow } from '../utils/binary-codec';
import dayjs from 'dayjs';
// Estimate total bytes for a batch (used for adaptive chunk sizing)
export function estimateBytes(rows: Array<{ rowData: any }>, compress = ENABLE_COMPRESSION): number {
    let sum = 0;
    for (const r of rows) {
        const { data } = encodeRow(r.rowData, compress);
        sum += data.byteLength;
    }
    return sum;
}

export function sleep(ms: number) {
    return new Promise(res => setTimeout(res, ms));
}

export function idleYield(minTime = 4): Promise<void> {
    return new Promise(res => {
        // Modern browsers
        // @ts-ignore
        if (window.requestIdleCallback) {
            // @ts-ignore
            requestIdleCallback(() => res(), { timeout: minTime });
        } else {
            setTimeout(res, minTime);
        }
    });
}

// Roughly detect "quota/transaction too large" errors
export function isQuotaLikeError(err: unknown): boolean {
    const s = String((err as any)?.message ?? err ?? '').toLowerCase();
    return (
        s.includes('quota') ||
        s.includes('larger than') ||
        s.includes('too large') ||
        s.includes('maximum') ||
        (s.includes('max') && s.includes('size')) ||
        (s.includes('transaction') && s.includes('too') && s.includes('big')) ||
        s.includes('invalid array length') // Error signature seen in practice
    );
}

// Utility: normalize number(ms)/Date/null to Date|null (dayjs is more reliable)
export const toDate = (v: number | Date | null | undefined): Date | null => {
    if (v == null) return null;
    const d = dayjs(v);
    return d.isValid() ? d.toDate() : null;
};

export function toDate3(v: unknown): Date | null {
    if (v == null) return null;
    // number (epoch ms) or string (ISO/parseable)
    if (typeof v === 'number' || typeof v === 'string') {
        const d = dayjs(v);
        return d.isValid() ? d.toDate() : null;
    }
    // Already a Date
    if (v instanceof Date) return v;
    // Fallback parse
    const d = dayjs(v as any);
    return d.isValid() ? d.toDate() : null;
}

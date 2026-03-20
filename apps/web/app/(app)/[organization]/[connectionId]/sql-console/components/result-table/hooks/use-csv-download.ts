'use client';

import type { TabResult } from '@/lib/client/type';
import { useCallback } from 'react';

type Params = {
    results?: TabResult[]; 
    tabId?: string | null;
    queryId?: string | null;
    setIndex?: number; 
    delimiter?: string; 
    includeBOM?: boolean; 
};

function makeFileName(tabId?: string | null, queryId?: string | null, setIndex = 0) {
    const safe = (s?: string | null) => (s ?? 'tab').toString().replace(/[^\w.-]+/g, '_');
    return `result-${safe(tabId)}-${queryId ?? 'latest'}-set${setIndex + 1}.csv`;
}

export function useCsvDownload({ results, tabId, queryId, setIndex = 0, delimiter = ',', includeBOM = true }: Params) {
    return useCallback(() => {
        if (!results?.length) return;

        const rows = results.map(r => r.rowData);
        const fileName = makeFileName(tabId, queryId, setIndex);

        
        try {
            const worker = new Worker(new URL('../../../../../../../../app/workers/csv.worker.ts', import.meta.url), { type: 'module' });

            worker.onmessage = (e: MessageEvent) => {
                const { url, error } = e.data || {};
                if (error) {
                    console.error('CSV worker error:', error);
                    worker.terminate();
                    
                    tryFallback(rows, fileName, delimiter, includeBOM);
                    return;
                }
                if (url) {
                    triggerDownload(url, fileName);
                }
                worker.terminate();
            };

            
            worker.postMessage({ rows, delimiter, includeBOM, fileName });
        } catch (err) {
            console.warn('CSV worker unavailable, falling back to main-thread CSV.', err);
            tryFallback(rows, fileName, delimiter, includeBOM);
        }
    }, [results, tabId, queryId, setIndex, delimiter, includeBOM]);
}

// —— Helpers —— //
function triggerDownload(url: string, fileName: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function tryFallback(rows: any[], fileName: string, delimiter: string, includeBOM: boolean) {
    if (!rows?.length) return;
    const header = Object.keys(rows[0] ?? {});
    const lines = [header.join(delimiter), ...rows.map(r => header.map(k => escapeCsv(String(r?.[k] ?? ''))).join(delimiter))];
    const csv = lines.join('\n');
    const blobParts = includeBOM ? [new Uint8Array([0xef, 0xbb, 0xbf]), csv] : [csv];
    const blob = new Blob(blobParts, { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, fileName);
}

function escapeCsv(s: string) {
    if (s == null) return '';
    
    if (/[",\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

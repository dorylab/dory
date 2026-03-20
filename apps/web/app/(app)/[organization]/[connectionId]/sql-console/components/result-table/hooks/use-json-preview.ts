// components/result-table/hooks/use-json-preview.ts
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TabResult } from '@/lib/client/type';
import { useTranslations } from 'next-intl';

const JSON_PREVIEW_MAX = 5000;

const ric: (cb: () => void) => void = typeof window !== 'undefined' && 'requestIdleCallback' in window ? cb => (window as any).requestIdleCallback(cb) : cb => setTimeout(cb, 0);

export function useJsonPreview({ active, results }: { active: boolean; results: TabResult[] }) {
    const [text, setText] = useState('');
    const t = useTranslations('SqlConsole');
    const slice = useMemo(() => (results?.length > JSON_PREVIEW_MAX ? results.slice(0, JSON_PREVIEW_MAX) : results)?.map(i => i.rowData) ?? [], [results]);

    const canceledRef = useRef(false);

    useEffect(() => {
        if (!active) {
            setText('');
            return;
        }
        canceledRef.current = false;

        if (!slice?.length) {
            setText('');
            return;
        }

        ric(() => {
            if (canceledRef.current) return;
            try {
                const txt = JSON.stringify(slice, null, 2) + (results.length > JSON_PREVIEW_MAX ? `\n${t('JsonPreview.Truncated')}` : '');
                if (!canceledRef.current) setText(txt);
            } catch {
                if (!canceledRef.current) setText(t('JsonPreview.RenderFailed'));
            }
        });

        return () => {
            canceledRef.current = true;
        };
    }, [active, slice, results.length, t]);

    return text;
}

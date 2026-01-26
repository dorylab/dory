'use client';

import { useEffect, useMemo, useRef } from 'react';
import { debounce } from 'lodash-es';
import type { DebouncedFunc } from 'lodash-es';

import type { UITabPayload } from '@/types/tabs';

type UpdateTab = (tabId: string, patch: Partial<UITabPayload>) => void;

export function useDebouncedTabSave(updateTab: UpdateTab) {
    const updateTabRef = useRef(updateTab);

    useEffect(() => {
        updateTabRef.current = updateTab;
    }, [updateTab]);

    const debouncedSave = useMemo<DebouncedFunc<(tabId: string, content: string) => void>>(
        () =>
            debounce((tabId: string, content: string) => {
                updateTabRef.current(tabId, { content });
            }, 500),
        [],
    );

    useEffect(() => {
        return () => {
            debouncedSave.cancel();
        };
    }, [debouncedSave]);

    return {
        saveContent: debouncedSave,
        flushSave: () => debouncedSave.flush(),
    };
}

'use client';

import { useCallback, useEffect, useRef } from 'react';
import { debounce } from 'lodash-es';
import type { DebouncedFunc } from 'lodash-es';

import type { UITabPayload } from '@dory/shared/types/tabs';

type UpdateTab = (tabId: string, patch: Partial<UITabPayload>) => void;

export function useDebouncedTabSave(updateTab: UpdateTab) {
    const updateTabRef = useRef(updateTab);
    const savesByTabRef = useRef(new Map<string, DebouncedFunc<(content: string) => void>>());

    useEffect(() => {
        updateTabRef.current = updateTab;
    }, [updateTab]);

    const getSaveForTab = useCallback((tabId: string) => {
        const existing = savesByTabRef.current.get(tabId);
        if (existing) return existing;

        const save = debounce((content: string) => {
            updateTabRef.current(tabId, { content });
        }, 500);
        savesByTabRef.current.set(tabId, save);
        return save;
    }, []);

    const saveContent = useCallback(
        (tabId: string, content: string) => {
            getSaveForTab(tabId)(content);
        },
        [getSaveForTab],
    );

    const flushSave = useCallback((tabId?: string) => {
        if (tabId) {
            savesByTabRef.current.get(tabId)?.flush();
            return;
        }

        for (const save of savesByTabRef.current.values()) {
            save.flush();
        }
    }, []);

    useEffect(() => {
        const savesByTab = savesByTabRef.current;
        return () => {
            for (const save of savesByTab.values()) {
                save.flush();
                save.cancel();
            }
            savesByTab.clear();
        };
    }, []);

    return {
        saveContent,
        flushSave,
    };
}

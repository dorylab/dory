'use client';

import { useCallback } from 'react';

const HORIZONTAL_LAYOUT_COOKIE = 'data-explorer-panels:layout';
const DEFAULT_HORIZONTAL_LAYOUT = [33, 67] as const;

export function useDataExplorerLayout(defaultLayout: number[] | undefined) {
    const normalizedLayout = defaultLayout ?? DEFAULT_HORIZONTAL_LAYOUT;

    const onLayout = useCallback((sizes: number[]) => {
        try {
            document.cookie = `${HORIZONTAL_LAYOUT_COOKIE}=${JSON.stringify(sizes)}; path=/; max-age=31536000`;
        } catch {
            // ignore cookie failures
        }
    }, []);

    return {
        normalizedLayout,
        onLayout,
    };
}

export { DEFAULT_HORIZONTAL_LAYOUT };


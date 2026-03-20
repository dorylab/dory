'use client';

import { useEffect } from 'react';
import type { MutableRefObject } from 'react';

export function useMonacoTheme(
    monacoRef: MutableRefObject<typeof import('monaco-editor') | null>,
    themeName?: string,
) {
    useEffect(() => {
        if (!monacoRef.current || !themeName) return;
        monacoRef.current.editor.setTheme(themeName);
    }, [monacoRef, themeName]);
}

'use client';

import { useEffect } from 'react';

const FONT_SIZE_KEY = 'app:font-size';
const DEFAULT_FONT_SIZE = '16px';
const FONT_SIZE_VALUES = new Set(['14px', '16px', '18px', '20px']);

function applyFontSize(value: string) {
    document.documentElement.style.setProperty('--app-font-size', value);
    document.documentElement.style.fontSize = value;
    if (document.body) {
        document.body.style.fontSize = value;
    }
}

export function FontSizeProvider() {
    useEffect(() => {
        const stored = window.localStorage.getItem(FONT_SIZE_KEY);
        const nextValue = stored && FONT_SIZE_VALUES.has(stored) ? stored : DEFAULT_FONT_SIZE;
        applyFontSize(nextValue);

        const onStorage = (event: StorageEvent) => {
            if (event.key !== FONT_SIZE_KEY) return;
            const next = event.newValue && FONT_SIZE_VALUES.has(event.newValue) ? event.newValue : DEFAULT_FONT_SIZE;
            applyFontSize(next);
        };

        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    return null;
}

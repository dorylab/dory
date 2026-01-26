import { useEffect, useState } from 'react';

export function useLocalStorageBooleanV2(keys: string[], defaultValue: boolean) {
    const [val, setVal] = useState(defaultValue);
    useEffect(() => {
        try {
            for (const k of keys) {
                const raw = localStorage.getItem(k);
                if (raw != null) {
                    setVal(raw === '1');
                    if (k !== keys[0]) localStorage.setItem(keys[0], raw);
                    return;
                }
            }
        } catch {}
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const update = (next: boolean) => {
        setVal(next);
        try {
            localStorage.setItem(keys[0], next ? '1' : '0');
        } catch {}
    };
    return [val, update] as const;
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

export function useLocalStorageNumber(key: string, defaultValue: number, { min = 1000, max = 1_000_000 }: { min?: number; max?: number } = {}) {
    const [val, setVal] = useState(defaultValue);
    useEffect(() => {
        try {
            const raw = localStorage.getItem(key);
            if (raw != null) {
                const v = Number(raw);
                if (!Number.isNaN(v)) setVal(clamp(v, min, max));
            }
        } catch {}
    }, [key, min, max]);
    const update = (next: number) => {
        const safe = clamp(Math.floor(next), min, max);
        setVal(safe);
        try {
            localStorage.setItem(key, String(safe));
        } catch {}
    };
    return [val, update] as const;
}

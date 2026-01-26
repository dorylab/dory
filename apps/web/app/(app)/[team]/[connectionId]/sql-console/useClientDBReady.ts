'use client';

import { useEffect, useRef, useState } from 'react';
import { migrateClientDB } from '@/lib/client/pglite/migrate-client';


let migratePromise: Promise<void> | null = null;

function ensureMigrated() {
    if (!migratePromise) {
        migratePromise = (async () => {
            await migrateClientDB();
        })();
    }
    return migratePromise;
}

export function useClientDBReady() {
    const [ready, setReady] = useState(false);
    const [initializing, setInitializing] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        setInitializing(true);
        setError(null);

        ensureMigrated()
            .then(() => {
                if (!mountedRef.current) return;
                setReady(true);
                setInitializing(false);
            })
            .catch(err => {
                console.error('[PGlite migrate] failed:', err);
                if (!mountedRef.current) return;
                setError(err);
                setReady(false);
                setInitializing(false);
            });
    }, []);

    return { ready, initializing, error };
}

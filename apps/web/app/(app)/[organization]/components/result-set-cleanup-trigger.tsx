'use client';

import { useEffect } from 'react';

import { cleanupExpiredResultSets } from '@/lib/organization/api';

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function ResultSetCleanupTrigger({ organizationId }: { organizationId: string }) {
    useEffect(() => {
        if (!organizationId || typeof window === 'undefined') return;

        const storageKey = `dory:result-set-cleanup:last-run:${organizationId}`;
        const now = Date.now();
        const lastRun = Number(window.localStorage.getItem(storageKey) ?? '0');

        if (Number.isFinite(lastRun) && now - lastRun < CLEANUP_INTERVAL_MS) return;

        window.localStorage.setItem(storageKey, String(now));
        void cleanupExpiredResultSets().catch(() => {
            window.localStorage.removeItem(storageKey);
        });
    }, [organizationId]);

    return null;
}

'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useSession } from '@/lib/auth-client';
import { readRecentReferences, recentStorageKey, updateRecentReferences, type RecentReference } from './recent-references';
import type { ChatReference } from './types';

export function useRecentReferences(organization: string) {
    const { data: session } = useSession();
    const userId = session?.user?.id;
    const key = userId ? recentStorageKey(userId, organization) : null;
    const client = useQueryClient();
    const queryKey = ['recent-references', key];
    const { data = [] } = useQuery({
        queryKey,
        enabled: Boolean(key),
        staleTime: Infinity,
        queryFn: (): RecentReference[] => {
            try {
                return key ? readRecentReferences(window.localStorage, key) : [];
            } catch {
                return [];
            }
        },
    });
    useEffect(() => {
        const listener = (event: StorageEvent) => {
            if (event.key === key) void client.invalidateQueries({ queryKey: ['recent-references', key] });
        };
        window.addEventListener('storage', listener);
        return () => window.removeEventListener('storage', listener);
    }, [key, client]);
    return {
        recent: key ? data : [],
        record: (references: ChatReference[]) => {
            if (!key) return;
            let previous = client.getQueryData<RecentReference[]>(queryKey) ?? [];
            try {
                previous = readRecentReferences(window.localStorage, key);
            } catch {
                /* Storage can be disabled. */
            }
            const next = updateRecentReferences(previous, references, Date.now());
            client.setQueryData(queryKey, next);
            try {
                window.localStorage.setItem(key, JSON.stringify(next));
            } catch {
                /* Keep the in-memory session usable. */
            }
        },
    };
}

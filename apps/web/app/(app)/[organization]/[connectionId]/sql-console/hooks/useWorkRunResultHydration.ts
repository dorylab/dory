'use client';

import { useEffect, useRef } from 'react';
import { useSetAtom } from 'jotai';
import { executeActionClient } from '@/lib/actions/client';
import { useDB } from '@/lib/client/use-pglite';
import type { UITabPayload } from '@dory/shared/types/tabs';
import { sessionIdByTabAtom } from '../sql-console.store';

type WorkRunEventResult = {
    tabId: string;
    sessionId: string;
    query: {
        session: Record<string, unknown>;
        queryResultSets: Array<Record<string, unknown>>;
        results: unknown[][];
        meta: Record<string, unknown>;
    };
};

const SID = (tabId: string) => `sqlconsole:sessionId:${tabId}`;

export function useWorkRunResultHydration({ activeTab, isLoading }: { activeTab: UITabPayload | undefined; isLoading: boolean }) {
    const { dbReady, applyServerResult } = useDB();
    const setSessionIdMap = useSetAtom(sessionIdByTabAtom);
    const hydratedRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (isLoading || !dbReady || !activeTab || activeTab.tabType !== 'sql') return;

        const resultMeta = activeTab.resultMeta;
        const workId = resultMeta?.workId;
        const eventId = resultMeta?.workRunEventId;
        const sessionId = resultMeta?.sessionId;

        if (resultMeta?.source !== 'work-run') return;
        if (!workId || !eventId || !sessionId) return;

        const key = `${activeTab.tabId}:${eventId}:${sessionId}`;
        if (hydratedRef.current.has(key)) {
            setSessionIdMap(prev => (prev[activeTab.tabId] === sessionId ? prev : { ...prev, [activeTab.tabId]: sessionId }));
            return;
        }

        let canceled = false;
        (async () => {
            const payload = await executeActionClient<WorkRunEventResult>('work.getRunEventResult', {
                workId,
                eventId,
            });
            if (canceled) return;
            await applyServerResult(payload.query as any);
            if (canceled) return;

            hydratedRef.current.add(key);
            setSessionIdMap(prev => ({ ...prev, [activeTab.tabId]: payload.sessionId }));
            try {
                localStorage.setItem(SID(activeTab.tabId), payload.sessionId);
            } catch {
                // ignore
            }
        })().catch(error => {
            console.error('[useWorkRunResultHydration] failed', error);
        });

        return () => {
            canceled = true;
        };
    }, [activeTab, applyServerResult, dbReady, isLoading, setSessionIdMap]);
}

'use client';

import { useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';

import { notifySqlConsoleResultDataUpdated } from '@/lib/client/sql-console-result-store';
import type { UITabPayload } from '@dory/shared/types/tabs';
import { sessionIdByTabAtom } from '../sql-console.store';
import { resolveInitialResultTargetTabId, type SqlWorkspaceInitialResultTarget } from '../initial-result-target';
import { markQueryHistoryRestoredSession } from '../query-history-result-restore';
import { upsertActiveSetAtom } from '../components/result-table/stores/active-set.atoms';
import { getSessionStorageKey, type SqlWorkspaceScope } from '../workspace-scope';

export function useInitialResultTarget({
    target,
    tabs,
    areTabsHydrated,
    isLoading,
    addTab,
    setActiveTabId,
    workspaceScope,
}: {
    target?: SqlWorkspaceInitialResultTarget | null;
    tabs: UITabPayload[];
    areTabsHydrated: boolean;
    isLoading: boolean;
    addTab: (payload?: { tabName?: string; content?: string; activate?: boolean }) => Promise<string>;
    setActiveTabId: (tabId: string) => void;
    workspaceScope: SqlWorkspaceScope;
}) {
    const sessionIdMap = useAtomValue(sessionIdByTabAtom);
    const setSessionIdMap = useSetAtom(sessionIdByTabAtom);
    const setActiveSet = useSetAtom(upsertActiveSetAtom);
    const restoringRef = useRef<string | null>(null);
    const restoredRef = useRef<string | null>(null);
    const tabsRef = useRef(tabs);
    tabsRef.current = tabs;
    const targetKey = target ? `${target.tabId}:${target.sessionId}:${target.setIndex}` : null;

    useEffect(() => {
        if (!target || !targetKey || !areTabsHydrated || isLoading || restoredRef.current === targetKey || restoringRef.current === targetKey) return;

        restoringRef.current = targetKey;
        const restore = async () => {
            const existingTabId = resolveInitialResultTargetTabId(tabsRef.current, sessionIdMap, target);
            const resolvedTabId = existingTabId ?? (await addTab({ tabName: target.title, content: target.sql ?? '', activate: true }));

            setActiveTabId(resolvedTabId);
            setSessionIdMap(previous => ({ ...previous, [resolvedTabId]: target.sessionId }));
            setActiveSet({
                tabId: resolvedTabId,
                sessionId: target.sessionId,
                activeSet: target.setIndex,
                userPicked: true,
            });
            try {
                localStorage.setItem(getSessionStorageKey(resolvedTabId, workspaceScope), target.sessionId);
                markQueryHistoryRestoredSession(resolvedTabId, target.sessionId);
            } catch {
                // Browser storage is only a restoration optimization.
            }
            notifySqlConsoleResultDataUpdated();
            restoredRef.current = targetKey;
        };

        void restore()
            .catch(error => {
                console.error('[useInitialResultTarget] failed to restore Artifact result', error);
            })
            .finally(() => {
                if (restoringRef.current === targetKey) restoringRef.current = null;
            });
    }, [addTab, areTabsHydrated, isLoading, sessionIdMap, setActiveSet, setActiveTabId, setSessionIdMap, target, targetKey, workspaceScope]);
}

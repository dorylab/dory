import type { UITabPayload } from '@dory/shared/types/tabs';

export type WorkHydrationSessionLike = {
    session: {
        sessionId?: string | null;
        tabId?: string | null;
        startedAt?: string | Date | null;
        finishedAt?: string | Date | null;
        createdAt?: string | Date | null;
    };
};

type AgentWorkspaceResultSetLike = {
    sessionId: string;
    setIndex: number;
};

export type AgentWorkspaceSnapshotSessionLike = WorkHydrationSessionLike & {
    session: WorkHydrationSessionLike['session'] & {
        sessionId: string;
        status?: string;
        sqlText?: string;
        resultSetCount?: number;
    };
    queryResultSets: AgentWorkspaceResultSetLike[];
    results: unknown[][];
};

type SessionCandidate = {
    sessionId: string;
    tabId: string;
    time: number;
    index: number;
};

function timeValue(value: string | Date | null | undefined) {
    if (!value) return 0;
    const date = value instanceof Date ? value : new Date(value);
    const time = date.getTime();
    return Number.isFinite(time) ? time : 0;
}

function sessionTime(session: WorkHydrationSessionLike['session']) {
    return Math.max(timeValue(session.finishedAt), timeValue(session.startedAt), timeValue(session.createdAt));
}

/**
 * Agent tools commonly append several SQL executions to a single workspace tab.
 * Unlike a console script, each tool call has its own query session. Present those
 * result sets as one virtual session so the existing result toolbar can show every
 * result in the tab instead of only the final execution.
 */
export function consolidateAgentWorkspaceSessions<T extends AgentWorkspaceSnapshotSessionLike>(workId: string, sessions: readonly T[], fallbackTabId?: string | null): T[] {
    const groupedByTab = new Map<string, Array<{ session: T; originalIndex: number }>>();

    sessions.forEach((session, originalIndex) => {
        const tabId = session.session.tabId || fallbackTabId;
        if (!tabId || session.queryResultSets.length === 0) return;

        const group = groupedByTab.get(tabId) ?? [];
        group.push({ session, originalIndex });
        groupedByTab.set(tabId, group);
    });

    const consolidated = [...sessions];
    for (const [tabId, group] of groupedByTab) {
        if (group.length < 2) continue;

        const ordered = group.toSorted((left, right) => {
            const timeDelta = sessionTime(left.session.session) - sessionTime(right.session.session);
            return timeDelta || left.originalIndex - right.originalIndex;
        });
        const latest = ordered.at(-1)!.session;
        const flattened = ordered.flatMap(({ session }) =>
            session.queryResultSets.map((resultSet, resultIndex) => ({
                resultSet,
                rows: Array.isArray(session.results[resultIndex]) ? session.results[resultIndex]! : [],
            })),
        );
        const virtualSessionId = `agent-workspace:${workId}:${tabId}`;

        consolidated.push({
            ...latest,
            session: {
                ...latest.session,
                sessionId: virtualSessionId,
                tabId,
                resultSetCount: flattened.length,
            },
            queryResultSets: flattened.map(({ resultSet }, setIndex) => ({
                ...resultSet,
                sessionId: virtualSessionId,
                setIndex,
            })),
            results: flattened.map(({ rows }) => rows),
        } as T);
    }

    return consolidated;
}

export function resolveWorkHydrationTarget({
    tabs,
    sessions,
    requestedTabId,
    requestedSessionId,
}: {
    tabs: UITabPayload[];
    sessions: WorkHydrationSessionLike[];
    requestedTabId?: string | null;
    requestedSessionId?: string | null;
}) {
    const tabIds = new Set(tabs.map(tab => tab.tabId).filter(Boolean));
    const shouldFilterTabs = tabIds.size > 0;
    const latestByTab = new Map<string, SessionCandidate>();
    let latestSession: SessionCandidate | null = null;

    for (const [index, item] of sessions.entries()) {
        const sessionId = item.session.sessionId;
        const tabId = item.session.tabId;
        if (!sessionId || !tabId || (shouldFilterTabs && !tabIds.has(tabId))) continue;

        const candidate = {
            sessionId,
            tabId,
            time: sessionTime(item.session),
            index,
        };
        const existing = latestByTab.get(tabId);
        if (!existing || candidate.time > existing.time || (candidate.time === existing.time && candidate.index > existing.index)) {
            latestByTab.set(tabId, candidate);
        }
        if (!latestSession || candidate.time > latestSession.time || (candidate.time === latestSession.time && candidate.index > latestSession.index)) {
            latestSession = candidate;
        }
    }

    const sessionIdByTab = Object.fromEntries([...latestByTab.entries()].map(([tabId, item]) => [tabId, item.sessionId]));
    const requestedTabExists = Boolean(requestedTabId && (!shouldFilterTabs || tabIds.has(requestedTabId)));
    const targetTabId = requestedTabExists ? requestedTabId! : (latestSession?.tabId ?? tabs[0]?.tabId ?? null);
    const targetSessionId = requestedSessionId || (targetTabId ? (sessionIdByTab[targetTabId] ?? null) : null) || latestSession?.sessionId || null;

    if (targetTabId && targetSessionId) {
        sessionIdByTab[targetTabId] = targetSessionId;
    }

    return {
        sessionIdByTab,
        targetTabId,
        targetSessionId,
    };
}

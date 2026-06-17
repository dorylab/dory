type WorkLike = {
    workId: string;
    connectionId?: string | null;
};

type SessionLike = {
    session?: {
        sessionId?: string | null;
        tabId?: string | null;
        connectionId?: string | null;
        startedAt?: string | Date | null;
        createdAt?: string | Date | null;
    } | null;
};

type TabLike = {
    tabId?: string | null;
    connectionId?: string | null;
};

type SnapshotLike = {
    work: WorkLike;
    sessions?: SessionLike[];
    tabs?: TabLike[];
};

export type AgentWorkspaceTarget = {
    connectionId: string | null;
    tabId?: string | null;
    sessionId?: string | null;
};

function timeValue(value: string | Date | null | undefined) {
    if (!value) return 0;
    const date = value instanceof Date ? value : new Date(value);
    const time = date.getTime();
    return Number.isFinite(time) ? time : 0;
}

export function resolveAgentWorkspaceTarget(snapshot: SnapshotLike): AgentWorkspaceTarget {
    if (snapshot.work.connectionId) {
        const latestSession = [...(snapshot.sessions ?? [])]
            .map((item, index) => ({ item, index }))
            .sort((a, b) => {
                const aTime = timeValue(a.item.session?.startedAt ?? a.item.session?.createdAt);
                const bTime = timeValue(b.item.session?.startedAt ?? b.item.session?.createdAt);
                if (aTime !== bTime) return bTime - aTime;
                return a.index - b.index;
            })
            .find(({ item }) => item.session?.connectionId === snapshot.work.connectionId || !item.session?.connectionId)?.item.session;
        return {
            connectionId: snapshot.work.connectionId,
            tabId: latestSession?.tabId ?? snapshot.tabs?.find(tab => tab.connectionId === snapshot.work.connectionId)?.tabId ?? snapshot.tabs?.[0]?.tabId ?? null,
            sessionId: latestSession?.sessionId ?? null,
        };
    }

    const latestSessionWithConnection = [...(snapshot.sessions ?? [])]
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
            const aTime = timeValue(a.item.session?.startedAt ?? a.item.session?.createdAt);
            const bTime = timeValue(b.item.session?.startedAt ?? b.item.session?.createdAt);
            if (aTime !== bTime) return bTime - aTime;
            return a.index - b.index;
        })
        .find(({ item }) => Boolean(item.session?.connectionId))?.item.session;

    if (latestSessionWithConnection?.connectionId) {
        return {
            connectionId: latestSessionWithConnection.connectionId,
            tabId: latestSessionWithConnection.tabId ?? snapshot.tabs?.find(tab => tab.connectionId === latestSessionWithConnection.connectionId)?.tabId ?? null,
            sessionId: latestSessionWithConnection.sessionId ?? null,
        };
    }

    const firstTabWithConnection = snapshot.tabs?.find(tab => Boolean(tab.connectionId));
    return {
        connectionId: firstTabWithConnection?.connectionId ?? null,
        tabId: firstTabWithConnection?.tabId ?? null,
        sessionId: null,
    };
}

export function buildAgentRunDetailPath(organization: string, workId: string) {
    return `/${encodeURIComponent(organization)}/agent-runs/${encodeURIComponent(workId)}`;
}

export function buildAgentWorkspacePath({
    organization,
    workId,
    connectionId,
    tabId,
    sessionId,
}: {
    organization: string;
    workId: string;
    connectionId?: string | null;
    tabId?: string | null;
    sessionId?: string | null;
}) {
    if (!connectionId) {
        return buildAgentRunDetailPath(organization, workId);
    }

    const params = new URLSearchParams();
    if (tabId) params.set('tabId', tabId);
    if (sessionId) params.set('sessionId', sessionId);
    const query = params.toString();
    const path = `/${encodeURIComponent(organization)}/agent-runs/${encodeURIComponent(workId)}/workspace/${encodeURIComponent(connectionId)}`;
    return query ? `${path}?${query}` : path;
}

export function buildAgentWorkspacePathFromSnapshot(organization: string, snapshot: SnapshotLike) {
    const target = resolveAgentWorkspaceTarget(snapshot);
    return buildAgentWorkspacePath({
        organization,
        workId: snapshot.work.workId,
        connectionId: target.connectionId,
        tabId: target.tabId,
        sessionId: target.sessionId,
    });
}

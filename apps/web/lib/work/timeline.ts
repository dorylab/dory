export type WorkTimelineRunEvent = {
    id: string;
    role: string;
    payload?: Record<string, unknown> | null;
    createdAt: string | Date;
};

export type WorkTimelineWorkspaceSnapshot = {
    id: string;
    createdAt: string | Date;
};

export type WorkTimelineEvent<TRunEvent extends WorkTimelineRunEvent, TSnapshot extends WorkTimelineWorkspaceSnapshot> = {
    id: string;
    kind: 'run_event' | 'workspace_snapshot';
    runEvent: TRunEvent | null;
    snapshot: TSnapshot | null;
    createdAt: TRunEvent['createdAt'] | TSnapshot['createdAt'];
};

function toTimestamp(value: string | Date) {
    const date = value instanceof Date ? value : new Date(value);
    const timestamp = date.getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function snapshotIdFromRunEvent(event: WorkTimelineRunEvent) {
    if (event.role !== 'user') return null;
    const payload = event.payload && typeof event.payload === 'object' ? event.payload : null;
    const workspaceSnapshotId = payload?.workspaceSnapshotId;
    return typeof workspaceSnapshotId === 'string' && workspaceSnapshotId ? workspaceSnapshotId : null;
}

export function buildWorkTimelineEvents<TRunEvent extends WorkTimelineRunEvent, TSnapshot extends WorkTimelineWorkspaceSnapshot>(input: {
    runEvents: TRunEvent[];
    workspaceSnapshots: TSnapshot[];
}): WorkTimelineEvent<TRunEvent, TSnapshot>[] {
    const snapshotsById = new Map(input.workspaceSnapshots.map(snapshot => [snapshot.id, snapshot]));
    const matchedSnapshotIds = new Set<string>();

    const timelineEvents: WorkTimelineEvent<TRunEvent, TSnapshot>[] = input.runEvents.map(event => {
        const snapshotId = snapshotIdFromRunEvent(event);
        const snapshot = snapshotId ? (snapshotsById.get(snapshotId) ?? null) : null;
        if (snapshot) {
            matchedSnapshotIds.add(snapshot.id);
        }

        return {
            id: `run-event:${event.id}`,
            kind: 'run_event',
            runEvent: event,
            snapshot,
            createdAt: event.createdAt,
        };
    });

    for (const snapshot of input.workspaceSnapshots) {
        if (matchedSnapshotIds.has(snapshot.id)) continue;
        timelineEvents.push({
            id: `workspace-snapshot:${snapshot.id}`,
            kind: 'workspace_snapshot',
            runEvent: null,
            snapshot,
            createdAt: snapshot.createdAt,
        });
    }

    return timelineEvents.sort((a, b) => {
        const timeDiff = toTimestamp(a.createdAt) - toTimestamp(b.createdAt);
        if (timeDiff !== 0) return timeDiff;
        return a.id.localeCompare(b.id);
    });
}

export type InvestigationCardWorkStatus = 'draft' | 'running' | 'completed';
export type InvestigationCardRunStatus = 'running' | 'completed' | 'failed';

export type InvestigationCardInvestigation = {
    id: string;
    status: InvestigationCardWorkStatus;
    lastQueryAt?: string | Date | null;
    findings?: unknown[];
    sqlAssetCount?: number;
};

export type InvestigationCardRun = {
    status: InvestigationCardRunStatus;
} | null;

export type InvestigationCardRunEvent = {
    type: string;
    role: string;
    payload?: Record<string, unknown> | null;
    createdAt: string | Date;
};

function toTimestamp(value?: string | Date | null) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    const timestamp = date.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
}

function eventInvestigationId(event: InvestigationCardRunEvent) {
    const payload = event.payload && typeof event.payload === 'object' ? event.payload : null;
    const investigationId = payload?.investigationId;
    return typeof investigationId === 'string' && investigationId ? investigationId : null;
}

export function runningInvestigationIdsFromRunEvents(latestRun: InvestigationCardRun, events: InvestigationCardRunEvent[]) {
    if (latestRun?.status !== 'running') return new Set<string>();

    const ids = new Set<string>();
    for (const event of events) {
        const investigationId = eventInvestigationId(event);
        if (investigationId) ids.add(investigationId);
    }
    return ids;
}

export function latestHumanExecutionAtForInvestigation(investigationId: string, events: InvestigationCardRunEvent[]) {
    let latestTimestamp: number | null = null;

    for (const event of events) {
        if (event.role !== 'user') continue;
        if (eventInvestigationId(event) !== investigationId) continue;

        const payload = event.payload && typeof event.payload === 'object' ? event.payload : null;
        if (typeof payload?.workspaceSnapshotId !== 'string' || !payload.workspaceSnapshotId) continue;

        const timestamp = toTimestamp(event.createdAt);
        if (timestamp === null) continue;
        latestTimestamp = latestTimestamp === null ? timestamp : Math.max(latestTimestamp, timestamp);
    }

    return latestTimestamp === null ? null : new Date(latestTimestamp).toISOString();
}

export function effectiveInvestigationStatus(input: {
    investigation: InvestigationCardInvestigation;
    latestRun: InvestigationCardRun;
    latestRunEvents: InvestigationCardRunEvent[];
}): InvestigationCardWorkStatus {
    const runningIds = runningInvestigationIdsFromRunEvents(input.latestRun, input.latestRunEvents);
    if (runningIds.has(input.investigation.id)) return 'running';

    if (input.investigation.status === 'completed') return 'completed';
    if ((input.investigation.findings?.length ?? 0) > 0) return 'completed';
    if ((input.investigation.sqlAssetCount ?? 0) > 0) return 'completed';
    if (input.investigation.lastQueryAt) return 'completed';

    return input.investigation.status;
}

export function investigationActivityDisplay(input: { investigation: InvestigationCardInvestigation; latestRunEvents: InvestigationCardRunEvent[] }): {
    label: string;
    value: string | Date | null;
} {
    const latestHumanExecutionAt = latestHumanExecutionAtForInvestigation(input.investigation.id, input.latestRunEvents);
    if (latestHumanExecutionAt) {
        return {
            label: 'Last user run',
            value: latestHumanExecutionAt,
        };
    }

    return {
        label: 'Last query',
        value: input.investigation.lastQueryAt ?? null,
    };
}

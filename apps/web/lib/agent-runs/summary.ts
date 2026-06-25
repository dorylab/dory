export type AgentRunStatus = 'active' | 'completed' | 'error' | 'archived' | (string & {});

export type AgentRunSummaryMetadata = {
    summaryTitle?: string | null;
    findings: string[];
    steps: string[];
    updatedAt?: string | null;
    sections?: AgentRunSummarySectionMetadata[];
};

export type AgentRunSummarySectionMetadata = {
    summaryTitle?: string | null;
    findings: string[];
    steps: string[];
    finishedAt?: string | null;
};

export type AgentRunWorkLike = {
    workId: string;
    title?: string | null;
    status?: AgentRunStatus | null;
    metadata?: Record<string, unknown> | null;
    connectionId?: string | null;
    lastActiveAt?: string | Date | null;
    createdAt?: string | Date | null;
};

export type AgentRunTabLike = {
    tabId?: string | null;
    tabName?: string | null;
    connectionId?: string | null;
};

export type AgentRunSessionLike = {
    session?: {
        sessionId?: string | null;
        tabId?: string | null;
        connectionId?: string | null;
        sqlText?: string | null;
        status?: string | null;
        durationMs?: number | null;
        startedAt?: string | Date | null;
        finishedAt?: string | Date | null;
        createdAt?: string | Date | null;
        errorMessage?: string | null;
    } | null;
    queryResultSets?: Array<{
        rowCount?: number | null;
        durationMs?: number | null;
        status?: string | null;
        errorMessage?: string | null;
        errorCode?: string | null;
    }>;
};

export type AgentRunSnapshotLike = {
    work: AgentRunWorkLike;
    tabs?: AgentRunTabLike[];
    sessions?: AgentRunSessionLike[];
};

export type AgentRunEventLike = {
    eventId?: string | null;
    toolName?: string | null;
    status?: 'success' | 'error' | string | null;
    inputSummary?: Record<string, unknown> | null;
    outputSummary?: Record<string, unknown> | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    durationMs?: number | null;
    createdAt?: string | Date | null;
};

export type AgentRunTimelineItem = {
    id: string;
    time?: string | Date | null;
    title: string;
    meta: string[];
    status?: string | null;
    rawInput?: Record<string, unknown> | null;
    rawOutput?: Record<string, unknown> | null;
    error?: string | null;
    sessionId?: string | null;
    tabId?: string | null;
    sqlLength?: number | null;
};

export function getAgentRunStatusLabel(status: string | null | undefined) {
    if (status === 'completed') return 'Completed';
    if (status === 'error') return 'Failed';
    if (status === 'archived') return 'Archived';
    return 'Active';
}

export function getAgentRunStatusVariant(status: string | null | undefined): 'default' | 'secondary' | 'destructive' | 'outline' {
    if (status === 'error') return 'destructive';
    if (status === 'completed') return 'secondary';
    if (status === 'archived') return 'outline';
    return 'default';
}

export function getAgentRunSummary(metadata: Record<string, unknown> | null | undefined): AgentRunSummaryMetadata | null {
    const raw = metadata?.agentRunSummary;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    const findings = cleanSummaryItems(record.findings);
    const steps = cleanSummaryItems(record.steps);
    if (!findings.length && !steps.length) return null;

    return {
        summaryTitle: typeof record.summaryTitle === 'string' && record.summaryTitle.trim() ? record.summaryTitle : null,
        findings,
        steps,
        updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null,
        sections: getPersistedSummarySections(record.sections),
    };
}

function cleanSummaryItems(value: unknown) {
    return Array.isArray(value) ? value.map(item => (typeof item === 'string' ? item.trim() : '')).filter(Boolean) : [];
}

function getPersistedSummarySections(rawSections: unknown): AgentRunSummarySectionMetadata[] {
    if (!Array.isArray(rawSections)) return [];

    return rawSections
        .map((section): AgentRunSummarySectionMetadata | null => {
            if (!section || typeof section !== 'object' || Array.isArray(section)) return null;
            const record = section as Record<string, unknown>;
            const findings = cleanSummaryItems(record.findings);
            const steps = cleanSummaryItems(record.steps);
            const finishedAt = typeof record.finishedAt === 'string' && record.finishedAt.trim() ? record.finishedAt : null;
            if ((!findings.length && !steps.length) || !finishedAt) return null;

            return {
                summaryTitle: typeof record.summaryTitle === 'string' && record.summaryTitle.trim() ? record.summaryTitle : null,
                findings,
                steps,
                finishedAt,
            };
        })
        .filter((section): section is AgentRunSummarySectionMetadata => section !== null);
}

export function getAgentRunSummarySections(metadata: Record<string, unknown> | null | undefined): AgentRunSummarySectionMetadata[] {
    const summary = getAgentRunSummary(metadata);
    if (!summary) return [];

    if (summary.sections?.length) return summary.sections;

    return [
        {
            summaryTitle: summary.summaryTitle,
            findings: summary.findings,
            steps: summary.steps,
            finishedAt: summary.updatedAt ?? null,
        },
    ];
}

export function getAgentRunSummaryPreview(metadata: Record<string, unknown> | null | undefined) {
    return getAgentRunSummary(metadata)?.findings[0] ?? 'No summary generated yet.';
}

export function getAgentRunStats(snapshot: AgentRunSnapshotLike, connectionName?: string | null) {
    return {
        dataSource: connectionName || snapshot.work.connectionId || 'None',
        tabCount: snapshot.tabs?.length ?? 0,
        sqlExecutionCount: snapshot.sessions?.length ?? 0,
        lastActiveAt: snapshot.work.lastActiveAt ?? snapshot.work.createdAt ?? null,
        statusLabel: getAgentRunStatusLabel(snapshot.work.status),
    };
}

function formatSqlRuns(count: number) {
    return `${count.toLocaleString()} ${count === 1 ? 'SQL run' : 'SQL runs'}`;
}

function formatTabsCreated(count: number) {
    return `${count.toLocaleString()} ${count === 1 ? 'tab created' : 'tabs created'}`;
}

function formatTabsOnly(count: number) {
    return `${count.toLocaleString()} ${count === 1 ? 'tab' : 'tabs'}`;
}

export function getAgentRunOutputLabel(snapshot: AgentRunSnapshotLike) {
    const tabCount = snapshot.tabs?.length ?? 0;
    const sqlExecutionCount = snapshot.sessions?.length ?? 0;
    const output = `${formatTabsOnly(tabCount)} · ${formatSqlRuns(sqlExecutionCount)}`;
    return snapshot.work.status === 'active' ? `Running · ${output}` : `Generated ${output}`;
}

export function getAgentRunActivitySummary(snapshot: AgentRunSnapshotLike, events: AgentRunEventLike[] = []) {
    const tabCount = snapshot.tabs?.length ?? 0;
    const sqlExecutionCount = snapshot.sessions?.length ?? 0;
    const status = snapshot.work.status === 'error' ? 'failed' : snapshot.work.status === 'completed' ? 'completed' : snapshot.work.status === 'archived' ? 'archived' : 'active';
    const durationMs = events.reduce((sum, event) => sum + (numberValue(event.durationMs) ?? 0), 0);
    const duration = durationMs > 0 ? formatDuration(durationMs) : null;
    return [formatSqlRuns(sqlExecutionCount), formatTabsCreated(tabCount), duration ? `${status} in ${duration}` : status].join(' · ');
}

function toTime(value: string | Date | null | undefined) {
    if (!value) return 0;
    const date = value instanceof Date ? value : new Date(value);
    const time = date.getTime();
    return Number.isFinite(time) ? time : 0;
}

function stringValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value : null;
}

function numberValue(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringArrayValue(value: unknown) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function formatRows(rows: number | null | undefined) {
    if (rows == null) return null;
    return `${rows.toLocaleString()} ${rows === 1 ? 'row' : 'rows'}`;
}

function formatTabs(tabs: number | null | undefined) {
    if (tabs == null) return null;
    return `${tabs.toLocaleString()} ${tabs === 1 ? 'tab' : 'tabs'}`;
}

function formatDuration(ms: number | null | undefined) {
    if (ms == null || !Number.isFinite(ms)) return null;
    if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
    return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

function tabNameById(snapshot: AgentRunSnapshotLike) {
    return new Map((snapshot.tabs ?? []).filter(tab => tab.tabId).map(tab => [tab.tabId!, tab.tabName || 'SQL tab']));
}

function sessionById(snapshot: AgentRunSnapshotLike) {
    return new Map((snapshot.sessions ?? []).filter(item => item.session?.sessionId).map(item => [item.session!.sessionId!, item]));
}

function firstOutputIdentity(output: Record<string, unknown> | null | undefined) {
    const sessionId = stringValue(output?.sessionId);
    const tabId = stringValue(output?.tabId);
    return { sessionId, tabId };
}

function sqlExecutionMeta(session: AgentRunSessionLike | undefined, event: AgentRunEventLike) {
    const firstSet = session?.queryResultSets?.[0];
    const rows = numberValue(event.outputSummary?.rowCount) ?? firstSet?.rowCount ?? null;
    const duration = event.durationMs ?? session?.session?.durationMs ?? firstSet?.durationMs ?? null;
    return [formatRows(rows), formatDuration(duration), event.status ?? session?.session?.status ?? null, 'result not saved'].filter((item): item is string => Boolean(item));
}

function userWorkspaceSaveMeta(event: AgentRunEventLike) {
    const changes = stringArrayValue(event.outputSummary?.changeSummary);
    return [...changes, formatTabs(numberValue(event.outputSummary?.tabCount)), event.status ?? null].filter((item): item is string => Boolean(item));
}

function eventTitle(event: AgentRunEventLike, snapshot: AgentRunSnapshotLike) {
    const tabs = tabNameById(snapshot);
    const sessions = sessionById(snapshot);
    const { sessionId, tabId } = firstOutputIdentity(event.outputSummary);
    const session = sessionId ? sessions.get(sessionId) : undefined;
    const resolvedTabId = tabId ?? session?.session?.tabId ?? null;
    const tabName = resolvedTabId ? tabs.get(resolvedTabId) : null;
    const actorName = stringValue(event.outputSummary?.actorName) ?? stringValue(event.inputSummary?.actorName);

    switch (event.toolName) {
        case 'dory_create_work':
            return 'Created Agent Run';
        case 'dory_finish_work':
            return 'Finished Agent Run';
        case 'dory_list_connections':
            return 'Listed data sources';
        case 'dory_explore_schema':
            return 'Explored schema';
        case 'dory_workspace_tabs':
            return tabName ? `Updated workspace tab "${tabName}"` : 'Updated workspace tabs';
        case 'dory_user_save_workspace':
            return actorName ? `${actorName} saved workspace changes` : 'Saved workspace changes';
        case 'dory_saved_queries':
            return 'Managed saved queries';
        case 'dory_run_readonly_sql':
            return tabName ? `Ran SQL in "${tabName}"` : 'Ran SQL';
        default:
            return event.toolName ? `Ran ${event.toolName}` : 'Recorded activity';
    }
}

export function buildAgentRunTimeline(snapshot: AgentRunSnapshotLike, events: AgentRunEventLike[] = []): AgentRunTimelineItem[] {
    const sessions = sessionById(snapshot);
    const eventItems = events.map((event, index): AgentRunTimelineItem => {
        const { sessionId, tabId } = firstOutputIdentity(event.outputSummary);
        const session = sessionId ? sessions.get(sessionId) : undefined;
        const sqlLength = numberValue(event.inputSummary?.sqlLength) ?? (typeof session?.session?.sqlText === 'string' ? session.session.sqlText.length : null);
        const error = [event.errorCode, event.errorMessage].filter(Boolean).join(': ') || session?.session?.errorMessage || null;
        const meta =
            event.toolName === 'dory_run_readonly_sql'
                ? sqlExecutionMeta(session, event)
                : event.toolName === 'dory_user_save_workspace'
                  ? userWorkspaceSaveMeta(event)
                  : [formatDuration(event.durationMs), event.status ?? null].filter((item): item is string => Boolean(item));

        return {
            id: event.eventId || `${event.toolName || 'event'}-${index}`,
            time: event.createdAt,
            title: eventTitle(event, snapshot),
            meta,
            status: event.status,
            rawInput: event.inputSummary ?? null,
            rawOutput: event.outputSummary ?? null,
            error,
            sessionId,
            tabId: tabId ?? session?.session?.tabId ?? null,
            sqlLength,
        };
    });

    if (eventItems.length) return eventItems;

    const tabs = tabNameById(snapshot);
    return (snapshot.sessions ?? [])
        .map((item, index): AgentRunTimelineItem => {
            const session = item.session;
            const tabName = session?.tabId ? tabs.get(session.tabId) : null;
            const firstSet = item.queryResultSets?.[0];
            return {
                id: session?.sessionId || `session-${index}`,
                time: session?.finishedAt ?? session?.startedAt ?? session?.createdAt,
                title: tabName ? `Ran SQL in "${tabName}"` : 'Ran SQL',
                meta: [
                    formatRows(firstSet?.rowCount ?? null),
                    formatDuration(session?.durationMs ?? firstSet?.durationMs ?? null),
                    session?.status ?? firstSet?.status ?? null,
                ].filter((value): value is string => Boolean(value)),
                status: session?.status ?? firstSet?.status ?? null,
                rawInput: session?.sqlText ? { sqlLength: session.sqlText.length } : null,
                rawOutput: firstSet ? { rowCount: firstSet.rowCount ?? null, status: firstSet.status ?? null } : null,
                error: session?.errorMessage ?? firstSet?.errorMessage ?? null,
                sessionId: session?.sessionId ?? null,
                tabId: session?.tabId ?? null,
                sqlLength: session?.sqlText?.length ?? null,
            };
        })
        .sort((a, b) => toTime(b.time) - toTime(a.time));
}

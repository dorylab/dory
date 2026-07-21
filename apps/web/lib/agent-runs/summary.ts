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

export type AgentRunTextFormatter = {
    statusLabel: (status: string | null | undefined) => string;
    noSummaryPreview: () => string;
    dataSourceNone: () => string;
    sqlRuns: (count: number) => string;
    tabsCreated: (count: number) => string;
    tabs: (count: number) => string;
    rows: (count: number) => string;
    outputLabel: (input: { isRunning: boolean; output: string }) => string;
    activitySummary: (input: { sqlRuns: string; tabsCreated: string; status: string; duration: string | null }) => string;
    activityStatus: (status: string) => string;
    activityStatusWithDuration: (status: string, duration: string) => string;
    eventTitle: (key: AgentRunEventTitleKey, values?: Record<string, string>) => string;
    fallbackSqlTab: () => string;
    resultNotSaved: () => string;
};

type AgentRunEventTitleKey =
    | 'created'
    | 'finished'
    | 'listedDataSources'
    | 'exploredSchema'
    | 'updatedWorkspaceTab'
    | 'updatedWorkspaceTabs'
    | 'actorSavedWorkspaceChanges'
    | 'savedWorkspaceChanges'
    | 'managedSavedQueries'
    | 'ranSqlInTab'
    | 'ranSql'
    | 'ranTool'
    | 'recordedActivity';

export function getAgentRunStatusLabel(status: string | null | undefined) {
    if (status === 'active') return 'Loading';
    if (status === 'completed') return 'Completed';
    if (status === 'error') return 'Failed';
    if (status === 'archived') return 'Archived';
    return 'Active';
}

export const defaultAgentRunTextFormatter: AgentRunTextFormatter = {
    statusLabel: getAgentRunStatusLabel,
    noSummaryPreview: () => 'No summary generated yet.',
    dataSourceNone: () => 'None',
    sqlRuns: count => `${count.toLocaleString()} ${count === 1 ? 'SQL run' : 'SQL runs'}`,
    tabsCreated: count => `${count.toLocaleString()} ${count === 1 ? 'tab created' : 'tabs created'}`,
    tabs: count => `${count.toLocaleString()} ${count === 1 ? 'tab' : 'tabs'}`,
    rows: count => `${count.toLocaleString()} ${count === 1 ? 'row' : 'rows'}`,
    outputLabel: ({ isRunning, output }) => (isRunning ? `Running · ${output}` : `Generated ${output}`),
    activitySummary: ({ sqlRuns, tabsCreated, status, duration }) => [sqlRuns, tabsCreated, duration ? `${status} in ${duration}` : status].join(' · '),
    activityStatus: status => status,
    activityStatusWithDuration: (status, duration) => `${status} in ${duration}`,
    eventTitle: (key, values) => {
        switch (key) {
            case 'created':
                return 'Created Agent Run';
            case 'finished':
                return 'Finished Agent Run';
            case 'listedDataSources':
                return 'Listed data sources';
            case 'exploredSchema':
                return 'Explored schema';
            case 'updatedWorkspaceTab':
                return `Updated workspace tab "${values?.tabName ?? ''}"`;
            case 'updatedWorkspaceTabs':
                return 'Updated workspace tabs';
            case 'actorSavedWorkspaceChanges':
                return `${values?.actorName ?? ''} saved workspace changes`;
            case 'savedWorkspaceChanges':
                return 'Saved workspace changes';
            case 'managedSavedQueries':
                return 'Managed saved queries';
            case 'ranSqlInTab':
                return `Ran SQL in "${values?.tabName ?? ''}"`;
            case 'ranSql':
                return 'Ran SQL';
            case 'ranTool':
                return `Ran ${values?.toolName ?? ''}`;
            case 'recordedActivity':
                return 'Recorded activity';
        }
    },
    fallbackSqlTab: () => 'SQL tab',
    resultNotSaved: () => 'result not saved',
};

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

export function getAgentRunSummaryPreview(metadata: Record<string, unknown> | null | undefined, formatter: AgentRunTextFormatter = defaultAgentRunTextFormatter) {
    return getAgentRunSummary(metadata)?.findings[0] ?? formatter.noSummaryPreview();
}

export function getAgentRunStats(snapshot: AgentRunSnapshotLike, connectionName?: string | null, formatter: AgentRunTextFormatter = defaultAgentRunTextFormatter) {
    return {
        dataSource: connectionName || snapshot.work.connectionId || formatter.dataSourceNone(),
        tabCount: snapshot.tabs?.length ?? 0,
        sqlExecutionCount: snapshot.sessions?.length ?? 0,
        lastActiveAt: snapshot.work.lastActiveAt ?? snapshot.work.createdAt ?? null,
        statusLabel: formatter.statusLabel(snapshot.work.status),
    };
}

function formatSqlRuns(count: number, formatter: AgentRunTextFormatter) {
    return formatter.sqlRuns(count);
}

function formatTabsCreated(count: number, formatter: AgentRunTextFormatter) {
    return formatter.tabsCreated(count);
}

function formatTabsOnly(count: number, formatter: AgentRunTextFormatter) {
    return formatter.tabs(count);
}

export function getAgentRunOutputLabel(snapshot: AgentRunSnapshotLike, formatter: AgentRunTextFormatter = defaultAgentRunTextFormatter) {
    const tabCount = snapshot.tabs?.length ?? 0;
    const sqlExecutionCount = snapshot.sessions?.length ?? 0;
    const output = `${formatTabsOnly(tabCount, formatter)} · ${formatSqlRuns(sqlExecutionCount, formatter)}`;
    return formatter.outputLabel({ isRunning: snapshot.work.status === 'active', output });
}

export function getAgentRunActivitySummary(snapshot: AgentRunSnapshotLike, events: AgentRunEventLike[] = [], formatter: AgentRunTextFormatter = defaultAgentRunTextFormatter) {
    const tabCount = snapshot.tabs?.length ?? 0;
    const sqlExecutionCount = snapshot.sessions?.length ?? 0;
    const status = snapshot.work.status === 'error' ? 'failed' : snapshot.work.status === 'completed' ? 'completed' : snapshot.work.status === 'archived' ? 'archived' : 'active';
    const durationMs = events.reduce((sum, event) => sum + (numberValue(event.durationMs) ?? 0), 0);
    const duration = durationMs > 0 ? formatDuration(durationMs) : null;
    return formatter.activitySummary({
        sqlRuns: formatSqlRuns(sqlExecutionCount, formatter),
        tabsCreated: formatTabsCreated(tabCount, formatter),
        status: formatter.activityStatus(status),
        duration,
    });
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

function formatRows(rows: number | null | undefined, formatter: AgentRunTextFormatter) {
    if (rows == null) return null;
    return formatter.rows(rows);
}

function formatTabs(tabs: number | null | undefined, formatter: AgentRunTextFormatter) {
    if (tabs == null) return null;
    return formatter.tabs(tabs);
}

function formatDuration(ms: number | null | undefined) {
    if (ms == null || !Number.isFinite(ms)) return null;
    if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
    return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

function tabNameById(snapshot: AgentRunSnapshotLike, formatter: AgentRunTextFormatter) {
    return new Map((snapshot.tabs ?? []).filter(tab => tab.tabId).map(tab => [tab.tabId!, tab.tabName || formatter.fallbackSqlTab()]));
}

function sessionById(snapshot: AgentRunSnapshotLike) {
    return new Map((snapshot.sessions ?? []).filter(item => item.session?.sessionId).map(item => [item.session!.sessionId!, item]));
}

function firstOutputIdentity(output: Record<string, unknown> | null | undefined) {
    const sessionId = stringValue(output?.sessionId);
    const tabId = stringValue(output?.tabId);
    return { sessionId, tabId };
}

function sqlExecutionMeta(session: AgentRunSessionLike | undefined, event: AgentRunEventLike, formatter: AgentRunTextFormatter) {
    const firstSet = session?.queryResultSets?.[0];
    const rows = numberValue(event.outputSummary?.rowCount) ?? firstSet?.rowCount ?? null;
    const duration = event.durationMs ?? session?.session?.durationMs ?? firstSet?.durationMs ?? null;
    return [formatRows(rows, formatter), formatDuration(duration), event.status ?? session?.session?.status ?? null, formatter.resultNotSaved()].filter((item): item is string => Boolean(item));
}

function userWorkspaceSaveMeta(event: AgentRunEventLike, formatter: AgentRunTextFormatter) {
    const changes = stringArrayValue(event.outputSummary?.changeSummary);
    return [...changes, formatTabs(numberValue(event.outputSummary?.tabCount), formatter), event.status ?? null].filter((item): item is string => Boolean(item));
}

function eventTitle(event: AgentRunEventLike, snapshot: AgentRunSnapshotLike, formatter: AgentRunTextFormatter) {
    const tabs = tabNameById(snapshot, formatter);
    const sessions = sessionById(snapshot);
    const { sessionId, tabId } = firstOutputIdentity(event.outputSummary);
    const session = sessionId ? sessions.get(sessionId) : undefined;
    const resolvedTabId = tabId ?? session?.session?.tabId ?? null;
    const tabName = resolvedTabId ? tabs.get(resolvedTabId) : null;
    const actorName = stringValue(event.outputSummary?.actorName) ?? stringValue(event.inputSummary?.actorName);

    switch (event.toolName) {
        case 'dory_create_work':
            return formatter.eventTitle('created');
        case 'dory_finish_work':
            return formatter.eventTitle('finished');
        case 'dory_list_connections':
            return formatter.eventTitle('listedDataSources');
        case 'dory_explore_schema':
        case 'dory_get_schema_graph':
            return formatter.eventTitle('exploredSchema');
        case 'dory_workspace_tabs':
            return tabName ? formatter.eventTitle('updatedWorkspaceTab', { tabName }) : formatter.eventTitle('updatedWorkspaceTabs');
        case 'dory_user_save_workspace':
            return actorName ? formatter.eventTitle('actorSavedWorkspaceChanges', { actorName }) : formatter.eventTitle('savedWorkspaceChanges');
        case 'dory_saved_queries':
            return formatter.eventTitle('managedSavedQueries');
        case 'dory_run_readonly_sql':
            return tabName ? formatter.eventTitle('ranSqlInTab', { tabName }) : formatter.eventTitle('ranSql');
        default:
            return event.toolName ? formatter.eventTitle('ranTool', { toolName: event.toolName }) : formatter.eventTitle('recordedActivity');
    }
}

export function buildAgentRunTimeline(snapshot: AgentRunSnapshotLike, events: AgentRunEventLike[] = [], formatter: AgentRunTextFormatter = defaultAgentRunTextFormatter): AgentRunTimelineItem[] {
    const sessions = sessionById(snapshot);
    const eventItems = events.map((event, index): AgentRunTimelineItem => {
        const { sessionId, tabId } = firstOutputIdentity(event.outputSummary);
        const session = sessionId ? sessions.get(sessionId) : undefined;
        const sqlLength = numberValue(event.inputSummary?.sqlLength) ?? (typeof session?.session?.sqlText === 'string' ? session.session.sqlText.length : null);
        const error = [event.errorCode, event.errorMessage].filter(Boolean).join(': ') || session?.session?.errorMessage || null;
        const meta =
            event.toolName === 'dory_run_readonly_sql'
                ? sqlExecutionMeta(session, event, formatter)
                : event.toolName === 'dory_user_save_workspace'
                  ? userWorkspaceSaveMeta(event, formatter)
                  : [formatDuration(event.durationMs), event.status ?? null].filter((item): item is string => Boolean(item));

        return {
            id: event.eventId || `${event.toolName || 'event'}-${index}`,
            time: event.createdAt,
            title: eventTitle(event, snapshot, formatter),
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

    const tabs = tabNameById(snapshot, formatter);
    return (snapshot.sessions ?? [])
        .map((item, index): AgentRunTimelineItem => {
            const session = item.session;
            const tabName = session?.tabId ? tabs.get(session.tabId) : null;
            const firstSet = item.queryResultSets?.[0];
            return {
                id: session?.sessionId || `session-${index}`,
                time: session?.finishedAt ?? session?.startedAt ?? session?.createdAt,
                title: tabName ? formatter.eventTitle('ranSqlInTab', { tabName }) : formatter.eventTitle('ranSql'),
                meta: [
                    formatRows(firstSet?.rowCount ?? null, formatter),
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

import type { AgentRunTextFormatter } from '@/lib/agent-runs/summary';

type AgentRunsTranslator = (key: string, values?: Record<string, string | number | Date>) => string;

export function createAgentRunTextFormatter(rawT: AgentRunsTranslator): AgentRunTextFormatter {
    const t = rawT as AgentRunsTranslator;

    return {
        statusLabel: status => {
            if (status === 'active') return t('Status.Loading');
            if (status === 'completed') return t('Status.Completed');
            if (status === 'error') return t('Status.Failed');
            if (status === 'archived') return t('Status.Archived');
            return t('Status.Active');
        },
        noSummaryPreview: () => t('Summary.NoPreview'),
        dataSourceNone: () => t('Common.None'),
        sqlRuns: count => t('Counts.SqlRuns', { count }),
        tabsCreated: count => t('Counts.TabsCreated', { count }),
        tabs: count => t('Counts.Tabs', { count }),
        rows: count => t('Counts.Rows', { count }),
        outputLabel: ({ isRunning, output }) => t(isRunning ? 'Output.Running' : 'Output.Generated', { output }),
        activitySummary: ({ sqlRuns, tabsCreated, status, duration }) => t('Activity.Summary', { sqlRuns, tabsCreated, status: duration ? t('Activity.StatusWithDuration', { status, duration }) : status }),
        activityStatus: status => t(`Activity.Status.${status}`),
        activityStatusWithDuration: (status, duration) => t('Activity.StatusWithDuration', { status, duration }),
        eventTitle: (key, values) => t(`Timeline.Titles.${key}`, values),
        fallbackSqlTab: () => t('Timeline.FallbackSqlTab'),
        resultNotSaved: () => t('Timeline.ResultNotSaved'),
    };
}

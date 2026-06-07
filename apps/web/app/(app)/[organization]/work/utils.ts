import type { WorkRunEventType, WorkRunStatus, WorkStatus } from './types';

export function formatRelativeTime(value?: string | Date | null) {
    if (!value) return 'Never';
    const date = value instanceof Date ? value : new Date(value);
    const timestamp = date.getTime();
    if (!Number.isFinite(timestamp)) return 'Unknown';

    const diffSeconds = Math.round((timestamp - Date.now()) / 1000);
    const abs = Math.abs(diffSeconds);
    const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

    if (abs < 60) return formatter.format(diffSeconds, 'second');
    if (abs < 3600) return formatter.format(Math.round(diffSeconds / 60), 'minute');
    if (abs < 86400) return formatter.format(Math.round(diffSeconds / 3600), 'hour');
    return formatter.format(Math.round(diffSeconds / 86400), 'day');
}

export function statusLabel(status: WorkStatus) {
    if (status === 'running') return 'Running';
    if (status === 'completed') return 'Completed';
    return 'Draft';
}

export function statusClassName(status: WorkStatus) {
    if (status === 'running') return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300';
    if (status === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300';
    return 'border-border bg-muted text-muted-foreground';
}

export function runStatusLabel(status: WorkRunStatus) {
    if (status === 'running') return 'Running';
    if (status === 'completed') return 'Completed';
    return 'Failed';
}

export function runStatusClassName(status: WorkRunStatus) {
    if (status === 'running') return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300';
    if (status === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300';
    return 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300';
}

export function eventTypeLabel(type: WorkRunEventType) {
    if (type === 'tool_call') return 'Tool call';
    if (type === 'tool_result') return 'Tool result';
    if (type === 'sql_executed') return 'SQL executed';
    if (type === 'investigation_created') return 'Analysis created';
    if (type === 'investigation_updated') return 'Analysis updated';
    if (type === 'conclusion_updated') return 'Conclusion updated';
    if (type === 'error') return 'Error';
    if (type === 'completed') return 'Completed';
    return 'Message';
}

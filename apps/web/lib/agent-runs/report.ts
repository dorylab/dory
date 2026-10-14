import type { WorkFinding } from '@dory/database/postgres/impl/works';

/** Keep the primary conclusion first without reordering the remaining findings. */
export function orderReportFindings<T extends { isPrimary: boolean }>(findings: T[]): T[] {
    return [...findings.filter(finding => finding.isPrimary), ...findings.filter(finding => !finding.isPrimary)];
}

/** Omit a supporting fact only when it repeats the same named headline metric. */
export function getSupportingFacts(presentation: WorkFinding['presentation']) {
    const normalize = (value: string) => value.replace(/\s+/g, '').toLocaleLowerCase();
    const metricLabel = normalize(presentation?.metricLabel ?? '');
    const metricValue = normalize(`${presentation?.metricValue ?? ''}${presentation?.metricUnit ?? ''}`);
    return (presentation?.facts ?? []).filter(fact => normalize(fact.label) !== metricLabel || normalize(fact.value) !== metricValue);
}

export function getPreviewColumnNames(columns: unknown[], rows: Record<string, unknown>[]) {
    const names = columns.flatMap(column => {
        if (typeof column === 'string') return [column];
        if (column && typeof column === 'object' && 'name' in column && typeof column.name === 'string') return [column.name];
        return [];
    });
    return [...new Set(names.length ? names : rows.flatMap(row => Object.keys(row)))];
}

export function formatPreviewValue(value: unknown): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

export function shouldShowHeadlineMetric(title: string, presentation: WorkFinding['presentation']) {
    if (!presentation?.metricValue) return false;
    const compact = (value: string) => value.replace(/\s+/g, '');
    const metric = compact(`${presentation.metricValue}${presentation.metricUnit ?? ''}`);
    return !compact(title).includes(metric);
}

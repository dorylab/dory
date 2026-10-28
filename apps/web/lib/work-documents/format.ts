import type { WorkEvidence, WorkVisual } from '@dory/shared/types/work-document';

export function reportNumber(value: unknown): number | null {
    if (value == null || typeof value === 'boolean' || (typeof value === 'string' && !value.trim()) || (typeof value !== 'string' && typeof value !== 'number')) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}
export function formatReportMetric(value: unknown, config: NonNullable<WorkVisual['metric']>): string {
    const number = reportNumber(value);
    if (number === null) return value == null || value === '' ? '—' : String(value);
    const format = config.format ?? 'number';
    const formatted = new Intl.NumberFormat('en-US', {
        style: format === 'currency' ? 'currency' : format === 'percent' ? 'percent' : 'decimal',
        ...(format === 'currency' ? { currency: config.currency ?? 'USD' } : {}),
        minimumFractionDigits: config.precision ?? 0,
        maximumFractionDigits: config.precision ?? 2,
    }).format(format === 'percent' && config.percentScale === 'whole' ? number / 100 : number);
    return config.unit ? `${formatted} ${config.unit}` : formatted;
}
export function reportMetrics(visual: WorkVisual, evidence: WorkEvidence) {
    const config = visual.metric!;
    const items = [{ column: config.column, rowIndex: config.rowIndex, label: visual.title }, ...(config.items ?? [])];
    return items.map((cell, index) => {
        const value = evidence.rows[cell.rowIndex]?.[cell.column];
        const base = config.comparison ? reportNumber(evidence.rows[config.comparison.rowIndex]?.[config.comparison.column]) : null;
        const current = reportNumber(value);
        const comparison =
            index === 0 && config.comparison
                ? base === null || base === 0 || current === null
                    ? '—'
                    : new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2, signDisplay: 'exceptZero' }).format((current - base) / Math.abs(base))
                : undefined;
        return { label: cell.label, value: formatReportMetric(value, config), comparison };
    });
}

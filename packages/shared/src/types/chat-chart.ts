/** Presentation only. Query rows and provenance are never editable. */
export type ChartValueFormat = { scale?: number; precision?: number; prefix?: string; suffix?: string };
export type ChartSeries = { key: string; label?: string; color?: string };
export type ChartOptions = {
    stacked?: boolean;
    xKeyType?: 'time' | 'category' | 'number';
    sortBy?: 'x' | 'value';
    sortDirection?: 'asc' | 'desc' | 'none';
    xAxisLabel?: string;
    yAxisLabel?: string;
    valueFormat?: ChartValueFormat;
};
export type ChartPresentation = {
    chartType: 'bar' | 'line' | 'area' | 'pie';
    title?: string;
    description?: string;
    xKey?: string;
    yKeys?: ChartSeries[];
    categoryKey?: string;
    valueKey?: string;
    options?: ChartOptions;
};
export type ChartResultPart = ChartPresentation & {
    type: 'chart';
    data: Record<string, unknown>[];
    source?: { toolCallId?: string; artifactId?: string; rowCount?: number; truncated?: boolean; columns?: string[]; sql?: string; database?: string };
    dataState?: 'ready' | 'empty' | 'missing' | 'invalid-fields' | 'incomplete' | 'duplicate-x';
};
export type ChartOverride = { version: number; presentation: ChartPresentation | null };
export type ChatChartUpdate = { sessionId: string; messageId: string; toolCallId: string; expectedVersion: number; presentation: ChartPresentation | null };

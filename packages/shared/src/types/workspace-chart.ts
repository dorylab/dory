/** Immutable presentation over a query result; no copied result rows. */
export type WorkspaceChartSpec = {
    version: 1;
    chartType: 'bar' | 'line' | 'pie' | 'scatter' | 'histogram' | 'heatmap';
    xKey: string;
    yKey: string;
    groupKey: string;
    chartColorPreset?: 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate';
    filters?: Array<{
        col: string;
        kind: 'string' | 'number' | 'range';
        op: 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'empty' | 'notEmpty' | 'regex' | 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le' | 'range';
        value?: string;
        valueTo?: string;
        rangeValueType?: 'number' | 'date';
        caseSensitive?: boolean;
    }>;
    search?: { text: string; columns?: string[] };
};
export type WorkspaceChart = { id: string; resultSetId: string; title: string; spec: WorkspaceChartSpec };

export const CHART_COLOR_PRESETS: Array<{
    value: NonNullable<WorkspaceChartSpec['chartColorPreset']>;
    label: string;
    colors: {
        light: string[];
        dark: string[];
    };
}> = [
    {
        value: 'blue',
        label: 'Blue',
        colors: {
            light: ['#2563eb', '#1d4ed8', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'],
            dark: ['#60a5fa', '#3b82f6', '#93c5fd', '#1d4ed8', '#2563eb', '#dbeafe'],
        },
    },
    {
        value: 'emerald',
        label: 'Emerald',
        colors: {
            light: ['#059669', '#047857', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0'],
            dark: ['#34d399', '#10b981', '#6ee7b7', '#047857', '#059669', '#d1fae5'],
        },
    },
    {
        value: 'amber',
        label: 'Amber',
        colors: {
            light: ['#d97706', '#b45309', '#f59e0b', '#fbbf24', '#fcd34d', '#fde68a'],
            dark: ['#fbbf24', '#f59e0b', '#fcd34d', '#b45309', '#d97706', '#fef3c7'],
        },
    },
    {
        value: 'rose',
        label: 'Rose',
        colors: {
            light: ['#e11d48', '#be123c', '#f43f5e', '#fb7185', '#fda4af', '#fecdd3'],
            dark: ['#fb7185', '#f43f5e', '#fda4af', '#be123c', '#e11d48', '#ffe4e6'],
        },
    },
    {
        value: 'violet',
        label: 'Violet',
        colors: {
            light: ['#7c3aed', '#6d28d9', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe'],
            dark: ['#a78bfa', '#8b5cf6', '#c4b5fd', '#6d28d9', '#7c3aed', '#ede9fe'],
        },
    },
    {
        value: 'slate',
        label: 'Slate',
        colors: {
            light: ['#334155', '#1e293b', '#475569', '#64748b', '#94a3b8', '#cbd5e1'],
            dark: ['#94a3b8', '#64748b', '#cbd5e1', '#475569', '#334155', '#e2e8f0'],
        },
    },
];

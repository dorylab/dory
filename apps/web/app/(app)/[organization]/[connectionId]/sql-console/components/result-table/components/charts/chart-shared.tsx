'use client';

import React from 'react';
import { BarChart3, Check, ChevronsUpDown } from 'lucide-react';

import { Button } from '@/registry/new-york-v4/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/registry/new-york-v4/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { cn } from '@/registry/new-york-v4/lib/utils';

export type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'histogram' | 'heatmap';
export type ChartColorPreset = 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate';
export type MetricKind = 'count' | 'count_true' | 'sum' | 'avg' | 'max' | 'min' | 'count_distinct';
export type ChartRow = { rowData: Record<string, unknown> };

export type MetricOption = {
    key: string;
    label: string;
    kind: MetricKind;
    column?: string;
};

export type ChartSeries = {
    key: string;
    label: string;
};

export type AggregatedChartData = {
    data: Array<Record<string, unknown>>;
    series: ChartSeries[];
    bucketHint?: string | null;
};

export type ChartState = {
    chartType: ChartType;
    xKey: string;
    yKey: string;
    groupKey: string;
    chartColorPreset?: ChartColorPreset;
};

export const NONE_VALUE = '__none__';
export const ALL_SERIES_KEY = '__value__';
export const CHART_COLOR_PRESETS: Array<{
    value: ChartColorPreset;
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

export function ChartSelect(props: { label: string; value: string; onValueChange: (value: string) => void; options: Array<{ value: string; label: string }>; disabled?: boolean }) {
    const { label, value, onValueChange, options, disabled = false } = props;

    return (
        <div className="flex items-center gap-1">
            <span className="mr-1 text-[11px] font-medium text-muted-foreground/80">{label}</span>
            <Select value={value} onValueChange={onValueChange} disabled={disabled}>
                <SelectTrigger
                    size="control"
                    className="min-w-[104px] justify-between border bg-background/50 text-muted-foreground shadow-none hover:bg-background/70"
                >
                    <SelectValue placeholder={label} />
                </SelectTrigger>
                <SelectContent align="start">
                    {options.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

export function ChartCombobox(props: {
    label: string;
    value: string;
    onValueChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
    disabled?: boolean;
    placeholder?: string;
    searchPlaceholder?: string;
    emptyLabel?: string;
}) {
    const { label, value, onValueChange, options, disabled = false, placeholder, searchPlaceholder = 'Search...', emptyLabel = 'No results.' } = props;
    const [open, setOpen] = React.useState(false);
    const selected = options.find(option => option.value === value) ?? null;
    const displayLabel = selected?.label ?? placeholder ?? label;

    return (
        <div className="flex items-center gap-1">
            <span className="mr-1 text-[11px] font-medium text-muted-foreground/80">{label}</span>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        size="control"
                        disabled={disabled}
                        className="min-w-[104px] justify-between border bg-background/50 text-muted-foreground shadow-none hover:bg-background/70"
                    >
                        <span className="truncate">{displayLabel}</span>
                        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-80" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 p-0">
                    <Command>
                        <CommandInput placeholder={searchPlaceholder} className="h-9 text-xs" />
                        <CommandList className="max-h-64">
                            <CommandEmpty>{emptyLabel}</CommandEmpty>
                            <CommandGroup>
                                {options.map(option => (
                                    <CommandItem
                                        key={option.value}
                                        value={`${option.label} ${option.value}`}
                                        onSelect={() => {
                                            onValueChange(option.value);
                                            setOpen(false);
                                        }}
                                        className="text-xs"
                                    >
                                        <span className="truncate">{option.label}</span>
                                        <Check className={cn('ml-auto h-3.5 w-3.5', value === option.value ? 'opacity-100' : 'opacity-0')} />
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
}

export function ChartEmptyState({ message }: { message: string }) {
    return (
        <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
            <BarChart3 className="h-5 w-5" />
            <div>{message}</div>
        </div>
    );
}

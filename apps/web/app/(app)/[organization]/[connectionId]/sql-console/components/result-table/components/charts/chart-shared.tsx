'use client';

import React from 'react';
import { cn } from '@/registry/new-york-v4/lib/utils';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/registry/new-york-v4/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import type { WorkspaceChartSpec } from '@dory/shared/types/workspace-chart';
import { BarChart3, Check, ChevronsUpDown } from 'lucide-react';

export type ChartType = WorkspaceChartSpec['chartType'];
export type ChartColorPreset = NonNullable<WorkspaceChartSpec['chartColorPreset']>;
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

export type ChartState = Omit<WorkspaceChartSpec, 'version' | 'filters' | 'search'>;

export const NONE_VALUE = '__none__';
export const ALL_SERIES_KEY = '__value__';
export { CHART_COLOR_PRESETS } from '@dory/shared/types/workspace-chart';

export function ChartSelect(props: { label: string; value: string; onValueChange: (value: string) => void; options: Array<{ value: string; label: string }>; disabled?: boolean }) {
    const { label, value, onValueChange, options, disabled = false } = props;

    return (
        <div className="flex shrink-0 items-center gap-1">
            <span className="mr-1 text-[11px] font-medium text-muted-foreground/80">{label}</span>
            <Select value={value} onValueChange={onValueChange} disabled={disabled}>
                <SelectTrigger size="control" className="min-w-[92px] justify-between border bg-background/50 text-muted-foreground shadow-none hover:bg-background/70">
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
        <div className="flex shrink-0 items-center gap-1">
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
                        className="min-w-[96px] justify-between border bg-background/50 text-muted-foreground shadow-none hover:bg-background/70"
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

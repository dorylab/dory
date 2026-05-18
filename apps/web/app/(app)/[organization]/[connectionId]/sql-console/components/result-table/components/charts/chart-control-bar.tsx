'use client';

import React from 'react';
import { Button } from '@/registry/new-york-v4/ui/button';
import { cn } from '@/registry/new-york-v4/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';
import { Switch } from '@/registry/new-york-v4/ui/switch';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/registry/new-york-v4/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import { CircleDotDashed, Copy, Download, EllipsisVertical, FileImage, RotateCcw, Settings2 } from 'lucide-react';

import { ComboboxSubmenu, type ComboboxSubmenuGroup, type ComboboxSubmenuOption } from '@/components/ui/combobox-submenu';
import { ChartCombobox, ChartSelect, type ChartState, type MetricOption, NONE_VALUE } from './chart-shared';

export function ChartControlBar(props: {
    chartState: ChartState;
    chartStateIsAuto: boolean;
    columnNames: string[];
    metricOptions: MetricOption[];
    effectiveXKey: string;
    bucketHint?: string | null;
    chartColorPreset: string;
    chartColorPresetOptions: Array<{ value: string; label: string; preview: string[] }>;
    timelineSliderEnabled: boolean;
    onChartTypeChange: (value: string) => void;
    onXKeyChange: (value: string) => void;
    onYKeyChange: (value: string) => void;
    onGroupKeyChange: (value: string) => void;
    onChartColorPresetChange: (value: string) => void;
    onTimelineSliderEnabledChange: (value: boolean) => void;
    onResetAuto: () => void;
    canExportChart: boolean;
    onExportPng: () => void;
    onCopyPng: () => void;
    onExportSvg: () => void;
}) {
    const {
        chartState,
        chartStateIsAuto,
        columnNames,
        metricOptions,
        effectiveXKey,
        bucketHint,
        chartColorPreset,
        chartColorPresetOptions,
        timelineSliderEnabled,
        onChartTypeChange,
        onXKeyChange,
        onYKeyChange,
        onGroupKeyChange,
        onChartColorPresetChange,
        onTimelineSliderEnabledChange,
        onResetAuto,
        canExportChart,
        onExportPng,
        onCopyPng,
        onExportSvg,
    } = props;

    const supportsTimelineSlider = chartState.chartType === 'line' || chartState.chartType === 'bar' || chartState.chartType === 'histogram';
    const showMetric = chartState.chartType !== 'histogram';
    const showGroup = chartState.chartType === 'bar' || chartState.chartType === 'line' || chartState.chartType === 'heatmap';

    return (
        <div className="@container/chart-control px-3 pb-2 pt-2">
            <div className="flex items-start gap-x-2 gap-y-2">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-2 @[720px]/chart-control:flex-nowrap">
                    <ChartSelect
                        label="Chart"
                        value={chartState.chartType}
                        onValueChange={onChartTypeChange}
                        options={[
                            { value: 'bar', label: 'Bar' },
                            { value: 'line', label: 'Line' },
                            { value: 'pie', label: 'Pie' },
                            { value: 'scatter', label: 'Scatter Plot' },
                            { value: 'histogram', label: 'Histogram' },
                            { value: 'heatmap', label: 'Heatmap' },
                        ]}
                    />
                    <ChartCombobox
                        label="X"
                        value={chartState.xKey}
                        onValueChange={onXKeyChange}
                        options={columnNames.map(columnName => ({ value: columnName, label: columnName }))}
                        disabled={columnNames.length === 0}
                        searchPlaceholder="Search columns..."
                    />
                    {showMetric ? (
                        <MetricComboboxSubmenu
                            value={chartState.yKey}
                            columnNames={columnNames}
                            metricOptions={metricOptions}
                            onValueChange={onYKeyChange}
                            disabled={metricOptions.length === 0}
                        />
                    ) : (
                        <div className="text-[11px] text-muted-foreground">Y = Count</div>
                    )}
                    {showGroup ? (
                        <ChartCombobox
                            label="Group"
                            value={chartState.groupKey}
                            onValueChange={onGroupKeyChange}
                            options={[
                                { value: NONE_VALUE, label: 'None' },
                                ...columnNames.filter(columnName => columnName !== effectiveXKey).map(columnName => ({ value: columnName, label: columnName })),
                            ]}
                            disabled={columnNames.length === 0}
                            searchPlaceholder="Search columns..."
                        />
                    ) : null}
                </div>
                <TooltipProvider delayDuration={150}>
                    <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span
                                    aria-label={bucketHint ? 'Auto-bucketed enabled' : 'Auto-bucketed disabled'}
                                    className={cn(
                                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/45',
                                        bucketHint && 'text-muted-foreground/65',
                                    )}
                                    role="status"
                                >
                                    <CircleDotDashed className="h-3.5 w-3.5" />
                                </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">{bucketHint ?? 'Auto-bucketed disabled'}</TooltipContent>
                        </Tooltip>
                        <Popover>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <PopoverTrigger asChild>
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            aria-label="Chart settings"
                                            className="h-6 w-6 cursor-pointer text-muted-foreground hover:text-foreground"
                                        >
                                            <Settings2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </PopoverTrigger>
                                </TooltipTrigger>
                                <TooltipContent side="top">Settings</TooltipContent>
                            </Tooltip>
                            <PopoverContent align="end" className="w-[300px]">
                                {supportsTimelineSlider ? (
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-0.5">
                                            <p className="text-xs font-medium">Enable timeline slider</p>
                                            <p className="text-[11px] text-muted-foreground">Show DataZoom timeline, Reset Zoom, and Apply Brush Filter.</p>
                                        </div>
                                        <Switch checked={timelineSliderEnabled} onCheckedChange={onTimelineSliderEnabledChange} />
                                    </div>
                                ) : (
                                    <div className="space-y-0.5">
                                        <p className="text-xs font-medium">Timeline slider unavailable</p>
                                        <p className="text-[11px] text-muted-foreground">This chart type does not support DataZoom timeline.</p>
                                    </div>
                                )}
                                <div className="my-3 h-px bg-border" />
                                <div className="space-y-1.5">
                                    <p className="text-xs font-medium">Chart color</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {chartColorPresetOptions.map(option => {
                                            const selected = option.value === chartColorPreset;
                                            return (
                                                <Button
                                                    key={option.value}
                                                    type="button"
                                                    variant={selected ? 'default' : 'outline'}
                                                    className={cn('h-8 justify-start gap-2 px-2 text-xs', !selected && 'bg-background')}
                                                    onClick={() => onChartColorPresetChange(option.value)}
                                                >
                                                    <span className="flex items-center gap-1">
                                                        {option.preview.slice(0, 3).map((color, index) => (
                                                            <span
                                                                key={`${option.value}-${index}`}
                                                                className="h-2.5 w-2.5 rounded-full border border-border/60"
                                                                style={{ backgroundColor: color }}
                                                            />
                                                        ))}
                                                    </span>
                                                    <span className="truncate">{option.label}</span>
                                                </Button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </PopoverContent>
                        </Popover>
                        <DropdownMenu>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            aria-label="More chart actions"
                                            className="h-6 w-6 cursor-pointer text-muted-foreground hover:text-foreground"
                                        >
                                            <EllipsisVertical className="h-3.5 w-3.5" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                </TooltipTrigger>
                                <TooltipContent side="top">More</TooltipContent>
                            </Tooltip>
                            <DropdownMenuContent align="end">
                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                        <Download />
                                        Download
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                        <DropdownMenuItem onSelect={onCopyPng} disabled={!canExportChart}>
                                            <Copy />
                                            Copy PNG
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onSelect={onExportPng} disabled={!canExportChart}>
                                            <FileImage />
                                            PNG
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onSelect={onExportSvg} disabled={!canExportChart}>
                                            <FileImage />
                                            SVG
                                        </DropdownMenuItem>
                                    </DropdownMenuSubContent>
                                </DropdownMenuSub>
                                <DropdownMenuItem onSelect={onResetAuto} disabled={chartStateIsAuto}>
                                    <RotateCcw />
                                    Reset chart
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </TooltipProvider>
            </div>
        </div>
    );
}

function getMetricActionLabel(option: MetricOption) {
    if (option.kind === 'sum') return 'Sum';
    if (option.kind === 'avg') return 'Avg';
    if (option.kind === 'min') return 'Min';
    if (option.kind === 'max') return 'Max';
    if (option.kind === 'count_distinct') return 'Count Distinct';
    if (option.kind === 'count_true') return 'Count True';
    return 'Count';
}

function MetricComboboxSubmenu(props: { value: string; columnNames: string[]; metricOptions: MetricOption[]; onValueChange: (value: string) => void; disabled?: boolean }) {
    const { value, columnNames, metricOptions, onValueChange, disabled = false } = props;
    const standaloneOptions = metricOptions
        .filter(option => !option.column)
        .map<ComboboxSubmenuOption>(option => ({
            value: option.key,
            label: option.label,
            keywords: [option.key, option.label],
        }));

    const groupOptions = columnNames
        .map<ComboboxSubmenuGroup | null>(columnName => {
            const children = metricOptions
                .filter(option => option.column === columnName)
                .map<ComboboxSubmenuOption>(option => ({
                    value: option.key,
                    label: getMetricActionLabel(option),
                    keywords: [option.key, option.label, getMetricActionLabel(option)],
                }));

            if (children.length === 0) {
                return null;
            }

            return {
                value: columnName,
                label: columnName,
                keywords: [columnName],
                children,
            };
        })
        .filter((group): group is ComboboxSubmenuGroup => Boolean(group));

    return (
        <ComboboxSubmenu
            label="Y"
            value={value}
            standaloneOptions={standaloneOptions}
            groupOptions={groupOptions}
            onValueChange={nextValue => onValueChange(nextValue)}
            disabled={disabled}
            triggerPlaceholder="Y"
            searchPlaceholder="Search..."
            leftEmptyText="No matching fields."
            rightEmptyText="No matching fields."
            rightPlaceholderText="Choose a field, then pick aggregation."
        />
    );
}

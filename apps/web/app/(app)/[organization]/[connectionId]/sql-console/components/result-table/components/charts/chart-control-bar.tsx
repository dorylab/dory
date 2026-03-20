'use client';

import React from 'react';
import { Button } from '@/registry/new-york-v4/ui/button';
import { cn } from '@/registry/new-york-v4/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';
import { Switch } from '@/registry/new-york-v4/ui/switch';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import { ChevronRight, ChevronsUpDown, Copy, Download, FileImage, RotateCcw, Settings2 } from 'lucide-react';

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
        <div className="flex items-center justify-between px-3 pb-1.5 pt-2">
            <div className="flex flex-wrap items-center gap-4">
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
            <div className="flex items-center gap-2">
                {bucketHint ? <div className="text-[11px] text-muted-foreground">{bucketHint}</div> : null}
                <TooltipProvider delayDuration={150}>
                    <DropdownMenu>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        aria-label="Download chart"
                                        className="h-7 w-7 cursor-pointer text-muted-foreground hover:text-foreground"
                                        disabled={!canExportChart}
                                    >
                                        <Download className="h-3.5 w-3.5" />
                                    </Button>
                                </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <TooltipContent side="top">Download</TooltipContent>
                        </Tooltip>
                        <DropdownMenuContent align="end">
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
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                aria-label="Reset chart"
                                className="h-7 w-7 cursor-pointer text-muted-foreground hover:text-foreground"
                                onClick={onResetAuto}
                                disabled={chartStateIsAuto}
                            >
                                <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Reset</TooltipContent>
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
                                        className="h-7 w-7 cursor-pointer text-muted-foreground hover:text-foreground"
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
                                                        <span key={`${option.value}-${index}`} className="h-2.5 w-2.5 rounded-full border border-border/60" style={{ backgroundColor: color }} />
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

function MetricComboboxSubmenu(props: {
    value: string;
    columnNames: string[];
    metricOptions: MetricOption[];
    onValueChange: (value: string) => void;
    disabled?: boolean;
}) {
    const { value, columnNames, metricOptions, onValueChange, disabled = false } = props;
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState('');
    const [focusPane, setFocusPane] = React.useState<'left' | 'right'>('left');
    const [leftIndex, setLeftIndex] = React.useState(0);
    const [rightIndex, setRightIndex] = React.useState(0);
    const searchInputRef = React.useRef<HTMLInputElement>(null);
    const leftItemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
    const rightItemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
    const selectedMetric = metricOptions.find(option => option.key === value) ?? null;
    const optionsByColumn = new Map<string, MetricOption[]>();

    for (const option of metricOptions) {
        if (!option.column) continue;
        const previous = optionsByColumn.get(option.column) ?? [];
        previous.push(option);
        optionsByColumn.set(option.column, previous);
    }

    const standaloneOptions = metricOptions.filter(option => !option.column);
    const normalizedQuery = query.trim().toLowerCase();
    const filteredStandaloneOptions = standaloneOptions.filter(option => {
        if (!normalizedQuery) {
            return true;
        }
        return option.label.toLowerCase().includes(normalizedQuery) || option.key.toLowerCase().includes(normalizedQuery);
    });
    const filteredColumns = columnNames.filter(columnName => {
        const columnOptions = optionsByColumn.get(columnName);
        if (!columnOptions || columnOptions.length === 0) {
            return false;
        }
        if (!normalizedQuery) {
            return true;
        }
        if (columnName.toLowerCase().includes(normalizedQuery)) {
            return true;
        }
        return columnOptions.some(option => getMetricActionLabel(option).toLowerCase().includes(normalizedQuery));
    });
    const leftEntries = [
        ...filteredStandaloneOptions.map(option => ({ type: 'standalone' as const, option })),
        ...filteredColumns.map(column => ({ type: 'column' as const, column })),
    ];
    const activeLeftEntry = leftEntries[leftIndex] ?? null;
    const activeColumn = activeLeftEntry?.type === 'column' ? activeLeftEntry.column : null;
    const rightOptions = activeColumn ? (optionsByColumn.get(activeColumn) ?? []) : [];

    React.useEffect(() => {
        if (open) {
            requestAnimationFrame(() => searchInputRef.current?.focus());
            return;
        }
        setQuery('');
        setFocusPane('left');
        setLeftIndex(0);
        setRightIndex(0);
    }, [open]);

    React.useEffect(() => {
        if (!open) return;
        if (leftEntries.length === 0) {
            setLeftIndex(0);
            return;
        }
        setLeftIndex(previous => Math.min(previous, leftEntries.length - 1));
    }, [leftEntries.length, open]);

    React.useEffect(() => {
        if (!open) return;
        setRightIndex(0);
        if (focusPane === 'right' && rightOptions.length === 0) {
            setFocusPane('left');
        }
    }, [activeColumn, focusPane, open, rightOptions.length]);

    React.useEffect(() => {
        if (!open || focusPane !== 'left') return;
        const element = leftItemRefs.current[leftIndex];
        element?.scrollIntoView({ block: 'nearest' });
    }, [focusPane, leftIndex, open]);

    React.useEffect(() => {
        if (!open || focusPane !== 'right') return;
        const element = rightItemRefs.current[rightIndex];
        element?.scrollIntoView({ block: 'nearest' });
    }, [focusPane, open, rightIndex]);

    const selectMetric = React.useCallback(
        (metricKey: string) => {
            onValueChange(metricKey);
            setOpen(false);
        },
        [onValueChange],
    );

    const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (!open) return;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (focusPane === 'left') {
                setLeftIndex(previous => {
                    if (leftEntries.length === 0) return 0;
                    return Math.min(previous + 1, leftEntries.length - 1);
                });
            } else {
                setRightIndex(previous => {
                    if (rightOptions.length === 0) return 0;
                    return Math.min(previous + 1, rightOptions.length - 1);
                });
            }
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (focusPane === 'left') {
                setLeftIndex(previous => Math.max(previous - 1, 0));
            } else {
                setRightIndex(previous => Math.max(previous - 1, 0));
            }
            return;
        }

        if (event.key === 'ArrowRight') {
            if (focusPane === 'left' && activeLeftEntry?.type === 'column' && rightOptions.length > 0) {
                event.preventDefault();
                setFocusPane('right');
                setRightIndex(0);
            }
            return;
        }

        if (event.key === 'ArrowLeft') {
            if (focusPane === 'right') {
                event.preventDefault();
                setFocusPane('left');
            }
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            if (focusPane === 'left') {
                if (activeLeftEntry?.type === 'standalone') {
                    selectMetric(activeLeftEntry.option.key);
                } else if (activeLeftEntry?.type === 'column' && rightOptions.length > 0) {
                    setFocusPane('right');
                    setRightIndex(0);
                }
                return;
            }

            const option = rightOptions[rightIndex];
            if (option) {
                selectMetric(option.key);
            }
        }
    };

    return (
        <div className="flex items-center gap-1">
            <span className="mr-1 text-[11px] font-medium text-muted-foreground/80">Y</span>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        size="control"
                        role="combobox"
                        aria-expanded={open}
                        disabled={disabled}
                        className="min-w-[104px] justify-between border bg-background/50 text-muted-foreground shadow-none hover:bg-background/70"
                    >
                        <span className="truncate">{selectedMetric?.label ?? 'Y'}</span>
                        <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-80" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[360px] p-0">
                    <div className="grid h-64 grid-cols-2 overflow-hidden">
                        <div className="flex min-h-0 flex-col border-r">
                            <div className="border-b p-2">
                                <input
                                    ref={searchInputRef}
                                    value={query}
                                    onChange={event => {
                                        setQuery(event.target.value);
                                        setFocusPane('left');
                                        setLeftIndex(0);
                                    }}
                                    onKeyDown={handleSearchKeyDown}
                                    placeholder="Search..."
                                    className="h-7 w-full rounded-md border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                                />
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto p-1">
                                {filteredStandaloneOptions.map((option, index) => {
                                    const isActive = focusPane === 'left' && leftIndex === index;
                                    return (
                                        <button
                                            key={option.key}
                                            type="button"
                                            ref={element => {
                                                leftItemRefs.current[index] = element;
                                            }}
                                            className={cn(
                                                'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs',
                                                isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent',
                                            )}
                                            onMouseEnter={() => {
                                                setFocusPane('left');
                                                setLeftIndex(index);
                                            }}
                                            onClick={() => selectMetric(option.key)}
                                        >
                                            <span>{option.label}</span>
                                        </button>
                                    );
                                })}
                                {filteredStandaloneOptions.length > 0 && filteredColumns.length > 0 ? <div className="my-1 h-px bg-border" /> : null}
                                {filteredColumns.length === 0 && filteredStandaloneOptions.length === 0 ? (
                                    <div className="px-2 py-3 text-xs text-muted-foreground">No matching fields.</div>
                                ) : (
                                    filteredColumns.map((columnName, index) => {
                                        const entryIndex = filteredStandaloneOptions.length + index;
                                        const isActive = focusPane === 'left' && leftIndex === entryIndex;
                                        return (
                                            <button
                                                key={columnName}
                                                type="button"
                                                ref={element => {
                                                    leftItemRefs.current[entryIndex] = element;
                                                }}
                                                onMouseEnter={() => {
                                                    setFocusPane('left');
                                                    setLeftIndex(entryIndex);
                                                }}
                                                onFocus={() => {
                                                    setFocusPane('left');
                                                    setLeftIndex(entryIndex);
                                                }}
                                                className={cn(
                                                    'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs',
                                                    isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent',
                                                )}
                                            >
                                                <span className="truncate">{columnName}</span>
                                                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                        <div className="min-h-0 overflow-y-auto p-1">
                            {!activeColumn ? (
                                <div className="px-2 py-3 text-xs text-muted-foreground">Choose a field, then pick aggregation.</div>
                            ) : rightOptions.length === 0 ? (
                                <div className="px-2 py-3 text-xs text-muted-foreground">No matching fields.</div>
                            ) : (
                                rightOptions.map((option, index) => (
                                    <button
                                        key={option.key}
                                        type="button"
                                        ref={element => {
                                            rightItemRefs.current[index] = element;
                                        }}
                                        className={cn(
                                            'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent',
                                            option.key === value && 'bg-accent',
                                            focusPane === 'right' && rightIndex === index && 'bg-accent text-accent-foreground',
                                        )}
                                        onMouseEnter={() => {
                                            setFocusPane('right');
                                            setRightIndex(index);
                                        }}
                                        onClick={() => selectMetric(option.key)}
                                    >
                                        <span>{getMetricActionLabel(option)}</span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}

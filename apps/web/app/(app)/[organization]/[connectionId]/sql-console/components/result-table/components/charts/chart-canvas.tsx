'use client';

import React from 'react';
import { Bar, BarChart, Brush, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, Scatter, ScatterChart, XAxis, YAxis } from 'recharts';

import { Button } from '@/registry/new-york-v4/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/registry/new-york-v4/ui/chart';

import { AggregatedChartData, ALL_SERIES_KEY, ChartEmptyState, ChartType, NONE_VALUE } from './chart-shared';

function toFiniteNumber(value: unknown) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value !== 'string') {
        return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

export function ChartCanvas(props: {
    chartType: ChartType;
    chartConfig: ChartConfig;
    aggregated: AggregatedChartData;
    effectiveGroupKey: string;
    chartColors: string[];
    xAxisLabel: string;
    yAxisLabel: string;
    emptyMessage: string | null;
    timelineSliderEnabled: boolean;
    chartRootRef?: React.RefObject<HTMLDivElement | null>;
    onApplyChartFilter: (
        filters: Array<{ col: string; kind: 'exact'; raw: unknown } | { col: string; kind: 'range'; from: string; to: string; valueType: 'number' | 'date'; label: string }>,
        mode?: { append?: boolean },
    ) => void;
}) {
    const { chartType, chartConfig, aggregated, effectiveGroupKey, chartColors, xAxisLabel, yAxisLabel, emptyMessage, timelineSliderEnabled, chartRootRef, onApplyChartFilter } = props;
    const primaryChartColor = chartColors[0] ?? 'var(--primary)';
    const clickFilterEnabled = chartType !== 'line';
    const supportsTimeline = chartType === 'line' || chartType === 'bar' || chartType === 'histogram';
    const [brushSelection, setBrushSelection] = React.useState<{ startIndex: number; endIndex: number } | null>(null);
    const lastBrushIndex = Math.max(aggregated.data.length - 1, 0);
    const controlledBrushSelection = brushSelection ?? { startIndex: 0, endIndex: lastBrushIndex };
    const isZoomed = brushSelection != null;

    const histogramData = React.useMemo(
        () =>
            aggregated.data.map(datum => {
                const total = aggregated.series.reduce((sum, series) => sum + (toFiniteNumber(datum[series.key]) ?? 0), 0);
                return {
                    ...datum,
                    __histValue: total,
                };
            }),
        [aggregated.data, aggregated.series],
    );

    const pieData = React.useMemo(
        () =>
            aggregated.data
                .map(datum => {
                    const total = aggregated.series.reduce((sum, series) => sum + (toFiniteNumber(datum[series.key]) ?? 0), 0);
                    return {
                        ...datum,
                        __pieValue: total,
                    };
                })
                .filter(datum => (toFiniteNumber(datum.__pieValue) ?? 0) > 0),
        [aggregated.data, aggregated.series],
    );

    const scatterData = React.useMemo(
        () =>
            aggregated.data
                .map((datum, index) => {
                    const yValue = aggregated.series.reduce((sum, series) => sum + (toFiniteNumber(datum[series.key]) ?? 0), 0);
                    const xValue = String(datum.xLabel ?? index);
                    return {
                        ...datum,
                        xValue,
                        yValue,
                    };
                })
                .filter(datum => (toFiniteNumber(datum.yValue) ?? 0) > 0),
        [aggregated.data, aggregated.series],
    );

    const heatmapStats = React.useMemo(() => {
        const values: number[] = [];
        for (const datum of aggregated.data) {
            for (const series of aggregated.series) {
                const value = toFiniteNumber(datum[series.key]);
                if (value != null) {
                    values.push(value);
                }
            }
        }

        if (values.length === 0) {
            return null;
        }

        return {
            min: Math.min(...values),
            max: Math.max(...values),
        };
    }, [aggregated.data, aggregated.series]);

    React.useEffect(() => {
        if (!timelineSliderEnabled || !supportsTimeline) {
            setBrushSelection(null);
        }
    }, [supportsTimeline, timelineSliderEnabled]);

    React.useEffect(() => {
        if (!brushSelection) {
            return;
        }
        const lastIndex = aggregated.data.length - 1;
        if (lastIndex <= 0) {
            setBrushSelection(null);
            return;
        }
        if (brushSelection.startIndex > lastIndex || brushSelection.endIndex > lastIndex) {
            setBrushSelection({
                startIndex: Math.min(brushSelection.startIndex, lastIndex),
                endIndex: Math.min(brushSelection.endIndex, lastIndex),
            });
        }
    }, [aggregated.data.length, brushSelection]);

    const handleDatumClick = React.useCallback(
        (datum: Record<string, unknown> | undefined, seriesKey: string, seriesLabel: string, append = false) => {
            if (!clickFilterEnabled) {
                return;
            }

            if (!datum) {
                return;
            }

            const filters = [];
            const xFilter = datum.__xFilter as
                | { col: string; kind: 'exact'; raw: unknown }
                | { col: string; kind: 'range'; from: string; to: string; valueType: 'number' | 'date'; label: string }
                | undefined;

            if (xFilter) {
                filters.push(xFilter);
            }

            if (effectiveGroupKey !== NONE_VALUE && seriesKey !== ALL_SERIES_KEY && seriesLabel !== 'Others') {
                filters.push({
                    col: effectiveGroupKey,
                    kind: 'exact' as const,
                    raw: seriesLabel,
                });
            }

            if (filters.length > 0) {
                onApplyChartFilter(filters, { append });
            }
        },
        [clickFilterEnabled, effectiveGroupKey, onApplyChartFilter],
    );

    const handleBrushChange = React.useCallback(
        (selection: { startIndex?: number; endIndex?: number } | undefined) => {
            const startIndex = selection?.startIndex;
            const endIndex = selection?.endIndex;
            if (startIndex == null || endIndex == null || endIndex <= startIndex) {
                setBrushSelection(null);
                return;
            }
            if (startIndex <= 0 && endIndex >= lastBrushIndex) {
                setBrushSelection(null);
                return;
            }
            setBrushSelection({ startIndex, endIndex });
        },
        [lastBrushIndex],
    );

    const brushFilter = React.useMemo(() => {
        if (!brushSelection) {
            return null;
        }

        const startDatum = aggregated.data[brushSelection.startIndex] as Record<string, unknown> | undefined;
        const endDatum = aggregated.data[brushSelection.endIndex] as Record<string, unknown> | undefined;
        const startFilter = startDatum?.__xBrushFilter as
            | { col: string; kind: 'range'; from: string; to: string; valueType: 'number' | 'date'; label: string }
            | undefined;
        const endFilter = endDatum?.__xBrushFilter as
            | { col: string; kind: 'range'; from: string; to: string; valueType: 'number' | 'date'; label: string }
            | undefined;

        if (!startFilter || !endFilter || startFilter.col !== endFilter.col || startFilter.valueType !== endFilter.valueType) {
            return null;
        }

        return {
            col: startFilter.col,
            kind: 'range' as const,
            from: startFilter.from,
            to: endFilter.to,
            valueType: startFilter.valueType,
            label: `${startFilter.label} -> ${endFilter.label}`,
        };
    }, [aggregated.data, brushSelection]);

    return (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
            {emptyMessage ? (
                <ChartEmptyState message={emptyMessage} />
            ) : (
                <div ref={chartRootRef} className="flex h-full min-h-[220px] w-full flex-col">
                    {timelineSliderEnabled && supportsTimeline ? (
                        <div className="flex items-center justify-between gap-2 pb-1">
                            <span className="text-[11px] text-muted-foreground">DataZoom timeline</span>
                            <div className="flex gap-2">
                                <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setBrushSelection(null)} disabled={!isZoomed}>
                                    Reset Zoom
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-[11px]"
                                    onClick={() => {
                                        if (!brushFilter) {
                                            return;
                                        }
                                        onApplyChartFilter([brushFilter]);
                                    }}
                                    disabled={!brushFilter}
                                >
                                    Apply Brush Filter
                                </Button>
                            </div>
                        </div>
                    ) : null}
                    {clickFilterEnabled ? <div className="pb-1 text-right text-[11px] text-muted-foreground">Click chart to filter</div> : null}
                    {chartType === 'line' ? (
                        <ChartContainer config={chartConfig} className="aspect-auto h-full w-full overflow-hidden">
                            <LineChart accessibilityLayer data={aggregated.data} margin={{ left: 8, right: 8, top: 8 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis
                                    dataKey="xLabel"
                                    tickLine={false}
                                    axisLine={false}
                                    tickMargin={10}
                                    minTickGap={24}
                                    tickFormatter={value => String(value).slice(0, 18)}
                                />
                                <YAxis tickLine={false} axisLine={false} width={56} />
                                <ChartTooltip content={<ChartFilterTooltipContent filterEnabled={clickFilterEnabled} chartConfig={chartConfig} xAxisLabel={xAxisLabel} yAxisLabel={yAxisLabel} />} />
                                {aggregated.series.map(series => (
                                    <Line
                                        key={series.key}
                                        type="monotone"
                                        dataKey={series.key}
                                        stroke={`var(--color-${series.key})`}
                                        strokeWidth={2}
                                        dot={dotProps => (
                                            <circle
                                                cx={dotProps.cx}
                                                cy={dotProps.cy}
                                                r={3}
                                                fill={`var(--color-${series.key})`}
                                                stroke="transparent"
                                                className={clickFilterEnabled ? 'cursor-pointer' : undefined}
                                                onClick={
                                                    clickFilterEnabled
                                                        ? event =>
                                                              handleDatumClick(
                                                                  dotProps.payload as Record<string, unknown>,
                                                                  series.key,
                                                                  series.label,
                                                                  event.shiftKey,
                                                              )
                                                        : undefined
                                                }
                                            />
                                        )}
                                    />
                                ))}
                                {timelineSliderEnabled ? (
                                    <Brush
                                        dataKey="xLabel"
                                        height={18}
                                        travellerWidth={8}
                                        onChange={handleBrushChange}
                                        startIndex={controlledBrushSelection.startIndex}
                                        endIndex={controlledBrushSelection.endIndex}
                                    />
                                ) : null}
                            </LineChart>
                        </ChartContainer>
                    ) : null}
                    {chartType === 'bar' ? (
                        <ChartContainer config={chartConfig} className="aspect-auto h-full w-full overflow-hidden">
                            <BarChart accessibilityLayer data={aggregated.data} margin={{ left: 8, right: 8, top: 8 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis
                                    dataKey="xLabel"
                                    tickLine={false}
                                    axisLine={false}
                                    tickMargin={10}
                                    minTickGap={24}
                                    tickFormatter={value => String(value).slice(0, 18)}
                                />
                                <YAxis tickLine={false} axisLine={false} width={56} />
                                <ChartTooltip cursor={false} content={<ChartFilterTooltipContent filterEnabled={clickFilterEnabled} chartConfig={chartConfig} xAxisLabel={xAxisLabel} yAxisLabel={yAxisLabel} />} />
                                {aggregated.series.map(series => (
                                    <Bar
                                        key={series.key}
                                        dataKey={series.key}
                                        fill={`var(--color-${series.key})`}
                                        radius={4}
                                        stackId={effectiveGroupKey === NONE_VALUE ? undefined : 'group'}
                                        className="cursor-pointer"
                                        onClick={(data, _index, event) =>
                                            handleDatumClick(
                                                data?.payload as Record<string, unknown>,
                                                series.key,
                                                series.label,
                                                Boolean((event as React.MouseEvent<SVGPathElement> | undefined)?.shiftKey),
                                            )
                                        }
                                    />
                                ))}
                                {timelineSliderEnabled ? (
                                    <Brush
                                        dataKey="xLabel"
                                        height={18}
                                        travellerWidth={8}
                                        onChange={handleBrushChange}
                                        startIndex={controlledBrushSelection.startIndex}
                                        endIndex={controlledBrushSelection.endIndex}
                                    />
                                ) : null}
                            </BarChart>
                        </ChartContainer>
                    ) : null}
                    {chartType === 'histogram' ? (
                        <ChartContainer config={chartConfig} className="aspect-auto h-full w-full overflow-hidden">
                            <BarChart accessibilityLayer data={histogramData} margin={{ left: 8, right: 8, top: 8 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis
                                    dataKey="xLabel"
                                    tickLine={false}
                                    axisLine={false}
                                    tickMargin={10}
                                    minTickGap={24}
                                    tickFormatter={value => String(value).slice(0, 18)}
                                />
                                <YAxis tickLine={false} axisLine={false} width={56} />
                                <ChartTooltip cursor={false} content={<ChartFilterTooltipContent filterEnabled={clickFilterEnabled} chartConfig={chartConfig} xAxisLabel={xAxisLabel} yAxisLabel={yAxisLabel} />} />
                                <Bar
                                    dataKey="__histValue"
                                    fill={primaryChartColor}
                                    radius={4}
                                    className="cursor-pointer"
                                    onClick={(data, _index, event) =>
                                        handleDatumClick(
                                            data?.payload as Record<string, unknown>,
                                            ALL_SERIES_KEY,
                                            'Value',
                                            Boolean((event as React.MouseEvent<SVGPathElement> | undefined)?.shiftKey),
                                        )
                                    }
                                />
                                {timelineSliderEnabled ? (
                                    <Brush
                                        dataKey="xLabel"
                                        height={18}
                                        travellerWidth={8}
                                        onChange={handleBrushChange}
                                        startIndex={controlledBrushSelection.startIndex}
                                        endIndex={controlledBrushSelection.endIndex}
                                    />
                                ) : null}
                            </BarChart>
                        </ChartContainer>
                    ) : null}
                    {chartType === 'pie' ? (
                        <ChartContainer config={chartConfig} className="aspect-auto h-full w-full overflow-hidden">
                            <PieChart accessibilityLayer margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                                <ChartTooltip
                                    cursor={false}
                                    content={<ChartFilterTooltipContent filterEnabled={clickFilterEnabled} chartConfig={chartConfig} xAxisLabel={xAxisLabel} yAxisLabel={yAxisLabel} hideLabel />}
                                />
                                <Pie
                                    data={pieData}
                                    dataKey="__pieValue"
                                    nameKey="xLabel"
                                    cx="50%"
                                    cy="50%"
                                    outerRadius="75%"
                                    className="cursor-pointer"
                                    onClick={(data, _index, event) =>
                                        handleDatumClick(
                                            data?.payload as Record<string, unknown>,
                                            ALL_SERIES_KEY,
                                            String(data?.payload?.xLabel ?? 'Value'),
                                            Boolean((event as React.MouseEvent<SVGElement> | undefined)?.shiftKey),
                                        )
                                    }
                                >
                                    {pieData.map((datum, index) => (
                                        <Cell key={`${String((datum as Record<string, unknown>).xLabel ?? index)}`} fill={chartColors[index % chartColors.length] ?? primaryChartColor} />
                                    ))}
                                </Pie>
                            </PieChart>
                        </ChartContainer>
                    ) : null}
                    {chartType === 'scatter' ? (
                        <ChartContainer config={chartConfig} className="aspect-auto h-full w-full overflow-hidden">
                            <ScatterChart accessibilityLayer data={scatterData} margin={{ left: 8, right: 8, top: 8 }}>
                                <CartesianGrid />
                                <XAxis type="category" dataKey="xValue" tickLine={false} axisLine={false} tickMargin={10} tickFormatter={value => String(value).slice(0, 18)} />
                                <YAxis type="number" dataKey="yValue" tickLine={false} axisLine={false} width={56} />
                                <ChartTooltip content={<ScatterTooltipContent yAxisLabel={yAxisLabel} />} />
                                <Scatter
                                    data={scatterData}
                                    fill={primaryChartColor}
                                    className="cursor-pointer"
                                    onClick={(data, _index, event) =>
                                        handleDatumClick(
                                            ((data as { payload?: Record<string, unknown> } | undefined)?.payload ?? (data as Record<string, unknown> | undefined)),
                                            ALL_SERIES_KEY,
                                            'Value',
                                            Boolean((event as React.MouseEvent<SVGElement> | undefined)?.shiftKey),
                                        )
                                    }
                                />
                            </ScatterChart>
                        </ChartContainer>
                    ) : null}
                    {chartType === 'heatmap' ? (
                        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border/50 bg-background/60 p-3">
                            <div className="grid min-w-max gap-1" style={{ gridTemplateColumns: `minmax(130px, 180px) repeat(${aggregated.series.length}, minmax(72px, 1fr))` }}>
                                <div className="sticky left-0 z-10 bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground">X</div>
                                {aggregated.series.map(series => (
                                    <div key={series.key} className="px-2 py-1 text-center text-[11px] font-medium text-muted-foreground" title={series.label}>
                                        <span className="block truncate">{series.label}</span>
                                    </div>
                                ))}
                                {aggregated.data.map((datum, rowIndex) => (
                                    <React.Fragment key={`${String(datum.xLabel)}-${rowIndex}`}>
                                        <div className="sticky left-0 z-10 truncate bg-background px-2 py-1 text-[11px] text-foreground" title={String(datum.xLabel)}>
                                            {String(datum.xLabel)}
                                        </div>
                                        {aggregated.series.map(series => {
                                            const value = toFiniteNumber(datum[series.key]) ?? 0;
                                            const min = heatmapStats?.min ?? 0;
                                            const max = heatmapStats?.max ?? 0;
                                            const ratio = max > min ? (value - min) / (max - min) : value > 0 ? 1 : 0;
                                            const alpha = 0.15 + ratio * 0.75;

                                            return (
                                                <button
                                                    key={`${String(datum.xLabel)}-${series.key}`}
                                                    type="button"
                                                    className="h-8 rounded-sm border border-border/40 text-[11px] tabular-nums text-foreground"
                                                    style={{ backgroundColor: `color-mix(in oklab, ${primaryChartColor} ${Math.round(alpha * 100)}%, transparent)` }}
                                                    onClick={event =>
                                                        handleDatumClick(
                                                            datum as Record<string, unknown>,
                                                            series.key,
                                                            series.label,
                                                            event.shiftKey,
                                                        )
                                                    }
                                                    title={`${series.label}: ${value.toLocaleString()}`}
                                                >
                                                    {value.toLocaleString()}
                                                </button>
                                            );
                                        })}
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}

function ScatterTooltipContent(props: React.ComponentProps<typeof ChartTooltipContent> & { yAxisLabel: string }) {
    const { active, payload, yAxisLabel } = props;
    if (!active || !payload?.length) {
        return null;
    }

    const point = ((payload[0] as { payload?: Record<string, unknown> } | undefined)?.payload ?? null) as Record<string, unknown> | null;
    if (!point) {
        return null;
    }

    const x = String(point.xValue ?? '');
    const y = toFiniteNumber(point.yValue) ?? 0;

    return (
        <div className="grid min-w-[10rem] gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
            <div className="font-medium">{x}</div>
            <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{yAxisLabel}</span>
                <span className="text-foreground font-mono font-medium tabular-nums">{y.toLocaleString()}</span>
            </div>
        </div>
    );
}

function ChartFilterTooltipContent(props: React.ComponentProps<typeof ChartTooltipContent> & { filterEnabled?: boolean; chartConfig: ChartConfig; xAxisLabel: string; yAxisLabel: string }) {
    const { filterEnabled, chartConfig, xAxisLabel, yAxisLabel } = props;
    if (!props.active || !props.payload?.length) {
        return null;
    }

    return (
        <ChartTooltipContent
            {...props}
            className="min-w-[9rem]"
            formatter={(value, name, item, index) => {
                const dataKey = String((item as { dataKey?: string | number } | undefined)?.dataKey ?? name);
                const seriesLabel =
                    dataKey === 'xValue'
                        ? xAxisLabel
                        : dataKey === 'yValue' || dataKey === '__histValue' || dataKey === '__pieValue'
                          ? yAxisLabel
                          : (chartConfig[dataKey]?.label ?? name);
                const defaultRow = (
                    <>
                        <div className="flex items-center gap-2">
                            <div
                                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                                style={{
                                    backgroundColor: item.color ?? item.payload?.fill ?? 'currentColor',
                                }}
                            />
                            <span className="text-muted-foreground">{seriesLabel}</span>
                        </div>
                        <span className="text-foreground font-mono font-medium tabular-nums">{typeof value === 'number' ? value.toLocaleString() : String(value)}</span>
                    </>
                );

                const isLast = index === (props.payload?.length ?? 1) - 1;
                if (!isLast || !filterEnabled) {
                    return defaultRow;
                }

                return defaultRow;
            }}
        />
    );
}

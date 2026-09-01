'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from 'next-themes';

import {
    aggregateAutoChart,
    buildResultAutoChartProfile,
    getAutoChartEmptyReason,
    getResultAutoChartColumnNames,
    getResultAutoChartColumnType,
    RESULT_AUTO_CHART_NONE_VALUE,
    type ResultAutoChartFilterSpec,
    type ResultAutoChartState,
} from '@dory/analysis/core/result-chart-profile';
import type { ResultSetStatsV1 } from '@/lib/client/type';
import { cn } from '@/registry/new-york-v4/lib/utils';
import { type ChartConfig } from '@/registry/new-york-v4/ui/chart';

import { buildEqualsFilterFromCell } from '../../vtable/filter';
import { type ColumnFilter } from '../../vtable/type';
import { ChartView } from './chart-view';
import {
    type AggregatedChartData,
    ALL_SERIES_KEY,
    CHART_COLOR_PRESETS,
    type ChartColorPreset,
    type ChartRow,
    type ChartState,
    type MetricOption,
    NONE_VALUE,
} from './chart-shared';

type ChartsProps = {
    rows: ChartRow[];
    columnsRaw?: unknown;
    resultStats?: ResultSetStatsV1 | null;
    remoteSource?: {
        cacheKey: string;
        readChart: (state: ChartState, signal?: AbortSignal) => Promise<AggregatedChartData>;
    } | null;
    className?: string;
    onApplyFilters?: (filters: ColumnFilter[], options?: { append?: boolean }) => void;
    onResetState?: () => void;
    stateKey?: string;
    initialState?: Partial<ChartState>;
    onStateChange?: (state: ChartState) => void;
    stateSyncEnabled?: boolean;
    onSaveArtifact?: (state: ChartState) => void;
    saveArtifactLabel?: string;
    saveArtifactPending?: boolean;
    saveArtifactDisabled?: boolean;
    saveArtifactPlacement?: 'menu' | 'inline';
};

type ChartApplyMode = {
    append?: boolean;
};

function toUiChartType(chartType: ResultAutoChartState['chartType']): ChartState['chartType'] {
    return chartType;
}

function toEngineChartType(chartType: ChartState['chartType']): ResultAutoChartState['chartType'] {
    return chartType;
}

function toUiState(state: ResultAutoChartState, colorPreset?: ChartColorPreset): ChartState {
    return {
        chartType: toUiChartType(state.chartType),
        xKey: state.xKey,
        yKey: state.yKey,
        groupKey: state.groupKey === RESULT_AUTO_CHART_NONE_VALUE ? NONE_VALUE : state.groupKey,
        chartColorPreset: colorPreset,
    };
}

function toEngineState(state: ChartState): ResultAutoChartState {
    return {
        chartType: toEngineChartType(state.chartType),
        xKey: state.xKey,
        yKey: state.yKey,
        groupKey: state.groupKey === NONE_VALUE ? RESULT_AUTO_CHART_NONE_VALUE : state.groupKey,
    };
}

function mergeChartState(suggestedState: ChartState, initialState?: Partial<ChartState>): ChartState {
    return {
        chartType: initialState?.chartType ?? suggestedState.chartType,
        xKey: initialState?.xKey ?? suggestedState.xKey,
        yKey: initialState?.yKey ?? suggestedState.yKey,
        groupKey: initialState?.groupKey ?? suggestedState.groupKey,
        chartColorPreset: initialState?.chartColorPreset ?? 'blue',
    };
}

function isMetricKeyCompatibleWithColumns(metricKey: string, columnNames: string[]) {
    if (metricKey === 'count') {
        return true;
    }

    const separatorIndex = metricKey.indexOf(':');
    if (separatorIndex < 0) {
        return true;
    }

    const column = metricKey.slice(separatorIndex + 1);
    return column ? columnNames.includes(column) : true;
}

export function Charts({
    rows,
    columnsRaw,
    resultStats,
    remoteSource,
    className,
    onApplyFilters,
    onResetState,
    stateKey,
    initialState,
    onStateChange,
    stateSyncEnabled = true,
    onSaveArtifact,
    saveArtifactLabel,
    saveArtifactPending,
    saveArtifactDisabled,
    saveArtifactPlacement,
}: ChartsProps) {
    const { resolvedTheme } = useTheme();
    const autoChartProfile = useMemo(() => {
        if (resultStats?.autoChartProfile) {
            return resultStats.autoChartProfile;
        }

        return buildResultAutoChartProfile({
            rows,
            columns: columnsRaw,
            stats: resultStats,
        });
    }, [columnsRaw, resultStats, rows]);
    const columnNames = useMemo(() => {
        if (autoChartProfile.columnNames.length) return autoChartProfile.columnNames;
        return getResultAutoChartColumnNames(columnsRaw, rows);
    }, [autoChartProfile.columnNames, columnsRaw, rows]);
    const suggestedState = useMemo(() => toUiState(autoChartProfile.chartState), [autoChartProfile.chartState]);
    const mergedInitialState = useMemo(() => mergeChartState(suggestedState, initialState), [initialState, suggestedState]);
    const hasPersistedState = Boolean(initialState && (initialState.xKey || initialState.yKey || initialState.groupKey || initialState.chartType));
    const lastAppliedStateKeyRef = React.useRef<string | undefined>(stateKey);
    const previousStateKeyRef = React.useRef<string | undefined>(stateKey);
    const skipNextStateEmitRef = React.useRef(false);

    const [chartType, setChartType] = useState<ChartState['chartType']>(() => mergedInitialState.chartType);
    const [xKey, setXKey] = useState(() => mergedInitialState.xKey);
    const [yKey, setYKey] = useState(() => mergedInitialState.yKey);
    const [groupKey, setGroupKey] = useState(() => mergedInitialState.groupKey);
    const [timelineSliderEnabled, setTimelineSliderEnabled] = useState(false);
    const [chartColorPreset, setChartColorPreset] = useState<ChartColorPreset>(() => (mergedInitialState.chartColorPreset as ChartColorPreset | undefined) ?? 'blue');

    const metricOptions = autoChartProfile.metricOptions as MetricOption[];
    const selectedMetric = useMemo(() => metricOptions.find(option => option.key === yKey) ?? metricOptions[0] ?? null, [metricOptions, yKey]);

    const effectiveXKey = columnNames.includes(xKey) ? xKey : suggestedState.xKey;
    const effectiveGroupKey = groupKey !== NONE_VALUE && columnNames.includes(groupKey) ? groupKey : NONE_VALUE;

    useEffect(() => {
        if (previousStateKeyRef.current !== stateKey) {
            skipNextStateEmitRef.current = true;
            previousStateKeyRef.current = stateKey;
        }
    }, [stateKey]);

    useEffect(() => {
        if (lastAppliedStateKeyRef.current === stateKey) {
            return;
        }

        lastAppliedStateKeyRef.current = stateKey;
        setChartType(mergedInitialState.chartType);
        setXKey(mergedInitialState.xKey);
        setYKey(mergedInitialState.yKey);
        setGroupKey(mergedInitialState.groupKey);
        setChartColorPreset((mergedInitialState.chartColorPreset as ChartColorPreset | undefined) ?? 'blue');
        setTimelineSliderEnabled(false);
    }, [mergedInitialState.chartColorPreset, mergedInitialState.chartType, mergedInitialState.groupKey, mergedInitialState.xKey, mergedInitialState.yKey, stateKey]);

    useEffect(() => {
        if (!stateSyncEnabled || hasPersistedState) {
            return;
        }
        if (columnNames.length === 0) {
            return;
        }
        if (!columnNames.includes(xKey)) {
            setXKey(suggestedState.xKey);
        }
    }, [columnNames, hasPersistedState, stateSyncEnabled, suggestedState.xKey, xKey]);

    useEffect(() => {
        if (!stateSyncEnabled || hasPersistedState) {
            return;
        }
        if (columnNames.length === 0) {
            return;
        }
        if (!isMetricKeyCompatibleWithColumns(yKey, columnNames)) {
            setYKey(suggestedState.yKey);
        }
    }, [columnNames, hasPersistedState, stateSyncEnabled, suggestedState.yKey, yKey]);

    useEffect(() => {
        if (!stateSyncEnabled || hasPersistedState) {
            return;
        }
        if (columnNames.length === 0) {
            return;
        }
        if (groupKey !== NONE_VALUE && !columnNames.includes(groupKey)) {
            setGroupKey(suggestedState.groupKey);
        }
    }, [columnNames, groupKey, hasPersistedState, stateSyncEnabled, suggestedState.groupKey]);

    useEffect(() => {
        if (!stateSyncEnabled) {
            return;
        }
        if (skipNextStateEmitRef.current) {
            skipNextStateEmitRef.current = false;
            return;
        }
        onStateChange?.({
            chartType,
            xKey,
            yKey,
            groupKey,
            chartColorPreset,
        });
    }, [chartColorPreset, chartType, groupKey, onStateChange, stateSyncEnabled, xKey, yKey]);

    const chartStateIsAuto = chartType === suggestedState.chartType && xKey === suggestedState.xKey && yKey === suggestedState.yKey && groupKey === suggestedState.groupKey;

    const localAggregated = useMemo<AggregatedChartData>(() => {
        if (!effectiveXKey || !selectedMetric) {
            return { data: [], series: [], bucketHint: null };
        }

        return aggregateAutoChart({
            rows,
            profile: {
                chartState: autoChartProfile.chartState,
                columnProfiles: autoChartProfile.columnProfiles,
                metricOptions: autoChartProfile.metricOptions,
            },
            overrides: toEngineState({
                chartType,
                xKey: effectiveXKey,
                yKey,
                groupKey: effectiveGroupKey,
            }),
        }) as AggregatedChartData;
    }, [autoChartProfile.chartState, autoChartProfile.columnProfiles, autoChartProfile.metricOptions, chartType, effectiveGroupKey, effectiveXKey, rows, selectedMetric, yKey]);
    const [remoteAggregated, setRemoteAggregated] = useState<AggregatedChartData | null>(null);

    useEffect(() => {
        if (!remoteSource || !effectiveXKey || !selectedMetric) {
            setRemoteAggregated(null);
            return;
        }

        const controller = new AbortController();
        setRemoteAggregated(null);
        remoteSource
            .readChart(
                {
                    chartType,
                    xKey: effectiveXKey,
                    yKey,
                    groupKey: effectiveGroupKey,
                    chartColorPreset,
                },
                controller.signal,
            )
            .then(next => {
                if (!controller.signal.aborted) {
                    setRemoteAggregated(next);
                }
            })
            .catch(error => {
                if (!controller.signal.aborted) {
                    console.warn('[Charts] remote chart read failed', error);
                    setRemoteAggregated({ data: [], series: [], bucketHint: null });
                }
            });

        return () => {
            controller.abort();
        };
    }, [chartColorPreset, chartType, effectiveGroupKey, effectiveXKey, remoteSource, remoteSource?.cacheKey, selectedMetric, yKey]);

    const aggregated = remoteSource ? (remoteAggregated ?? { data: [], series: [], bucketHint: null }) : localAggregated;

    const activeColorPreset = useMemo(() => CHART_COLOR_PRESETS.find(preset => preset.value === chartColorPreset) ?? CHART_COLOR_PRESETS[0], [chartColorPreset]);
    const chartColors = useMemo(() => {
        const isDark = resolvedTheme === 'dark';
        return isDark ? activeColorPreset.colors.dark : activeColorPreset.colors.light;
    }, [activeColorPreset, resolvedTheme]);

    const chartConfig = useMemo<ChartConfig>(() => {
        const config: ChartConfig = {};

        aggregated.series.forEach((series, index) => {
            config[series.key] = {
                label: series.label === ALL_SERIES_KEY ? (selectedMetric?.label ?? 'Value') : series.label,
                color: chartColors[index % chartColors.length],
            };
        });

        return config;
    }, [aggregated.series, chartColors, selectedMetric]);

    const pickFallbackGroupKey = React.useCallback(
        (nextXKey: string) => {
            const category = autoChartProfile.columnProfiles.find(profile => profile.kind === 'category' && profile.name !== nextXKey);
            if (category) {
                return category.name;
            }

            const fallback = columnNames.find(columnName => columnName !== nextXKey);
            return fallback ?? NONE_VALUE;
        },
        [autoChartProfile.columnProfiles, columnNames],
    );

    const handleChartFilter = (filters: ResultAutoChartFilterSpec[], mode?: ChartApplyMode) => {
        if (!onApplyFilters) {
            return;
        }

        const nextFilters: ColumnFilter[] = [];
        for (const filter of filters) {
            if (filter.kind === 'exact') {
                nextFilters.push(
                    buildEqualsFilterFromCell({
                        colName: filter.col,
                        colType: getResultAutoChartColumnType(columnsRaw, filter.col),
                        raw: filter.raw,
                    }),
                );
                continue;
            }

            nextFilters.push({
                col: filter.col,
                kind: 'range',
                op: 'range',
                value: filter.from,
                valueTo: filter.to,
                rangeValueType: filter.valueType,
                label: filter.label,
                caseSensitive: false,
            });
        }

        if (nextFilters.length > 0) {
            onApplyFilters(nextFilters, mode);
        }
    };

    const hasRenderableData = aggregated.data.length > 0 && aggregated.series.length > 0;
    const emptyMessage = getAutoChartEmptyReason({
        columnNames,
        effectiveXKey,
        hasRenderableData,
        selectedMetric,
    });

    return (
        <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
            <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
                <ChartView
                    chartState={{ chartType, xKey, yKey, groupKey }}
                    chartStateIsAuto={chartStateIsAuto}
                    columnNames={columnNames}
                    metricOptions={metricOptions}
                    effectiveXKey={effectiveXKey}
                    effectiveYLabel={selectedMetric?.label ?? yKey}
                    effectiveGroupKey={effectiveGroupKey}
                    chartColorPreset={chartColorPreset}
                    chartColorPresetOptions={CHART_COLOR_PRESETS.map(option => ({
                        value: option.value,
                        label: option.label,
                        preview: (resolvedTheme === 'dark' ? option.colors.dark : option.colors.light).slice(0, 3),
                    }))}
                    chartColors={chartColors}
                    aggregated={aggregated}
                    chartConfig={chartConfig}
                    emptyMessage={emptyMessage}
                    timelineSliderEnabled={timelineSliderEnabled}
                    onApplyChartFilter={handleChartFilter}
                    onChartTypeChange={value => {
                        if (value === 'bar' || value === 'line' || value === 'pie' || value === 'scatter' || value === 'histogram' || value === 'heatmap') {
                            setChartType(value);
                            if (value === 'pie' || value === 'scatter' || value === 'histogram') {
                                setGroupKey(NONE_VALUE);
                            }
                            if (value === 'histogram') {
                                setYKey('count');
                            }
                            if (value === 'heatmap') {
                                setGroupKey(previous => {
                                    if (previous !== NONE_VALUE && columnNames.includes(previous) && previous !== effectiveXKey) {
                                        return previous;
                                    }
                                    return pickFallbackGroupKey(effectiveXKey);
                                });
                            }
                        }
                    }}
                    onXKeyChange={setXKey}
                    onYKeyChange={setYKey}
                    onGroupKeyChange={setGroupKey}
                    onChartColorPresetChange={value => {
                        const matched = CHART_COLOR_PRESETS.find(option => option.value === value);
                        if (matched) {
                            setChartColorPreset(matched.value);
                        }
                    }}
                    onTimelineSliderEnabledChange={setTimelineSliderEnabled}
                    onResetAuto={() => {
                        if (onResetState) {
                            onResetState();
                            return;
                        }
                        setChartType(suggestedState.chartType);
                        setXKey(suggestedState.xKey);
                        setYKey(suggestedState.yKey);
                        setGroupKey(suggestedState.groupKey);
                    }}
                    onSaveArtifact={onSaveArtifact ? () => onSaveArtifact({ chartType, xKey, yKey, groupKey, chartColorPreset }) : undefined}
                    saveArtifactLabel={saveArtifactLabel}
                    saveArtifactPending={saveArtifactPending}
                    saveArtifactDisabled={saveArtifactDisabled}
                    saveArtifactPlacement={saveArtifactPlacement}
                />
            </div>
        </div>
    );
}

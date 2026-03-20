'use client';

import React from 'react';
import { toast } from 'sonner';

import { ChartConfig } from '@/registry/new-york-v4/ui/chart';

import { ChartCanvas } from './chart-canvas';
import { ChartControlBar } from './chart-control-bar';
import { AggregatedChartData, ChartState, MetricOption } from './chart-shared';

export function ChartView(props: {
    chartState: ChartState;
    chartStateIsAuto: boolean;
    columnNames: string[];
    metricOptions: MetricOption[];
    effectiveXKey: string;
    effectiveYLabel: string;
    effectiveGroupKey: string;
    chartColorPreset: string;
    chartColorPresetOptions: Array<{ value: string; label: string; preview: string[] }>;
    chartColors: string[];
    aggregated: AggregatedChartData;
    chartConfig: ChartConfig;
    emptyMessage: string | null;
    timelineSliderEnabled: boolean;
    onApplyChartFilter: (
        filters: Array<{ col: string; kind: 'exact'; raw: unknown } | { col: string; kind: 'range'; from: string; to: string; valueType: 'number' | 'date'; label: string }>,
        mode?: { append?: boolean },
    ) => void;
    onChartTypeChange: (value: string) => void;
    onXKeyChange: (value: string) => void;
    onYKeyChange: (value: string) => void;
    onGroupKeyChange: (value: string) => void;
    onChartColorPresetChange: (value: string) => void;
    onTimelineSliderEnabledChange: (value: boolean) => void;
    onResetAuto: () => void;
}) {
    const {
        chartState,
        chartStateIsAuto,
        columnNames,
        metricOptions,
        effectiveXKey,
        effectiveYLabel,
        effectiveGroupKey,
        chartColorPreset,
        chartColorPresetOptions,
        chartColors,
        aggregated,
        chartConfig,
        emptyMessage,
        timelineSliderEnabled,
        onApplyChartFilter,
        onChartTypeChange,
        onXKeyChange,
        onYKeyChange,
        onGroupKeyChange,
        onChartColorPresetChange,
        onTimelineSliderEnabledChange,
        onResetAuto,
    } = props;
    const chartRootRef = React.useRef<HTMLDivElement | null>(null);

    const downloadBlob = React.useCallback((blob: Blob, filename: string) => {
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
    }, []);

    const buildFileName = React.useCallback(
        (ext: 'png' | 'svg') => {
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            return `chart-${chartState.chartType}-${stamp}.${ext}`;
        },
        [chartState.chartType],
    );

    const getSerializedSvg = React.useCallback(() => {
        const svg = chartRootRef.current?.querySelector('svg');
        if (!svg) {
            return null;
        }

        const clone = svg.cloneNode(true) as SVGSVGElement;
        const width = Math.max(1, Math.round(svg.getBoundingClientRect().width));
        const height = Math.max(1, Math.round(svg.getBoundingClientRect().height));

        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        clone.setAttribute('width', String(width));
        clone.setAttribute('height', String(height));
        if (!clone.getAttribute('viewBox')) {
            clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
        }

        const originalNodes = [svg, ...Array.from(svg.querySelectorAll('*'))] as SVGElement[];
        const clonedNodes = [clone, ...Array.from(clone.querySelectorAll('*'))] as SVGElement[];
        const styleAttrs = ['fill', 'stroke', 'color', 'stop-color'];

        for (let i = 0; i < originalNodes.length; i += 1) {
            const original = originalNodes[i];
            const copied = clonedNodes[i];
            if (!original || !copied) {
                continue;
            }
            const computed = window.getComputedStyle(original);
            for (const attr of styleAttrs) {
                const rawAttr = original.getAttribute(attr);
                const styleValue = computed.getPropertyValue(attr);
                if (rawAttr?.includes('var(') && styleValue) {
                    copied.setAttribute(attr, styleValue.trim());
                }
            }
        }

        return {
            svgText: new XMLSerializer().serializeToString(clone),
            width,
            height,
        };
    }, []);

    const canExportChart = !emptyMessage && chartState.chartType !== 'heatmap';

    const handleExportSvg = React.useCallback(() => {
        const serialized = getSerializedSvg();
        if (!serialized) {
            return;
        }
        const svgBlob = new Blob([serialized.svgText], { type: 'image/svg+xml;charset=utf-8' });
        downloadBlob(svgBlob, buildFileName('svg'));
    }, [buildFileName, downloadBlob, getSerializedSvg]);

    const handleExportPng = React.useCallback(async () => {
        const serialized = getSerializedSvg();
        if (!serialized) {
            return;
        }

        const svgBlob = new Blob([serialized.svgText], { type: 'image/svg+xml;charset=utf-8' });
        const objectUrl = URL.createObjectURL(svgBlob);

        try {
            const image = await new Promise<HTMLImageElement>((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = objectUrl;
            });

            const scale = 4;
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(serialized.width * scale));
            canvas.height = Math.max(1, Math.round(serialized.height * scale));

            const context = canvas.getContext('2d');
            if (!context) {
                return;
            }

            context.scale(scale, scale);
            context.drawImage(image, 0, 0, serialized.width, serialized.height);

            const pngBlob = await new Promise<Blob | null>(resolve => {
                canvas.toBlob(blob => resolve(blob), 'image/png');
            });
            if (!pngBlob) {
                return;
            }

            downloadBlob(pngBlob, buildFileName('png'));
        } catch {
            // Ignore export failures to avoid unhandled promise rejections.
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    }, [buildFileName, downloadBlob, getSerializedSvg]);

    const handleCopyPng = React.useCallback(async () => {
        const serialized = getSerializedSvg();
        if (!serialized || !navigator?.clipboard || typeof ClipboardItem === 'undefined') {
            return;
        }

        const svgBlob = new Blob([serialized.svgText], { type: 'image/svg+xml;charset=utf-8' });
        const objectUrl = URL.createObjectURL(svgBlob);

        try {
            const image = await new Promise<HTMLImageElement>((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = objectUrl;
            });

            const scale = 4;
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(serialized.width * scale));
            canvas.height = Math.max(1, Math.round(serialized.height * scale));

            const context = canvas.getContext('2d');
            if (!context) {
                return;
            }

            context.scale(scale, scale);
            context.drawImage(image, 0, 0, serialized.width, serialized.height);

            const pngBlob = await new Promise<Blob | null>(resolve => {
                canvas.toBlob(blob => resolve(blob), 'image/png');
            });
            if (!pngBlob) {
                return;
            }

            await navigator.clipboard.write([
                new ClipboardItem({
                    'image/png': pngBlob,
                }),
            ]);
            toast.success('PNG copied to clipboard');
        } catch {
            // Ignore copy failures when clipboard APIs are unavailable or blocked.
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    }, [getSerializedSvg]);

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-muted/10">
            <ChartControlBar
                chartState={chartState}
                chartStateIsAuto={chartStateIsAuto}
                columnNames={columnNames}
                metricOptions={metricOptions}
                effectiveXKey={effectiveXKey}
                bucketHint={aggregated.bucketHint}
                chartColorPreset={chartColorPreset}
                chartColorPresetOptions={chartColorPresetOptions}
                timelineSliderEnabled={timelineSliderEnabled}
                onChartTypeChange={onChartTypeChange}
                onXKeyChange={onXKeyChange}
                onYKeyChange={onYKeyChange}
                onGroupKeyChange={onGroupKeyChange}
                onChartColorPresetChange={onChartColorPresetChange}
                onTimelineSliderEnabledChange={onTimelineSliderEnabledChange}
                onResetAuto={onResetAuto}
                canExportChart={canExportChart}
                onExportPng={() => {
                    void handleExportPng();
                }}
                onCopyPng={() => {
                    void handleCopyPng();
                }}
                onExportSvg={handleExportSvg}
            />
            <ChartCanvas
                chartType={chartState.chartType}
                chartConfig={chartConfig}
                aggregated={aggregated}
                effectiveGroupKey={effectiveGroupKey}
                chartColors={chartColors}
                xAxisLabel={effectiveXKey}
                yAxisLabel={effectiveYLabel}
                emptyMessage={emptyMessage}
                timelineSliderEnabled={timelineSliderEnabled}
                chartRootRef={chartRootRef}
                onApplyChartFilter={onApplyChartFilter}
            />
        </div>
    );
}

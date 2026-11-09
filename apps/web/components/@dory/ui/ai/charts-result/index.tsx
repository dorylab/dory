'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/registry/new-york-v4/ui/button';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/registry/new-york-v4/ui/chart';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/registry/new-york-v4/ui/tooltip';
import type { ChartPresentation, ChartResultPart } from '@dory/shared/types/chat-chart';
import { chartAxis, chartRows, chartSeries, chartTimeRange, formatChartNumber, hasDuplicateChartX } from '@dory/shared/utils/chat-chart';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Code2, Download, Pencil, Table2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { flushSync } from 'react-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from 'recharts';

import { executeActionClient } from '@/lib/actions/client';
import { shareCsv, shareFilename } from '@/lib/work-documents/share';

const SmartCodeBlock = dynamic(() => import('@/components/@dory/ui/code-block/code-block').then(module => module.SmartCodeBlock));
const ChartEditor = dynamic(() => import('./editor').then(module => module.ChartEditor));

export type { ChartResultPart } from '@dory/shared/types/chat-chart';
export type ChartResultCardProps = {
    result: ChartResultPart;
    source?: 'tool' | 'auto';
    variant?: 'card' | 'bare';
    onFollowUp?: (prompt: string) => void;
    onSave?: (presentation: ChartPresentation | null) => Promise<void>;
    organizationId?: string;
    interactive?: boolean;
};
const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

function IconHint({ label, children }: { label: string; children: ReactNode }) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
        </Tooltip>
    );
}

export function ChartResultCard({ result, variant = 'card', onFollowUp, onSave, organizationId, interactive = true }: ChartResultCardProps) {
    const t = useTranslations('DoryUI.ChartResult');
    const locale = useLocale();
    const [view, setView] = useState<'chart' | 'data' | 'source'>('chart');
    const [hidden, setHidden] = useState<string[]>([]);
    const [editing, setEditing] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState('');
    const cardRef = useRef<HTMLElement>(null);
    const imageRef = useRef<HTMLDivElement>(null);
    const rows = useMemo(() => chartRows(result), [result]);
    const rawRows = useMemo(() => chartRows(result, false), [result]);
    const timeRange = useMemo(() => chartTimeRange(result), [result]);
    const x = chartAxis(result);
    const series = chartSeries(result);
    const visible = series.filter(item => !hidden.includes(item.key));
    const colors = Object.fromEntries(series.map((item, index) => [item.key, item.color ?? COLORS[index % COLORS.length]]));
    const config: ChartConfig = Object.fromEntries(series.map(item => [item.key, { label: item.label ?? item.key, color: colors[item.key] }]));
    const columns = [...new Set([x, ...series.map(item => item.key)].filter((key): key is string => Boolean(key)))];
    const format = result.options?.valueFormat;
    const number = (value: unknown, compact = false) => formatChartNumber(value, format, locale, compact);
    const maxLabel = rows.reduce((longest, row) => Math.max(longest, ...series.map(item => number(row[item.key], true).length)), 5);
    const yWidth = Math.min(160, Math.max(64, maxLabel * 8 + (result.options?.yAxisLabel ? 22 : 8)));
    const source = useQuery({
        queryKey: ['chart-source', organizationId, result.source?.artifactId],
        enabled: view === 'source' && !result.source?.sql?.trim() && Boolean(organizationId && result.source?.artifactId),
        queryFn: ({ signal }) =>
            executeActionClient<{ title: string; connectionName?: string | null; resultSet?: { sql?: string | null } | null }>(
                'artifact.get',
                { artifactId: result.source?.artifactId },
                { organizationId, signal },
            ),
        retry: false,
    });
    const sql = result.source?.sql?.trim() ? result.source.sql : source.data?.resultSet?.sql;
    const download = (url: string, name: string) => {
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.click();
    };
    const exportCsv = () => {
        const url = URL.createObjectURL(new Blob([shareCsv(columns, rawRows)], { type: 'text/csv;charset=utf-8' }));
        download(url, shareFilename(result.title ?? 'Chart', 'csv', result.source?.truncated));
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const exportPng = async () => {
        if (exporting) return;
        setError('');
        flushSync(() => setExporting(true));
        try {
            const { toPng } = await import('html-to-image');
            // The export-only chart is mounted in every view, without changing the selected tab.
            await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            if (!imageRef.current) throw new Error('Chart export is unavailable.');
            const url = await toPng(imageRef.current, {
                pixelRatio: 2,
                backgroundColor: getComputedStyle(imageRef.current).backgroundColor,
                filter: node => !(node instanceof Element && node.classList.contains('recharts-tooltip-wrapper')),
            });
            download(url, shareFilename(result.title ?? 'Chart', 'png', result.source?.truncated));
        } catch {
            setError(t('DownloadError'));
        } finally {
            setExporting(false);
        }
    };
    const tooltip = (
        <ChartTooltip
            content={({ active, payload, label }) =>
                active && payload?.length ? (
                    <div className="rounded-lg border bg-background p-3 text-xs shadow-md">
                        <div className="mb-2 font-medium">{String(label ?? payload[0]?.payload?.[x ?? ''] ?? '')}</div>
                        {payload.map((item, index) => (
                            <div key={String(item.dataKey ?? index)} className="flex items-center justify-between gap-4">
                                <span>{series.find(series => series.key === item.dataKey)?.label ?? String(item.name)}</span>
                                <span className="font-mono tabular-nums">{number(item.value)}</span>
                            </div>
                        ))}
                    </div>
                ) : null
            }
        />
    );
    const axes = (
        <>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
                dataKey={x}
                tick={{ fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                height={result.options?.xAxisLabel ? 52 : 32}
                label={result.options?.xAxisLabel ? { value: result.options.xAxisLabel, position: 'insideBottom', offset: -4, fill: 'var(--muted-foreground)' } : undefined}
            />
            <YAxis
                tick={{ fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                width={yWidth}
                tickFormatter={value => number(value, true)}
                label={result.options?.yAxisLabel ? { value: result.options.yAxisLabel, angle: -90, position: 'insideLeft', fill: 'var(--muted-foreground)' } : undefined}
            />
            {tooltip}
        </>
    );
    const chart =
        result.chartType === 'pie' ? (
            <PieChart accessibilityLayer>
                {tooltip}
                <Pie data={rows} dataKey={series[0]?.key ?? ''} nameKey={x} innerRadius={40} outerRadius="75%" isAnimationActive={false}>
                    {rows.map((_, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Pie>
            </PieChart>
        ) : result.chartType === 'bar' ? (
            <BarChart accessibilityLayer data={rows} margin={{ left: 4, right: 16, top: 12, bottom: 8 }}>
                {axes}
                {visible.map(item => (
                    <Bar
                        key={item.key}
                        dataKey={item.key}
                        name={item.label ?? item.key}
                        fill={colors[item.key]}
                        radius={3}
                        stackId={result.options?.stacked ? 'stack' : undefined}
                        isAnimationActive={false}
                    />
                ))}
            </BarChart>
        ) : result.chartType === 'line' ? (
            <LineChart accessibilityLayer data={rows} margin={{ left: 4, right: 16, top: 12, bottom: 8 }}>
                {axes}
                {visible.map(item => (
                    <Line
                        key={item.key}
                        type="linear"
                        dataKey={item.key}
                        name={item.label ?? item.key}
                        stroke={colors[item.key]}
                        strokeWidth={2}
                        dot={rows.length <= 12}
                        connectNulls={false}
                        isAnimationActive={false}
                    />
                ))}
            </LineChart>
        ) : (
            <AreaChart accessibilityLayer data={rows} margin={{ left: 4, right: 16, top: 12, bottom: 8 }}>
                {axes}
                {visible.map(item => (
                    <Area
                        key={item.key}
                        type="linear"
                        dataKey={item.key}
                        name={item.label ?? item.key}
                        stroke={colors[item.key]}
                        fill={colors[item.key]}
                        fillOpacity={0.16}
                        stackId={result.options?.stacked ? 'stack' : undefined}
                        connectNulls={false}
                        isAnimationActive={false}
                    />
                ))}
            </AreaChart>
        );

    const renderChart = () => (
        <>
            <ChartContainer config={config} className="mt-3 aspect-auto h-[320px] w-full">
                {chart}
            </ChartContainer>
            <div className="mt-3 flex flex-wrap justify-center gap-2" aria-label={t('Legend')}>
                {result.chartType === 'pie'
                    ? rows.map((row, index) => (
                          <span key={index} className="flex items-center gap-2 text-xs">
                              <span className="size-2 rounded-sm" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                              {String(row[x ?? ''])}
                          </span>
                      ))
                    : series.map(item => (
                          <button
                              type="button"
                              key={item.key}
                              className={`flex items-center gap-2 rounded px-2 py-1 text-xs focus-visible:outline focus-visible:outline-ring ${hidden.includes(item.key) ? 'opacity-40' : ''}`}
                              aria-pressed={!hidden.includes(item.key)}
                              onClick={() => setHidden(previous => (previous.includes(item.key) ? previous.filter(key => key !== item.key) : [...previous, item.key]))}
                          >
                              <span className="size-2 rounded-sm" style={{ backgroundColor: colors[item.key] }} />
                              {item.label ?? item.key}
                          </button>
                      ))}
            </div>
        </>
    );

    return (
        <section ref={cardRef} aria-label={result.title ?? t('Title')} className={variant === 'bare' ? 'min-w-0' : 'my-3 min-w-0 rounded-xl border bg-background'}>
            <header className="flex min-w-0 items-center gap-2 px-3 py-2" data-chart-header>
                {interactive ? (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <h3 tabIndex={0} className="!m-0 min-w-0 flex-1 truncate !text-sm font-semibold">
                                {result.title ?? t('Title')}
                            </h3>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm whitespace-normal">
                            <p>{result.title ?? t('Title')}</p>
                            {result.description && <p>{result.description}</p>}
                            {timeRange && <p>{t('TimeRange', { start: timeRange[0], end: timeRange[1] })}</p>}
                        </TooltipContent>
                    </Tooltip>
                ) : (
                    <h3 className="!m-0 min-w-0 flex-1 break-words !text-base font-semibold">{result.title ?? t('Title')}</h3>
                )}
                {interactive && rows.length > 0 && (
                    <div className="flex shrink-0 items-center gap-0.5">
                        <IconHint label={t('ChartView')}>
                            <Button
                                size="icon"
                                className="size-8"
                                variant={view === 'chart' ? 'secondary' : 'ghost'}
                                aria-label={t('ChartView')}
                                aria-pressed={view === 'chart'}
                                onClick={() => setView('chart')}
                            >
                                <BarChart3 className="size-4" />
                            </Button>
                        </IconHint>
                        <IconHint label={t('DataView')}>
                            <Button
                                size="icon"
                                className="size-8"
                                variant={view === 'data' ? 'secondary' : 'ghost'}
                                aria-label={t('DataView')}
                                aria-pressed={view === 'data'}
                                onClick={() => setView('data')}
                            >
                                <Table2 className="size-4" />
                            </Button>
                        </IconHint>
                        <IconHint label={t('SourceView')}>
                            <Button
                                size="icon"
                                className="size-8"
                                variant={view === 'source' ? 'secondary' : 'ghost'}
                                aria-label={t('SourceView')}
                                aria-pressed={view === 'source'}
                                onClick={() => setView('source')}
                            >
                                <Code2 className="size-4" />
                            </Button>
                        </IconHint>
                        <DropdownMenu>
                            <IconHint label={t('Download')}>
                                <DropdownMenuTrigger asChild>
                                    <Button size="icon" className="size-8" variant="ghost" aria-label={t('Download')} disabled={exporting}>
                                        <Download className="size-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                            </IconHint>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => void exportPng()}>{t('DownloadPng')}</DropdownMenuItem>
                                <DropdownMenuItem onSelect={exportCsv}>{t('DownloadCsv')}</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {onSave && (
                            <IconHint label={t('Edit')}>
                                <Button size="icon" className="size-8" variant="ghost" aria-label={t('Edit')} onClick={() => setEditing(true)}>
                                    <Pencil className="size-4" />
                                </Button>
                            </IconHint>
                        )}
                    </div>
                )}
            </header>
            {error && (
                <p role="alert" className="px-4 text-sm text-destructive">
                    {error}
                </p>
            )}
            <div className="rounded-xl bg-background px-3 pb-3 text-foreground">
                {!interactive && result.description && <p className="text-sm text-muted-foreground">{result.description}</p>}
                {!interactive && timeRange && <p className="text-xs text-muted-foreground">{t('TimeRange', { start: timeRange[0], end: timeRange[1] })}</p>}
                {result.source?.truncated && <p className="mt-1 text-xs text-muted-foreground">{t('Preview')}</p>}
                {hasDuplicateChartX(result) && (
                    <p role="status" className="mt-2 text-sm text-muted-foreground">
                        {t('DuplicateX')}
                    </p>
                )}
                {!rows.length ? (
                    <p className="py-6 text-sm text-muted-foreground">
                        {t(
                            result.dataState === 'empty'
                                ? 'EmptyQuery'
                                : result.dataState === 'duplicate-x'
                                  ? 'DuplicateX'
                                  : result.dataState === 'invalid-fields'
                                    ? 'InvalidFields'
                                    : result.dataState === 'incomplete'
                                      ? 'Preview'
                                      : 'NoData',
                        )}
                    </p>
                ) : view === 'chart' ? (
                    renderChart()
                ) : view === 'data' ? (
                    <div className="mt-4 max-h-96 overflow-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr>
                                    {columns.map(key => (
                                        <th key={key} className="sticky top-0 border-b bg-background p-2 text-left">
                                            {series.find(item => item.key === key)?.label ?? key}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, index) => (
                                    <tr key={index}>
                                        {columns.map(key => (
                                            <td key={key} className="border-b p-2 tabular-nums" title={String(rawRows[index]?.[key] ?? '—')}>
                                                {key === x ? String(row[key] ?? '—') : number(row[key])}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="pt-2 text-sm">
                        {sql?.trim() ? (
                            <SmartCodeBlock copyLabel={t('CopySql')} value={sql} type="sql" showLineNumbers maxHeightClassName="max-h-80" />
                        ) : source.isFetching ? (
                            <p role="status" className="py-3 text-muted-foreground">
                                {t('LoadingSource')}
                            </p>
                        ) : (
                            <p role={source.error ? 'alert' : undefined} className="py-3 text-muted-foreground">
                                {t('SourceUnavailable')}
                            </p>
                        )}
                    </div>
                )}
            </div>
            {exporting && (
                <div aria-hidden="true" inert className="pointer-events-none fixed top-0 -left-[10000px]" style={{ width: Math.max(320, cardRef.current?.clientWidth ?? 640) }}>
                    <div ref={imageRef} className="bg-background p-4 text-foreground" data-chart-export>
                        <h3 className="!m-0 break-words !text-base font-semibold">{result.title ?? t('Title')}</h3>
                        {result.description && <p className="mt-1 text-sm text-muted-foreground">{result.description}</p>}
                        {timeRange && <p className="mt-1 text-xs text-muted-foreground">{t('TimeRange', { start: timeRange[0], end: timeRange[1] })}</p>}
                        {result.source?.truncated && <p className="mt-1 text-xs text-muted-foreground">{t('Preview')}</p>}
                        {renderChart()}
                    </div>
                </div>
            )}
            {onFollowUp && (
                <Button size="sm" variant="ghost" onClick={() => onFollowUp(`${t('FollowUp.Prompt')}\n${result.title ?? t('Title')}\n${result.description ?? ''}`)}>
                    {t('FollowUp.Button')}
                </Button>
            )}
            {editing && onSave && <ChartEditor result={result} onClose={() => setEditing(false)} onSave={onSave} />}
        </section>
    );
}

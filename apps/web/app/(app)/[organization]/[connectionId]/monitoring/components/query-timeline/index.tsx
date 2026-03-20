'use client';

import * as React from 'react';
import { Area, AreaChart, CartesianGrid, Legend, XAxis, YAxis } from 'recharts';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/registry/new-york-v4/ui/card';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/registry/new-york-v4/ui/chart';
import { ToggleGroup, ToggleGroupItem } from '@/registry/new-york-v4/ui/toggle-group';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';

import type { QueryTimelinePoint, TimeRange } from '@/types/monitoring';
import { fillTimelineBuckets, formatNumber } from '../../utils';
import { useLocale, useTranslations } from 'next-intl';

type SeriesMode = 'both' | 'p95' | 'p50';

export function QueryTimeline({ points, loading, timeRange }: { points: QueryTimelinePoint[]; loading: boolean; timeRange: TimeRange }) {
    const t = useTranslations('Monitoring');
    const locale = useLocale();
    const [mode, setMode] = React.useState<SeriesMode>('both');
    const chartConfig: ChartConfig = {
        p50: {
            label: t('Charts.P50Duration'),
            color: 'var(--primary)',
        },
        p95: {
            label: t('Charts.P95Duration'),
            color: 'var(--primary)',
        },
        qpm: {
            label: t('Charts.QPM'),
            color: 'var(--primary)',
        },
        errorCount: {
            label: t('Charts.ErrorCount'),
            color: 'var(--destructive)',
        },
        slowCount: {
            label: t('Charts.SlowQueries'),
            color: 'var(--primary)',
        },
    };

    const data = React.useMemo(
        () =>
            fillTimelineBuckets(points ?? [], timeRange).map(p => ({
                ts: p.ts,
                p50: p.p50Ms,
                p95: p.p95Ms,
                qpm: p.qpm,
                errorCount: p.errorCount,
                slowCount: p.slowCount,
            })),
        [points, timeRange],
    );

    const hasData = !loading && data.length > 0;

    const formatTickTime = (value: unknown) => {
        const num = typeof value === 'number' ? value : Number(value);
        const d = new Date(num);
        if (Number.isNaN(d.getTime())) return String(value ?? '');
        return d.toLocaleTimeString(locale, {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatTooltipLabel = (ts?: number | string) => {
        if (ts == null) return '';
        const num = typeof ts === 'number' ? ts : Number(ts);
        const d = new Date(num);
        if (Number.isNaN(d.getTime())) return String(ts);
        return d.toLocaleString(locale);
    };

    const renderBody = (children: React.ReactNode) => {
        if (loading) {
            return (
                <div className="h-[250px] flex flex-col gap-3">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-full w-full" />
                </div>
            );
        }

        if (!hasData) {
            return <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">{t('Empty.NoQueries')}</div>;
        }

        return children;
    };

    return (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
            
            <Card className="@container/card">
                <CardHeader className="flex items-center justify-between gap-2">
                    <div>
                        <CardTitle>{t('Charts.QueryLatencyTitle')}</CardTitle>
                        <CardDescription>{t('Charts.QueryLatencyDescription')}</CardDescription>
                    </div>

                    <ToggleGroup
                        type="single"
                        value={mode}
                        onValueChange={value => {
                            if (!value) return;
                            setMode(value as SeriesMode);
                        }}
                        size="sm"
                        className="hidden gap-1 sm:flex"
                    >
                        <ToggleGroupItem value="both">{t('Charts.Both')}</ToggleGroupItem>
                        <ToggleGroupItem value="p95">P95</ToggleGroupItem>
                        <ToggleGroupItem value="p50">P50</ToggleGroupItem>
                    </ToggleGroup>
                </CardHeader>

                <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
                    {renderBody(
                        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
                            <AreaChart data={data}>
                                <defs>
                                    <linearGradient id="fillP95" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-p95)" stopOpacity={0.9} />
                                        <stop offset="95%" stopColor="var(--color-p95)" stopOpacity={0.1} />
                                    </linearGradient>

                                    <linearGradient id="fillP50" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-p50)" stopOpacity={0.5} />
                                        <stop offset="95%" stopColor="var(--color-p50)" stopOpacity={0.05} />
                                    </linearGradient>
                                </defs>

                                <CartesianGrid vertical={false} />

                                <XAxis dataKey="ts" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tickFormatter={formatTickTime} />

                                <YAxis
                                    tickLine={false}
                                    axisLine={false}
                                    width={60}
                                    tickMargin={8}
                                    tickFormatter={v => t('Units.MsTick', { value: formatNumber(Number(v), locale) })}
                                />

                                <ChartTooltip
                                    cursor={{ strokeOpacity: 0.15 }}
                                    content={
                                        <ChartTooltipContent
                                            indicator="dot"
                                            labelFormatter={(_label, payload) => formatTooltipLabel(payload?.[0]?.payload?.ts as number | string | undefined)}
                                        />
                                    }
                                />

                                <Legend verticalAlign="top" height={28} iconType="circle" wrapperStyle={{ fontSize: 11, opacity: 0.8 }} />

                                {(mode === 'both' || mode === 'p95') && (
                                    <Area
                                        dataKey="p95"
                                        name={String(chartConfig.p95.label)}
                                        type="natural"
                                        fill="url(#fillP95)"
                                        stroke="var(--color-p95)"
                                        strokeWidth={2}
                                        dot={false}
                                        isAnimationActive={false}
                                    />
                                )}

                                {(mode === 'both' || mode === 'p50') && (
                                    <Area
                                        dataKey="p50"
                                        name={String(chartConfig.p50.label)}
                                        type="natural"
                                        fill="url(#fillP50)"
                                        stroke="var(--color-p50)"
                                        strokeWidth={1.5}
                                        dot={false}
                                        isAnimationActive={false}
                                    />
                                )}
                            </AreaChart>
                        </ChartContainer>,
                    )}
                </CardContent>
            </Card>

            
            <Card className="@container/card">
                <CardHeader>
                    <div>
                        <CardTitle>{t('Charts.QueryThroughputTitle')}</CardTitle>
                        <CardDescription>{t('Charts.QueryThroughputDescription')}</CardDescription>
                    </div>
                </CardHeader>

                <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
                    {renderBody(
                        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
                            <AreaChart data={data}>
                                <defs>
                                    <linearGradient id="fillQps" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-qps)" stopOpacity={0.7} />
                                        <stop offset="95%" stopColor="var(--color-qps)" stopOpacity={0.05} />
                                    </linearGradient>
                                </defs>

                                <CartesianGrid vertical={false} />

                                <XAxis dataKey="ts" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tickFormatter={formatTickTime} />

                                <YAxis tickLine={false} axisLine={false} width={60} tickMargin={8} tickFormatter={v => formatNumber(Number(v), locale)} />

                                <ChartTooltip
                                    cursor={{ strokeOpacity: 0.15 }}
                                    content={
                                        <ChartTooltipContent
                                            indicator="dot"
                                            labelFormatter={(_label, payload) => formatTooltipLabel(payload?.[0]?.payload?.ts as number | string | undefined)}
                                        />
                                    }
                                />

                                <Area
                                    dataKey="qpm"
                                    name={String(chartConfig.qpm.label)}
                                    type="natural"
                                    fill="url(#fillQpm)"
                                    stroke="var(--color-qpm)"
                                    strokeWidth={1.8}
                                    dot={false}
                                    isAnimationActive={false}
                                />
                            </AreaChart>
                        </ChartContainer>,
                    )}
                </CardContent>
            </Card>

            <Card className="@container/card">
                <CardHeader>
                    <div>
                        <CardTitle>{t('Charts.ErrorCountTitle')}</CardTitle>
                        <CardDescription>{t('Charts.ErrorCountDescription')}</CardDescription>
                    </div>
                </CardHeader>

                <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
                    {renderBody(
                        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
                            <AreaChart data={data}>
                                <defs>
                                    <linearGradient id="fillErrorQps" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-errorQps)" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="var(--color-errorQps)" stopOpacity={0.08} />
                                    </linearGradient>
                                </defs>

                                <CartesianGrid vertical={false} />

                                <XAxis dataKey="ts" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tickFormatter={formatTickTime} />

                                <YAxis tickLine={false} axisLine={false} width={60} tickMargin={8} tickFormatter={v => formatNumber(Number(v), locale)} />

                                <ChartTooltip
                                    cursor={{ strokeOpacity: 0.15 }}
                                    content={
                                        <ChartTooltipContent
                                            indicator="dot"
                                            labelFormatter={(_label, payload) => formatTooltipLabel(payload?.[0]?.payload?.ts as number | string | undefined)}
                                        />
                                    }
                                />

                                <Area
                                    dataKey="errorCount"
                                    name={String(chartConfig.errorCount.label)}
                                    type="natural"
                                    fill="url(#fillErrorCount)"
                                    stroke="var(--color-errorCount)"
                                    strokeWidth={1.8}
                                    dot={false}
                                    isAnimationActive={false}
                                />
                            </AreaChart>
                        </ChartContainer>,
                    )}
                </CardContent>
            </Card>

            
            <Card className="@container/card">
                <CardHeader>
                    <div>
                        <CardTitle>{t('Charts.SlowQueriesTitle')}</CardTitle>
                        <CardDescription>{t('Charts.SlowQueriesDescription')}</CardDescription>
                    </div>
                </CardHeader>

                <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
                    {renderBody(
                        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
                            <AreaChart data={data}>
                                <defs>
                                    <linearGradient id="fillSlow" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--color-slowCount)" stopOpacity={0.7} />
                                        <stop offset="95%" stopColor="var(--color-slowCount)" stopOpacity={0.05} />
                                    </linearGradient>
                                </defs>

                                <CartesianGrid vertical={false} />

                                <XAxis dataKey="ts" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tickFormatter={formatTickTime} />

                                <YAxis tickLine={false} axisLine={false} width={60} tickMargin={8} tickFormatter={v => formatNumber(Number(v), locale)} />

                                <ChartTooltip
                                    cursor={{ strokeOpacity: 0.15 }}
                                    content={
                                        <ChartTooltipContent
                                            indicator="dot"
                                            labelFormatter={(_label, payload) => formatTooltipLabel(payload?.[0]?.payload?.ts as number | string | undefined)}
                                        />
                                    }
                                />

                                <Area
                                    dataKey="slowCount"
                                    name={String(chartConfig.slowCount.label)}
                                    type="natural"
                                    fill="url(#fillSlow)"
                                    stroke="var(--color-slowCount)"
                                    strokeWidth={1.8}
                                    dot={false}
                                    isAnimationActive={false}
                                />
                            </AreaChart>
                        </ChartContainer>,
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

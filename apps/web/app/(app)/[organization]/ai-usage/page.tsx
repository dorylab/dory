'use client';

import * as React from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    XAxis,
    YAxis,
} from 'recharts';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/registry/new-york-v4/ui/table';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/registry/new-york-v4/ui/chart';

type UsageOverviewResponse = {
    kpis: {
        totalRequests: number;
        totalTokens: number;
        inputTokens: number;
        outputTokens: number;
        reasoningTokens: number;
        cachedInputTokens: number;
        cacheHits: number;
        errors: number;
        aborted: number;
        avgLatencyMs: number;
        totalCostMicros: number;
        cacheHitRate: number;
        errorRate: number;
    };
    byFeature: Array<{
        feature: string;
        requests: number;
        totalTokens: number;
        errors: number;
    }>;
    byUser: Array<{
        userId: string;
        userName: string;
        requests: number;
        totalTokens: number;
        errors: number;
    }>;
    timeseries: Array<{
        ts: string;
        requests: number;
        totalTokens: number;
        errors: number;
    }>;
};

type UsageEvent = {
    id: string;
    requestId: string;
    createdAt: string;
    userId?: string | null;
    userName?: string | null;
    feature?: string | null;
    model?: string | null;
    status: 'ok' | 'error' | 'aborted';
    totalTokens?: number | null;
    latencyMs?: number | null;
    fromCache: boolean;
    errorCode?: string | null;
    errorMessage?: string | null;
    trace?: {
        inputText?: string | null;
        outputText?: string | null;
    } | null;
};

type UsageEventsResponse = {
    items: UsageEvent[];
    nextCursor: string | null;
};

const now = new Date();
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
const toInputDate = (date: Date) => date.toISOString().slice(0, 10);

function toIsoStartOfDay(dateText: string) {
    return new Date(`${dateText}T00:00:00.000Z`).toISOString();
}

function toIsoEndOfDay(dateText: string) {
    return new Date(`${dateText}T23:59:59.999Z`).toISOString();
}

function buildQuery(params: Record<string, string | null | undefined>) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== null && value !== undefined && value !== '') {
            search.set(key, value);
        }
    }
    return search.toString();
}

function formatNumber(value?: number | null) {
    return new Intl.NumberFormat('en-US').format(value ?? 0);
}

function formatPercent(value?: number | null) {
    return `${((value ?? 0) * 100).toFixed(2)}%`;
}

const chartConfig = {
    tokens: { label: 'Tokens', color: 'var(--primary)' },
    requests: { label: 'Requests', color: 'var(--muted-foreground)' },
    input: { label: 'Input', color: 'var(--primary)' },
    output: { label: 'Output', color: 'var(--primary)' },
    reasoning: { label: 'Reasoning', color: 'var(--primary)' },
    cachedInput: { label: 'Cached Input', color: 'var(--primary)' },
} satisfies ChartConfig;

export default function AiUsagePage() {
    const [fromDate, setFromDate] = React.useState(toInputDate(sevenDaysAgo));
    const [toDate, setToDate] = React.useState(toInputDate(now));
    const [feature, setFeature] = React.useState('');
    const [userId, setUserId] = React.useState('');
    const [model, setModel] = React.useState('');
    const [status, setStatus] = React.useState('');
    const [includeTrace, setIncludeTrace] = React.useState(false);

    const [overview, setOverview] = React.useState<UsageOverviewResponse | null>(null);
    const [events, setEvents] = React.useState<UsageEvent[]>([]);
    const [nextCursor, setNextCursor] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [loadingMore, setLoadingMore] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const load = React.useCallback(async (cursor?: string | null) => {
        const isLoadMore = !!cursor;
        if (isLoadMore) {
            setLoadingMore(true);
        } else {
            setLoading(true);
            setError(null);
        }

        try {
            const from = toIsoStartOfDay(fromDate);
            const to = toIsoEndOfDay(toDate);

            const overviewQuery = buildQuery({
                from,
                to,
                feature: feature || null,
                userId: userId || null,
                model: model || null,
            });
            const eventsQuery = buildQuery({
                from,
                to,
                feature: feature || null,
                userId: userId || null,
                model: model || null,
                status: status || null,
                includeTrace: includeTrace ? 'true' : 'false',
                limit: '30',
                cursor: cursor ?? null,
            });

            const requests = [
                fetch(`/api/ai/usage/events?${eventsQuery}`, {
                    cache: 'no-store',
                    credentials: 'include',
                }),
            ];

            if (!isLoadMore) {
                requests.unshift(
                    fetch(`/api/ai/usage/overview?${overviewQuery}`, {
                        cache: 'no-store',
                        credentials: 'include',
                    }),
                );
            }

            const responses = await Promise.all(requests);
            for (const response of responses) {
                if (!response.ok) {
                    throw new Error(`Request failed with status ${response.status}`);
                }
            }

            const eventsResponse = (await responses[responses.length - 1].json()) as UsageEventsResponse;
            if (isLoadMore) {
                setEvents(prev => [...prev, ...eventsResponse.items]);
            } else {
                const overviewResponse = (await responses[0].json()) as UsageOverviewResponse;
                setOverview(overviewResponse);
                setEvents(eventsResponse.items);
            }
            setNextCursor(eventsResponse.nextCursor);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load AI usage';
            setError(message);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [feature, fromDate, includeTrace, model, status, toDate, userId]);

    React.useEffect(() => {
        void load(null);
    }, [load]);

    const overviewChartData = React.useMemo(() => {
        const kpis = overview?.kpis;
        return [
            { name: 'Input', tokens: kpis?.inputTokens ?? 0 },
            { name: 'Output', tokens: kpis?.outputTokens ?? 0 },
            { name: 'Reasoning', tokens: kpis?.reasoningTokens ?? 0 },
            { name: 'Cached Input', tokens: kpis?.cachedInputTokens ?? 0 },
        ];
    }, [overview]);

    const byFeatureData = React.useMemo(() => (overview?.byFeature ?? []).slice(0, 12), [overview]);

    const byUserData = React.useMemo(
        () =>
            (overview?.byUser ?? []).slice(0, 12).map(item => ({
                ...item,
                label: item.userName,
            })),
        [overview],
    );

    const timeseriesData = React.useMemo(
        () =>
            (overview?.timeseries ?? []).map(item => ({
                ...item,
                label: new Date(item.ts.replace(' ', 'T') + 'Z').toLocaleString(),
            })),
        [overview],
    );

    return (
        <section className="flex flex-1 flex-col gap-4 p-4 md:p-6">
            <header className="space-y-1">
                <h1 className="text-2xl font-semibold">AI Usage</h1>
                <p className="text-sm text-muted-foreground">Overview and distribution by feature, user, and time.</p>
            </header>

            <Card>
                <CardHeader>
                    <CardTitle>Filters</CardTitle>
                    <CardDescription>Filter charts and request events by time, feature, user, model, and status.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-8">
                    <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                    <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
                    <Input placeholder="Feature" value={feature} onChange={e => setFeature(e.target.value)} />
                    <Input placeholder="User ID" value={userId} onChange={e => setUserId(e.target.value)} />
                    <Input placeholder="Model" value={model} onChange={e => setModel(e.target.value)} />
                    <select
                        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                        value={status}
                        onChange={e => setStatus(e.target.value)}
                    >
                        <option value="">All Status</option>
                        <option value="ok">ok</option>
                        <option value="error">error</option>
                        <option value="aborted">aborted</option>
                    </select>
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <input type="checkbox" checked={includeTrace} onChange={e => setIncludeTrace(e.target.checked)} />
                        Include traces
                    </label>
                    <div className="flex items-center justify-end">
                        <Button onClick={() => void load(null)} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</Button>
                    </div>
                </CardContent>
            </Card>

            {error ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
            ) : null}

            <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-0 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs md:grid-cols-4">
                <Card data-slot="card">
                    <CardHeader>
                        <CardDescription>Total Requests</CardDescription>
                        <CardTitle className="text-2xl font-semibold tabular-nums">{formatNumber(overview?.kpis.totalRequests)}</CardTitle>
                    </CardHeader>
                </Card>
                <Card data-slot="card">
                    <CardHeader>
                        <CardDescription>Total Tokens</CardDescription>
                        <CardTitle className="text-2xl font-semibold tabular-nums">{formatNumber(overview?.kpis.totalTokens)}</CardTitle>
                    </CardHeader>
                </Card>
                <Card data-slot="card">
                    <CardHeader>
                        <CardDescription>Cache Hit Rate</CardDescription>
                        <CardTitle className="text-2xl font-semibold tabular-nums">{formatPercent(overview?.kpis.cacheHitRate)}</CardTitle>
                    </CardHeader>
                </Card>
                <Card data-slot="card">
                    <CardHeader>
                        <CardDescription>Error Rate</CardDescription>
                        <CardTitle className="text-2xl font-semibold tabular-nums">{formatPercent(overview?.kpis.errorRate)}</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="@container/card">
                    <CardHeader>
                        <CardTitle>Overview</CardTitle>
                        <CardDescription>
                            Requests {formatNumber(overview?.kpis.totalRequests)} · Tokens {formatNumber(overview?.kpis.totalTokens)} · Error {formatPercent(overview?.kpis.errorRate)} · Cache {formatPercent(overview?.kpis.cacheHitRate)}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
                        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
                            <BarChart data={overviewChartData}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={8} width={60} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Bar dataKey="tokens" name="Tokens" fill="var(--color-tokens)" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card className="@container/card">
                    <CardHeader>
                        <CardTitle>By Feature</CardTitle>
                        <CardDescription>Top features by total tokens.</CardDescription>
                    </CardHeader>
                    <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
                        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
                            <BarChart data={byFeatureData} margin={{ left: 8, right: 8 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="feature" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={56} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={8} width={60} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Legend />
                                <Bar dataKey="totalTokens" name="Tokens" fill="var(--color-tokens)" radius={[6, 6, 0, 0]} />
                                <Bar dataKey="requests" name="Requests" fill="var(--color-requests)" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card className="@container/card">
                    <CardHeader>
                        <CardTitle>By User</CardTitle>
                        <CardDescription>Top users by total tokens (displaying username).</CardDescription>
                    </CardHeader>
                    <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
                        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
                            <BarChart data={byUserData} margin={{ left: 8, right: 8 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={56} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={8} width={60} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Legend />
                                <Bar dataKey="totalTokens" name="Tokens" fill="var(--color-tokens)" radius={[6, 6, 0, 0]} />
                                <Bar dataKey="requests" name="Requests" fill="var(--color-requests)" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                <Card className="@container/card">
                    <CardHeader>
                        <CardTitle>Timeseries</CardTitle>
                        <CardDescription>Requests and tokens over time.</CardDescription>
                    </CardHeader>
                    <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
                        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
                            <LineChart data={timeseriesData} margin={{ left: 8, right: 8 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
                                <YAxis tickLine={false} axisLine={false} tickMargin={8} width={60} />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                <Legend />
                                <Line type="monotone" dataKey="totalTokens" name="Tokens" stroke="var(--color-tokens)" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="requests" name="Requests" stroke="var(--color-requests)" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>

            <Card className="mt-2">
                <CardHeader className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <CardTitle>Request Events</CardTitle>
                        <CardDescription>Detailed event list with status, tokens, and optional trace preview.</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => void load(null)} disabled={loading}>
                        {loading ? 'Refreshing...' : 'Refresh events'}
                    </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-xs">Time</TableHead>
                                <TableHead className="text-xs">User</TableHead>
                                <TableHead className="text-xs">Feature</TableHead>
                                <TableHead className="text-xs">Status</TableHead>
                                <TableHead className="text-xs">Tokens</TableHead>
                                <TableHead className="text-xs">Latency</TableHead>
                                <TableHead className="text-xs">Cache</TableHead>
                                <TableHead className="text-xs">Trace</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={8}>Loading...</TableCell>
                                </TableRow>
                            ) : events.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8}>No usage events found for current filters.</TableCell>
                                </TableRow>
                            ) : (
                                events.map(item => (
                                    <TableRow key={item.id} className="text-xs">
                                        <TableCell>{new Date(item.createdAt).toLocaleString()}</TableCell>
                                        <TableCell className="max-w-[180px] truncate">{item.userName || item.userId || '-'}</TableCell>
                                        <TableCell className="max-w-[180px] truncate">{item.feature || '-'}</TableCell>
                                        <TableCell>{item.status}</TableCell>
                                        <TableCell>{formatNumber(item.totalTokens)}</TableCell>
                                        <TableCell>{item.latencyMs ?? '-'}</TableCell>
                                        <TableCell>{item.fromCache ? 'hit' : 'miss'}</TableCell>
                                        <TableCell className="max-w-[360px] truncate">
                                            {item.trace?.inputText || item.trace?.outputText
                                                ? `${item.trace.inputText ?? ''} ${item.trace.outputText ?? ''}`.trim()
                                                : item.errorCode || item.errorMessage || '-'}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                    <div className="flex justify-end">
                        <Button variant="outline" disabled={!nextCursor || loadingMore} onClick={() => void load(nextCursor)}>
                            {loadingMore ? 'Loading...' : nextCursor ? 'Load more' : 'No more'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </section>
    );
}

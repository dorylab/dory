'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, Loader2 } from 'lucide-react';
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardHeader } from '@/registry/new-york-v4/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/registry/new-york-v4/ui/chart';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/registry/new-york-v4/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';

const VIEW_MODES = ['cards', 'table', 'chart'] as const;
const PAGE_SIZE = 50;

type DiffRow = {
    changeId: string;
    objectType: string;
    objectPath: string;
    changeType: string;
    attribute: string | null;
    currentValue: string | null;
    desiredValue: string | null;
    riskLevel: string;
    breaking: boolean;
    riskReason: string;
    estimatedRows: number | null;
    tableBytes: number | null;
    indexScans: number | null;
    statisticsSource: string;
};

type ResultRows = {
    rows: DiffRow[];
    rowCount: number | null;
    unfilteredRowCount?: number | null;
};

type ChartOutput = {
    data: Array<Record<string, unknown>>;
    series: Array<{ key: string; label: string }>;
    bucketHint?: string | null;
};

function riskClass(risk: string) {
    if (risk === 'high') return 'border-destructive/30 bg-destructive/10 text-destructive';
    if (risk === 'medium') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    if (risk === 'low') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    return 'border-muted-foreground/30 bg-muted text-muted-foreground';
}

export function SchemaDiffViewer({ resultSetId, organization }: { resultSetId: string; organization: string }) {
    const t = useTranslations('SchemaCompare');
    const [state, setState] = useQueryStates({
        view: parseAsStringLiteral(VIEW_MODES).withDefault('cards'),
        risk: parseAsString.withDefault('all'),
        object: parseAsString.withDefault('all'),
        search: parseAsString.withDefault(''),
        sort: parseAsString.withDefault('objectPath'),
        direction: parseAsStringLiteral(['asc', 'desc'] as const).withDefault('asc'),
        page: parseAsInteger.withDefault(1),
    });
    const filters = [
        ...(state.risk !== 'all' ? [{ col: 'riskLevel', kind: 'string' as const, op: 'equals' as const, value: state.risk }] : []),
        ...(state.object !== 'all' ? [{ col: 'objectType', kind: 'string' as const, op: 'equals' as const, value: state.object }] : []),
    ];
    const search = state.search.trim() ? { text: state.search.trim(), columns: ['objectPath', 'riskReason', 'currentValue', 'desiredValue'] } : null;
    const rowsQuery = useQuery({
        queryKey: ['schema-diff-rows', organization, resultSetId, state.risk, state.object, state.search, state.sort, state.direction, state.page],
        queryFn: () =>
            executeActionClient<ResultRows>(
                'resultSet.rows.read',
                {
                    resultSetId,
                    offset: (state.page - 1) * PAGE_SIZE,
                    limit: PAGE_SIZE,
                    sorts: [{ column: state.sort, direction: state.direction }],
                    filters,
                    search,
                },
                { organizationId: organization },
            ),
    });
    const chartQuery = useQuery({
        queryKey: ['schema-diff-chart', organization, resultSetId, state.risk, state.object, state.search],
        queryFn: () =>
            executeActionClient<ChartOutput>(
                'resultSet.chart.read',
                {
                    resultSetId,
                    xKey: 'objectType',
                    yKey: 'count',
                    groupKey: 'riskLevel',
                    chartType: 'bar',
                    filters,
                    search,
                },
                { organizationId: organization },
            ),
        enabled: state.view === 'chart',
    });
    const exportMutation = useMutation({
        mutationFn: (format: 'csv' | 'parquet') =>
            executeActionClient<{ downloadUrl: string }>(
                'resultSet.export.create',
                { resultSetId, format, filters, search, sorts: [{ column: state.sort, direction: state.direction }] },
                { organizationId: organization },
            ),
        onSuccess: output => window.location.assign(output.downloadUrl),
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.ExportFailed')),
    });
    const total = rowsQuery.data?.rowCount ?? 0;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const chartConfig = Object.fromEntries(
        (chartQuery.data?.series ?? []).map((series, index) => [
            series.key,
            {
                label: series.label,
                color: `var(--chart-${(index % 5) + 1})`,
            },
        ]),
    ) satisfies ChartConfig;
    const toggleSort = (column: string) => {
        void setState({
            sort: column,
            direction: state.sort === column && state.direction === 'asc' ? 'desc' : 'asc',
            page: 1,
        });
    };
    const SortIcon = state.direction === 'asc' ? ChevronUp : ChevronDown;

    return (
        <section className="rounded-lg border bg-card">
            <div className="flex flex-wrap items-center gap-3 border-b p-4">
                <Tabs value={state.view} onValueChange={view => void setState({ view: view as (typeof VIEW_MODES)[number] })}>
                    <TabsList>
                        <TabsTrigger value="cards">{t('Changes.Cards')}</TabsTrigger>
                        <TabsTrigger value="table">{t('Changes.Table')}</TabsTrigger>
                        <TabsTrigger value="chart">{t('Changes.Chart')}</TabsTrigger>
                    </TabsList>
                </Tabs>
                <Input
                    className="min-w-[220px] flex-1"
                    value={state.search}
                    onChange={event => void setState({ search: event.target.value, page: 1 })}
                    placeholder={t('Changes.Search')}
                />
                <Select value={state.risk} onValueChange={risk => void setState({ risk, page: 1 })}>
                    <SelectTrigger className="w-[145px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {['all', 'high', 'medium', 'low', 'unknown'].map(risk => (
                            <SelectItem key={risk} value={risk}>
                                {t(`Risk.${risk}`)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={state.object} onValueChange={object => void setState({ object, page: 1 })}>
                    <SelectTrigger className="w-[170px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {['all', 'table', 'column', 'index', 'constraint', 'view', 'materialized_view'].map(object => (
                            <SelectItem key={object} value={object}>
                                {t(`Object.${object}`)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" disabled={exportMutation.isPending}>
                            {exportMutation.isPending ? <Loader2 className="animate-spin" /> : <Download />}
                            {t('Changes.Export')}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => exportMutation.mutate('csv')}>CSV</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => exportMutation.mutate('parquet')}>Parquet</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {rowsQuery.isLoading ? (
                <div className="flex h-48 items-center justify-center text-muted-foreground">
                    <Loader2 className="mr-2 animate-spin" />
                    {t('Loading')}
                </div>
            ) : state.view === 'cards' ? (
                <div className="grid gap-4 p-4 lg:grid-cols-2">
                    {(rowsQuery.data?.rows ?? []).map(row => (
                        <Card key={row.changeId} className="gap-0 overflow-hidden py-0">
                            <CardHeader data-testid="schema-diff-card-header" className="flex flex-row items-center justify-between gap-3 border-b px-5 py-3 [.border-b]:pb-3">
                                <div className="min-w-0">
                                    <div className="truncate font-mono text-sm font-medium" title={row.objectPath}>
                                        {row.objectPath}
                                    </div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                        {row.objectType} · {row.changeType}
                                        {row.attribute ? ` · ${row.attribute}` : ''}
                                    </div>
                                </div>
                                <Badge variant="outline" className={`shrink-0 ${riskClass(row.riskLevel)}`}>
                                    {row.riskLevel}
                                </Badge>
                            </CardHeader>
                            <CardContent className="grid gap-4 p-5">
                                <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                                    <div className="rounded-md bg-muted/60 p-3">
                                        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('Current')}</div>
                                        <div className="break-words font-mono text-sm">{row.currentValue ?? '—'}</div>
                                    </div>
                                    <ChevronRight className="hidden h-4 w-4 text-muted-foreground sm:block" />
                                    <div className="rounded-md bg-muted/60 p-3">
                                        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('Desired')}</div>
                                        <div className="break-words font-mono text-sm">{row.desiredValue ?? '—'}</div>
                                    </div>
                                </div>
                                <p className="text-sm text-muted-foreground">{row.riskReason}</p>
                                {row.estimatedRows != null || row.indexScans != null ? (
                                    <div className="text-xs text-muted-foreground">
                                        {row.estimatedRows != null ? `${t('Changes.EstimatedRows')}: ${row.estimatedRows.toLocaleString()} · ` : ''}
                                        {row.indexScans != null ? `${t('Changes.CumulativeScans')}: ${row.indexScans.toLocaleString()} · ` : ''}
                                        {row.statisticsSource}
                                    </div>
                                ) : null}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : state.view === 'table' ? (
                <div className="overflow-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>
                                    <Button variant="ghost" size="sm" onClick={() => toggleSort('objectPath')}>
                                        {t('Changes.ObjectPath')}
                                        {state.sort === 'objectPath' ? <SortIcon /> : null}
                                    </Button>
                                </TableHead>
                                <TableHead>{t('Changes.Change')}</TableHead>
                                <TableHead>{t('Current')}</TableHead>
                                <TableHead>{t('Desired')}</TableHead>
                                <TableHead>
                                    <Button variant="ghost" size="sm" onClick={() => toggleSort('riskLevel')}>
                                        {t('Changes.Risk')}
                                        {state.sort === 'riskLevel' ? <SortIcon /> : null}
                                    </Button>
                                </TableHead>
                                <TableHead>{t('Changes.Reason')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(rowsQuery.data?.rows ?? []).map(row => (
                                <TableRow key={row.changeId}>
                                    <TableCell className="max-w-[280px] font-mono text-xs">{row.objectPath}</TableCell>
                                    <TableCell>
                                        {row.changeType}
                                        {row.attribute ? ` · ${row.attribute}` : ''}
                                    </TableCell>
                                    <TableCell className="max-w-[240px] truncate font-mono text-xs">{row.currentValue ?? '—'}</TableCell>
                                    <TableCell className="max-w-[240px] truncate font-mono text-xs">{row.desiredValue ?? '—'}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={riskClass(row.riskLevel)}>
                                            {row.riskLevel}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="max-w-[360px] text-sm text-muted-foreground">{row.riskReason}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            ) : chartQuery.isLoading ? (
                <div className="flex h-72 items-center justify-center text-muted-foreground">
                    <Loader2 className="animate-spin" />
                </div>
            ) : (
                <div className="p-6">
                    <ChartContainer config={chartConfig} className="h-[360px] w-full">
                        <BarChart accessibilityLayer data={chartQuery.data?.data ?? []}>
                            <CartesianGrid vertical={false} />
                            <XAxis dataKey="xLabel" tickLine={false} axisLine={false} />
                            <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                            <ChartTooltip content={<ChartTooltipContent />} />
                            {(chartQuery.data?.series ?? []).map(series => (
                                <Bar key={series.key} dataKey={series.key} stackId="risk" fill={`var(--color-${series.key})`} radius={3} />
                            ))}
                        </BarChart>
                    </ChartContainer>
                    {chartQuery.data?.bucketHint ? <p className="mt-2 text-xs text-muted-foreground">{chartQuery.data.bucketHint}</p> : null}
                </div>
            )}

            {state.view !== 'chart' ? (
                <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
                    <span>{t('Changes.Count', { count: total })}</span>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon-sm" disabled={state.page <= 1} onClick={() => void setState({ page: state.page - 1 })}>
                            <ChevronLeft />
                        </Button>
                        <span>
                            {state.page} / {pages}
                        </span>
                        <Button variant="outline" size="icon-sm" disabled={state.page >= pages} onClick={() => void setState({ page: state.page + 1 })}>
                            <ChevronRight />
                        </Button>
                    </div>
                </div>
            ) : null}
        </section>
    );
}

'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, Loader2, Maximize2 } from 'lucide-react';
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useTranslations } from 'next-intl';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';

import { cn } from '@dory/web-utils';

import { executeActionClient } from '@/lib/actions/client';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardHeader } from '@/registry/new-york-v4/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/registry/new-york-v4/ui/chart';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';
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

function formatDiffValue(value: string) {
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;

    try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
        return value;
    }
}

function DiffValue({ value, label, className }: { value: string | null; label: string; className?: string }) {
    if (value == null) return <span className={cn('font-mono text-xs', className)}>—</span>;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        'group flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-sm text-left font-mono text-xs transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        className,
                    )}
                >
                    <span className="min-w-0 flex-1 truncate">{value}</span>
                    <Maximize2 className="size-3 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={8} className="w-[min(36rem,calc(100vw-2rem))] overflow-hidden p-0">
                <div className="border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">{label}</div>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-5">{formatDiffValue(value)}</pre>
            </PopoverContent>
        </Popover>
    );
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
    const groupedRows = Object.entries(
        (rowsQuery.data?.rows ?? []).reduce<Record<string, DiffRow[]>>((groups, row) => {
            const key = row.objectType === 'materialized_view' ? 'view' : row.objectType;
            (groups[key] ??= []).push(row);
            return groups;
        }, {}),
    );
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
                <div className="grid gap-7 p-4">
                    {groupedRows.map(([objectType, rows]) => (
                        <section key={objectType}>
                            <div className="mb-3 flex items-center gap-2">
                                <h3 className="text-sm font-semibold">{t(`Object.${objectType}`)}</h3>
                                <Badge variant="secondary">{rows.length}</Badge>
                            </div>
                            <div className="grid gap-4 lg:grid-cols-2">
                                {rows.map(row => (
                                    <Card key={row.changeId} className="gap-0 overflow-hidden py-0">
                                        <CardHeader
                                            data-testid="schema-diff-card-header"
                                            className="flex flex-row items-center justify-between gap-3 border-b px-5 py-3 [.border-b]:pb-3"
                                        >
                                            <div className="min-w-0">
                                                <div className="truncate font-mono text-sm font-medium" title={row.objectPath}>
                                                    {row.objectPath}
                                                </div>
                                                <div className="mt-1 text-xs text-muted-foreground">
                                                    {row.changeType}
                                                    {row.attribute ? ` · ${row.attribute}` : ''}
                                                </div>
                                            </div>
                                            <Badge variant="outline" className={`shrink-0 ${riskClass(row.riskLevel)}`}>
                                                {row.riskLevel}
                                            </Badge>
                                        </CardHeader>
                                        <CardContent className="grid gap-4 p-5">
                                            <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                                                <div className="min-w-0 rounded-md bg-muted/60 p-3">
                                                    <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('Current')}</div>
                                                    <DiffValue value={row.currentValue} label={t('Current')} className="text-sm" />
                                                </div>
                                                <ChevronRight className="hidden h-4 w-4 text-muted-foreground sm:block" />
                                                <div className="min-w-0 rounded-md bg-muted/60 p-3">
                                                    <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('Desired')}</div>
                                                    <DiffValue value={row.desiredValue} label={t('Desired')} className="text-sm" />
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
                        </section>
                    ))}
                </div>
            ) : state.view === 'table' ? (
                <div className="overflow-auto">
                    <Table className="min-w-[1420px] table-fixed">
                        <TableHeader className="bg-muted/30">
                            <TableRow className="border-0">
                                <TableHead className="w-[220px] border-r border-b px-3">
                                    <Button variant="ghost" size="sm" onClick={() => toggleSort('objectPath')}>
                                        {t('Changes.ObjectPath')}
                                        {state.sort === 'objectPath' ? <SortIcon /> : null}
                                    </Button>
                                </TableHead>
                                <TableHead className="w-[180px] border-r border-b px-3">{t('Changes.Change')}</TableHead>
                                <TableHead className="w-[280px] border-r border-b px-3">{t('Current')}</TableHead>
                                <TableHead className="w-[280px] border-r border-b px-3">{t('Desired')}</TableHead>
                                <TableHead className="w-[120px] border-r border-b px-3">
                                    <Button variant="ghost" size="sm" onClick={() => toggleSort('riskLevel')}>
                                        {t('Changes.Risk')}
                                        {state.sort === 'riskLevel' ? <SortIcon /> : null}
                                    </Button>
                                </TableHead>
                                <TableHead className="border-b px-3">{t('Changes.Reason')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(rowsQuery.data?.rows ?? []).map(row => (
                                <TableRow key={row.changeId} className="border-0">
                                    <TableCell className="border-r border-b px-3 py-2.5">
                                        <DiffValue value={row.objectPath} label={t('Changes.ObjectPath')} />
                                    </TableCell>
                                    <TableCell className="border-r border-b px-3 py-2.5">
                                        {row.changeType}
                                        {row.attribute ? ` · ${row.attribute}` : ''}
                                    </TableCell>
                                    <TableCell className="border-r border-b px-3 py-2.5">
                                        <DiffValue value={row.currentValue} label={t('Current')} />
                                    </TableCell>
                                    <TableCell className="border-r border-b px-3 py-2.5">
                                        <DiffValue value={row.desiredValue} label={t('Desired')} />
                                    </TableCell>
                                    <TableCell className="border-r border-b px-3 py-2.5">
                                        <Badge variant="outline" className={riskClass(row.riskLevel)}>
                                            {row.riskLevel}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="border-b px-3 py-2.5">
                                        <DiffValue value={row.riskReason} label={t('Changes.Reason')} className="font-sans text-sm text-muted-foreground" />
                                    </TableCell>
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

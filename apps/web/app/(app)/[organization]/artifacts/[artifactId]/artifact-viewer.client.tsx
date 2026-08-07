'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BarChart3, Bot, Check, Database, Download, ExternalLink, FileText, Loader2, Pencil, Save, Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { toast } from 'sonner';

import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { executeActionClient } from '@/lib/actions/client';
import { buildArtifactHandoffPrompt } from '@/lib/artifacts/handoff-prompt';
import type { ArtifactChartState, ArtifactDetail } from '@/lib/artifacts/types';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/registry/new-york-v4/ui/table';

const ArtifactCharts = dynamic(() => import('../../[connectionId]/sql-console/components/result-table/components/charts').then(module => module.Charts), {
    ssr: false,
    loading: () => <Skeleton className="h-[460px] w-full" />,
});

const PAGE_SIZE = 100;
const DIRECTIONS = ['asc', 'desc'] as const;

type RowsOutput = {
    rows: Record<string, unknown>[];
    rowCount: number | null;
    columns: unknown[];
    dataAvailability: string;
};

function formatBytes(value: number | null) {
    if (value == null) return '—';
    if (value < 1024) return `${value} B`;
    if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
    return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

function columnNames(columns: unknown[], rows: Record<string, unknown>[]) {
    const names = columns
        .map(column => (column && typeof column === 'object' && 'name' in column && typeof column.name === 'string' ? column.name : null))
        .filter((name): name is string => Boolean(name));
    return names.length ? names : Object.keys(rows[0] ?? {});
}

function Metadata({ artifact }: { artifact: ArtifactDetail }) {
    const t = useTranslations('Artifacts.Viewer');
    const items = [
        [t('CreatedBy'), artifact.runTitle ?? artifact.createdByActorType],
        [t('Source'), artifact.connectionName ?? artifact.comparisonName ?? artifact.sourceType ?? '—'],
        [t('Rows'), artifact.rowCount == null ? '—' : artifact.rowCount.toLocaleString()],
        [t('Size'), formatBytes(artifact.byteSize)],
        [t('CreatedAt'), new Date(artifact.createdAt).toLocaleString()],
        [t('ExpiresAt'), artifact.expiresAt ? new Date(artifact.expiresAt).toLocaleString() : t('NoExpiry')],
    ];
    return (
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(([label, value]) => (
                <div key={label} className="rounded-md border bg-card px-4 py-3">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
                    <dd className="mt-1 truncate text-sm font-medium" title={value}>
                        {value}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

export function ArtifactViewerClient({ organization, artifactId }: { organization: string; artifactId: string }) {
    const t = useTranslations('Artifacts.Viewer');
    const router = useRouter();
    const organizationId = useOrganizationId();
    const queryClient = useQueryClient();
    const contentRef = useRef<HTMLDivElement>(null);
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState('');
    const [showChartBuilder, setShowChartBuilder] = useState(false);
    const [chartState, setChartState] = useState<ArtifactChartState | null>(null);
    const [tableState, setTableState] = useQueryStates({
        page: parseAsInteger.withDefault(1),
        q: parseAsString.withDefault(''),
        sort: parseAsString.withDefault(''),
        direction: parseAsStringLiteral(DIRECTIONS).withDefault('asc'),
    });
    const artifactQuery = useQuery({
        queryKey: ['artifact', organizationId, artifactId],
        queryFn: () => executeActionClient<ArtifactDetail>('artifact.get', { artifactId }, { organizationId }),
    });
    const artifact = artifactQuery.data;
    useEffect(() => {
        if (!artifact) return;
        setTitle(artifact.title);
        setChartState(artifact.chartState);
        setShowChartBuilder(artifact.type === 'chart');
    }, [artifact]);

    const rowsQuery = useQuery({
        queryKey: ['artifact-rows', organizationId, artifact?.sourceResultSetId, tableState.page, tableState.q, tableState.sort, tableState.direction],
        enabled: Boolean(artifact?.sourceResultSetId),
        queryFn: () =>
            executeActionClient<RowsOutput>(
                'resultSet.rows.read',
                {
                    resultSetId: artifact!.sourceResultSetId,
                    offset: (tableState.page - 1) * PAGE_SIZE,
                    limit: PAGE_SIZE,
                    sorts: tableState.sort ? [{ column: tableState.sort, direction: tableState.direction }] : undefined,
                    search: tableState.q ? { text: tableState.q } : undefined,
                },
                { organizationId },
            ),
    });
    const columns = useMemo(
        () => columnNames((rowsQuery.data?.columns ?? artifact?.resultSet?.columns ?? []) as unknown[], rowsQuery.data?.rows ?? []),
        [artifact?.resultSet?.columns, rowsQuery.data],
    );
    const pageCount = Math.max(1, Math.ceil((rowsQuery.data?.rowCount ?? artifact?.rowCount ?? 0) / PAGE_SIZE));

    const renameMutation = useMutation({
        mutationFn: () => executeActionClient<{ id: string; title: string }>('artifact.rename', { artifactId, title }, { organizationId }),
        onSuccess: output => {
            queryClient.setQueryData<ArtifactDetail>(['artifact', organizationId, artifactId], current => (current ? { ...current, title: output.title } : current));
            setEditing(false);
            toast.success(t('Renamed'));
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('ActionFailed')),
    });
    const exportMutation = useMutation({
        mutationFn: (format: 'csv' | 'parquet') =>
            executeActionClient<{ artifactId: string; downloadUrl: string }>('resultSet.export.create', { resultSetId: artifact?.sourceResultSetId, format }, { organizationId }),
        onSuccess: output => {
            void queryClient.invalidateQueries({ queryKey: ['artifacts', organizationId] });
            window.location.assign(output.downloadUrl);
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('ActionFailed')),
    });
    const chartMutation = useMutation({
        mutationFn: async () => {
            if (!artifact || !chartState) throw new Error(t('ChartRequired'));
            if (artifact.type === 'chart') {
                return executeActionClient<{ id: string }>('artifact.chart.update', { artifactId: artifact.id, chartState }, { organizationId });
            }
            return executeActionClient<{ id: string }>(
                'artifact.chart.create',
                { sourceArtifactId: artifact.id, title: `${artifact.title} chart`, chartState },
                { organizationId },
            );
        },
        onSuccess: output => {
            void queryClient.invalidateQueries({ queryKey: ['artifacts', organizationId] });
            toast.success(t('ChartSaved'));
            if (artifact?.type !== 'chart') router.push(`/${encodeURIComponent(organization)}/artifacts/${encodeURIComponent(output.id)}`);
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('ActionFailed')),
    });

    const copyShare = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            toast.success(t('ShareCopied'));
        } catch {
            toast.error(t('ActionFailed'));
        }
    };
    const continueWithAgent = async () => {
        if (!artifact) return;
        try {
            await navigator.clipboard.writeText(buildArtifactHandoffPrompt(artifact, window.location.href));
            toast.success(t('AgentTaskCopied'));
        } catch {
            toast.error(t('ActionFailed'));
        }
    };
    const openContent = () => contentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (artifactQuery.isLoading) {
        return (
            <div className="h-screen bg-n8 p-8">
                <Skeleton className="mx-auto h-80 max-w-6xl" />
            </div>
        );
    }
    if (!artifact) {
        return <div className="flex h-screen items-center justify-center bg-n8 text-sm text-muted-foreground">{t('NotFound')}</div>;
    }

    const TypeIcon = artifact.type === 'result_set' ? Database : artifact.type === 'chart' ? BarChart3 : FileText;
    return (
        <div className="h-screen overflow-auto bg-n8">
            <main className="container mx-auto flex flex-col gap-6 px-12 pb-12 pt-8 lg:px-12 xl:px-8 2xl:px-4">
                <Button asChild variant="ghost" size="sm" className="w-fit -ml-2">
                    <Link href={`/${encodeURIComponent(organization)}/artifacts`}>
                        <ArrowLeft className="h-4 w-4" />
                        {t('Back')}
                    </Link>
                </Button>
                <header className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <TypeIcon className="h-4 w-4" />
                                {t(`Types.${artifact.type}`)}
                            </div>
                            {editing ? (
                                <div className="mt-2 flex max-w-2xl gap-2">
                                    <Input
                                        value={title}
                                        onChange={event => setTitle(event.target.value)}
                                        maxLength={160}
                                        autoFocus
                                        onKeyDown={event => {
                                            if (event.key === 'Enter') renameMutation.mutate();
                                            if (event.key === 'Escape') {
                                                setTitle(artifact.title);
                                                setEditing(false);
                                            }
                                        }}
                                    />
                                    <Button size="icon" onClick={() => renameMutation.mutate()} disabled={!title.trim() || renameMutation.isPending}>
                                        <Check />
                                    </Button>
                                </div>
                            ) : (
                                <button type="button" className="group mt-2 flex max-w-3xl items-center gap-2 text-left" onClick={() => setEditing(true)}>
                                    <h1 className="truncate text-2xl font-semibold">{artifact.title}</h1>
                                    <Pencil className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-60" />
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={openContent}>
                                <ExternalLink />
                                {t('Open')}
                            </Button>
                            <Button variant="outline" onClick={continueWithAgent}>
                                <Bot />
                                {t('ContinueWithAgent')}
                            </Button>
                            {artifact.type === 'result_set' ? (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" disabled={exportMutation.isPending}>
                                            <Download />
                                            {t('Export')}
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onSelect={() => exportMutation.mutate('csv')}>CSV</DropdownMenuItem>
                                        <DropdownMenuItem onSelect={() => exportMutation.mutate('parquet')}>Parquet</DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            ) : artifact.type === 'file' && artifact.downloadUrl ? (
                                <Button asChild variant="outline">
                                    <a href={artifact.downloadUrl}>
                                        <Download />
                                        {t('Download')}
                                    </a>
                                </Button>
                            ) : null}
                            {artifact.type === 'result_set' ? (
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setShowChartBuilder(true);
                                        openContent();
                                    }}
                                >
                                    <BarChart3 />
                                    {t('CreateChart')}
                                </Button>
                            ) : null}
                            <Button variant="outline" onClick={copyShare}>
                                <Share2 />
                                {t('Share')}
                            </Button>
                        </div>
                    </div>
                    <Metadata artifact={artifact} />
                </header>

                <div ref={contentRef} className="scroll-mt-6 space-y-4">
                    {artifact.type === 'file' ? (
                        <Card>
                            <CardHeader>
                                <CardTitle>{artifact.fileName}</CardTitle>
                            </CardHeader>
                            <CardContent className="flex min-h-52 flex-col items-center justify-center gap-4 text-center">
                                <FileText className="h-12 w-12 text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">{t('FileDescription', { format: artifact.fileFormat?.toUpperCase() ?? '' })}</p>
                                {artifact.downloadUrl ? (
                                    <Button asChild>
                                        <a href={artifact.downloadUrl}>
                                            <Download />
                                            {t('Download')}
                                        </a>
                                    </Button>
                                ) : null}
                            </CardContent>
                        </Card>
                    ) : null}

                    {(artifact.type === 'chart' || showChartBuilder) && artifact.sourceResultSetId ? (
                        <Card>
                            <CardHeader className="flex-row items-center justify-between">
                                <CardTitle>{t('Chart')}</CardTitle>
                                <Button onClick={() => chartMutation.mutate()} disabled={!chartState || chartMutation.isPending}>
                                    {chartMutation.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                                    {t('SaveChart')}
                                </Button>
                            </CardHeader>
                            <CardContent className="h-[560px]">
                                <ArtifactCharts
                                    rows={(rowsQuery.data?.rows ?? []).map(row => ({ rowData: row }))}
                                    columnsRaw={rowsQuery.data?.columns ?? artifact.resultSet?.columns}
                                    remoteSource={{
                                        cacheKey: `${artifact.sourceResultSetId}:artifact-chart`,
                                        readChart: state =>
                                            executeActionClient(
                                                'resultSet.chart.read',
                                                {
                                                    resultSetId: artifact.sourceResultSetId,
                                                    xKey: state.xKey,
                                                    yKey: state.yKey,
                                                    groupKey: state.groupKey,
                                                    chartType: state.chartType,
                                                },
                                                { organizationId },
                                            ),
                                    }}
                                    initialState={artifact.chartState ?? undefined}
                                    onStateChange={setChartState}
                                    stateKey={`artifact:${artifact.id}`}
                                />
                            </CardContent>
                        </Card>
                    ) : null}

                    {artifact.type === 'result_set' && !showChartBuilder ? (
                        <Card>
                            <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between">
                                <CardTitle>{t('Data')}</CardTitle>
                                <Input
                                    value={tableState.q}
                                    onChange={event => void setTableState({ q: event.target.value, page: 1 })}
                                    placeholder={t('SearchRows')}
                                    className="md:max-w-xs"
                                />
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                {columns.map(column => (
                                                    <TableHead key={column}>
                                                        <button
                                                            type="button"
                                                            className="whitespace-nowrap"
                                                            onClick={() =>
                                                                void setTableState({
                                                                    sort: column,
                                                                    direction: tableState.sort === column && tableState.direction === 'asc' ? 'desc' : 'asc',
                                                                    page: 1,
                                                                })
                                                            }
                                                        >
                                                            {column}
                                                            {tableState.sort === column ? (tableState.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                                                        </button>
                                                    </TableHead>
                                                ))}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {rowsQuery.isLoading ? (
                                                <TableRow>
                                                    <TableCell colSpan={Math.max(columns.length, 1)} className="h-32 text-center">
                                                        <Loader2 className="mx-auto animate-spin" />
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                rowsQuery.data?.rows.map((row, index) => (
                                                    <TableRow key={`${tableState.page}-${index}`}>
                                                        {columns.map(column => (
                                                            <TableCell key={column} className="max-w-72 truncate font-mono text-xs" title={String(row[column] ?? '')}>
                                                                {row[column] == null ? <span className="text-muted-foreground">NULL</span> : String(row[column])}
                                                            </TableCell>
                                                        ))}
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                                <div className="flex items-center justify-end gap-2 border-t p-3">
                                    <Button size="sm" variant="outline" disabled={tableState.page <= 1} onClick={() => void setTableState({ page: tableState.page - 1 })}>
                                        {t('Previous')}
                                    </Button>
                                    <span className="text-xs text-muted-foreground">{t('Page', { page: tableState.page, pages: pageCount })}</span>
                                    <Button size="sm" variant="outline" disabled={tableState.page >= pageCount} onClick={() => void setTableState({ page: tableState.page + 1 })}>
                                        {t('Next')}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ) : null}
                </div>
            </main>
        </div>
    );
}

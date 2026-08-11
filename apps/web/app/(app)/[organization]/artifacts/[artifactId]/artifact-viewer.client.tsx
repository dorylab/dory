'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BarChart3, Bot, Check, Database, Download, ExternalLink, FileText, Loader2, Pencil, Pin, PinOff, Save, Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { executeActionClient } from '@/lib/actions/client';
import { buildArtifactHandoffPrompt } from '@/lib/artifacts/handoff-prompt';
import { buildArtifactWorkspacePath } from '@/lib/artifacts/workspace-url';
import type { ArtifactChartState, ArtifactDetail } from '@/lib/artifacts/types';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { ArtifactResultTable } from './artifact-result-table';

const ArtifactCharts = dynamic(() => import('../../[connectionId]/sql-console/components/result-table/components/charts').then(module => module.Charts), {
    ssr: false,
    loading: () => <Skeleton className="h-[460px] w-full" />,
});

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

function Metadata({ artifact }: { artifact: ArtifactDetail }) {
    const t = useTranslations('Artifacts.Viewer');
    const items = [
        [t('CreatedBy'), artifact.runTitle ?? artifact.createdByActorType],
        [t('Source'), artifact.connectionName ?? artifact.comparisonName ?? artifact.sourceType ?? '—'],
        ...(artifact.resultSet?.sql ? [[t('CreatedFrom'), artifact.resultSet.sql]] : []),
        [t('Rows'), artifact.rowCount == null ? '—' : artifact.rowCount.toLocaleString()],
        [t('Size'), formatBytes(artifact.byteSize)],
        [t('CreatedAt'), new Date(artifact.createdAt).toLocaleString()],
        [t('Retention'), artifact.pinnedAt ? t('Pinned') : artifact.expiresAt ? t('Temporary', { days: artifact.retentionDays ?? 1 }) : t('Stored')],
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
    const [editing, setEditing] = useState(false);
    const [title, setTitle] = useState('');
    const [showChartBuilder, setShowChartBuilder] = useState(false);
    const [chartState, setChartState] = useState<ArtifactChartState | null>(null);
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

    const chartRowsQuery = useQuery({
        queryKey: ['artifact-chart-rows', organizationId, artifact?.sourceResultSetId],
        enabled: Boolean(artifact?.sourceResultSetId && (artifact.type === 'chart' || showChartBuilder)),
        queryFn: () =>
            executeActionClient<RowsOutput>(
                'resultSet.rows.read',
                {
                    resultSetId: artifact!.sourceResultSetId,
                    offset: 0,
                    limit: 200,
                },
                { organizationId },
            ),
    });

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
    const pinMutation = useMutation({
        mutationFn: () => executeActionClient<{ id: string; title: string }>('artifact.pin', { artifactId }, { organizationId }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['artifact', organizationId, artifactId] });
            void queryClient.invalidateQueries({ queryKey: ['artifacts', organizationId] });
            toast.success(t('Pinned'));
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('ActionFailed')),
    });
    const unpinMutation = useMutation({
        mutationFn: () => executeActionClient<{ id: string; title: string }>('artifact.unpin', { artifactId }, { organizationId }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['artifact', organizationId, artifactId] });
            void queryClient.invalidateQueries({ queryKey: ['artifacts', organizationId] });
            toast.success(t('Unpinned'));
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
        <div className="h-dvh overflow-hidden bg-n8">
            <main className="container mx-auto flex h-full min-h-0 flex-col gap-4 px-12 pb-6 pt-8 lg:px-12 xl:px-8 2xl:px-4">
                <Button asChild variant="ghost" size="sm" className="w-fit -ml-2">
                    <Link href={`/${encodeURIComponent(organization)}/artifacts`}>
                        <ArrowLeft className="h-4 w-4" />
                        {t('Back')}
                    </Link>
                </Button>
                <header className="shrink-0 space-y-4">
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
                            {artifact.workspaceTarget ? (
                                <Button asChild>
                                    <Link href={buildArtifactWorkspacePath(organization, artifact.id, artifact.workspaceTarget.connectionId)}>
                                        <ExternalLink />
                                        {t('Open')}
                                    </Link>
                                </Button>
                            ) : null}
                            <Button variant="outline" onClick={continueWithAgent}>
                                <Bot />
                                {t('ContinueWithAgent')}
                            </Button>
                            {artifact.sourceResultSetId ? (
                                artifact.pinnedAt ? (
                                    <Button variant="outline" onClick={() => unpinMutation.mutate()} disabled={unpinMutation.isPending}>
                                        <PinOff />
                                        {t('Unpin')}
                                    </Button>
                                ) : (
                                    <Button variant="outline" onClick={() => pinMutation.mutate()} disabled={pinMutation.isPending}>
                                        <Pin />
                                        {t('Pin')}
                                    </Button>
                                )
                            ) : null}
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

                <div className="min-h-0 flex-1">
                    {artifact.type === 'file' ? (
                        <Card className="h-full overflow-hidden">
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
                        <Card className="flex h-full min-h-0 flex-col overflow-hidden">
                            <CardHeader className="flex-row items-center justify-between">
                                <CardTitle>{t('Chart')}</CardTitle>
                                <Button onClick={() => chartMutation.mutate()} disabled={!chartState || chartMutation.isPending}>
                                    {chartMutation.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                                    {t('SaveChart')}
                                </Button>
                            </CardHeader>
                            <CardContent className="min-h-0 flex-1">
                                <ArtifactCharts
                                    rows={(chartRowsQuery.data?.rows ?? []).map(row => ({ rowData: row }))}
                                    columnsRaw={chartRowsQuery.data?.columns ?? artifact.resultSet?.columns}
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

                    {artifact.type === 'result_set' && !showChartBuilder && artifact.sourceResultSetId ? (
                        <ArtifactResultTable
                            artifactId={artifact.id}
                            resultSetId={artifact.sourceResultSetId}
                            columns={artifact.resultSet?.columns ?? []}
                            rowCount={artifact.rowCount}
                        />
                    ) : null}
                </div>
            </main>
        </div>
    );
}

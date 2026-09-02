'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BarChart3, Bot, Check, Database, Download, FileText, Loader2, MoreHorizontal, PanelTop, Pencil, Pin, PinOff, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { executeActionClient } from '@/lib/actions/client';
import { buildArtifactHandoffPrompt } from '@/lib/artifacts/handoff-prompt';
import { buildArtifactWorkspacePath } from '@/lib/artifacts/workspace-url';
import { SmartCodeBlock } from '@/components/@dory/ui/code-block/code-block';
import { DataSourceCell } from '@/components/data-source/data-source-cell';
import type { ArtifactChartState, ArtifactDetail } from '@/lib/artifacts/types';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/registry/new-york-v4/ui/alert-dialog';
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

function CompactMetadata({ artifact }: { artifact: ArtifactDetail }) {
    const t = useTranslations('Artifacts.Viewer');
    const metadata = [
        t(`Types.${artifact.type}`),
        artifact.rowCount == null ? null : t('RowsCount', { count: artifact.rowCount.toLocaleString() }),
        t('SnapshotStatus'),
    ].filter(Boolean);
    return (
        <div className="text-sm text-muted-foreground">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {metadata.map((item, index) => (
                    <span key={item} className="flex items-center gap-x-2">
                        {index > 0 ? <span aria-hidden="true">·</span> : null}
                        <span>{item}</span>
                    </span>
                ))}
            </div>
        </div>
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
    const [deleteOpen, setDeleteOpen] = useState(false);
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
    const deleteMutation = useMutation({
        mutationFn: () => executeActionClient<{ id: string; title: string }>('artifact.delete', { artifactId }, { organizationId }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['artifacts', organizationId] });
            toast.success(t('Deleted'));
            router.push(`/${encodeURIComponent(organization)}/artifacts`);
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('ActionFailed')),
    });

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
            <main className="container mx-auto flex h-full min-h-0 flex-col gap-3 px-12 pb-6 pt-4 lg:px-12 xl:px-8 2xl:px-4">
                <Button asChild variant="ghost" size="sm" className="w-fit -ml-2">
                    <Link href={`/${encodeURIComponent(organization)}/artifacts`}>
                        <ArrowLeft className="h-4 w-4" />
                        {t('Back')}
                    </Link>
                </Button>
                <header className="shrink-0 space-y-2 border-b pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            {editing ? (
                                <div className="flex max-w-2xl gap-2">
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
                                <button type="button" className="group flex max-w-3xl items-center gap-2 text-left" onClick={() => setEditing(true)}>
                                    <TypeIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <h1 className="truncate text-2xl font-semibold">{artifact.title}</h1>
                                    <Pencil className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-60" />
                                </button>
                            )}
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                                <span>{t('CreatedAt')} · {new Date(artifact.createdAt).toLocaleString()}</span>
                                {artifact.connectionName ? (
                                    <>
                                        <span aria-hidden="true">·</span>
                                        <div className="flex items-center gap-1">
                                            {t('Source')} ·
                                            <DataSourceCell
                                                dataSource={{
                                                    connectionId: artifact.connectionId,
                                                    connectionName: artifact.connectionName,
                                                }}
                                                className="-my-0.5"
                                            />
                                        </div>
                                    </>
                                ) : null}
                            </div>
                            <CompactMetadata artifact={artifact} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {artifact.workspaceTarget ? (
                                <Button asChild>
                                    <Link href={buildArtifactWorkspacePath(organization, artifact.id, artifact.workspaceTarget.connectionId)}>
                                        <PanelTop />
                                        {t('OpenInWorkspace')}
                                    </Link>
                                </Button>
                            ) : null}
                            <Button variant="outline" onClick={continueWithAgent}>
                                <Bot />
                                {t('ContinueWithAgent')}
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="icon" aria-label={t('MoreActions')}>
                                        <MoreHorizontal />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    {artifact.sourceResultSetId ? (
                                        <DropdownMenuItem onSelect={() => (artifact.pinnedAt ? unpinMutation.mutate() : pinMutation.mutate())}>
                                            {artifact.pinnedAt ? <PinOff /> : <Pin />}
                                            {artifact.pinnedAt ? t('Unpin') : t('Pin')}
                                        </DropdownMenuItem>
                                    ) : null}
                                    {artifact.type === 'file' && artifact.downloadUrl ? (
                                        <DropdownMenuItem asChild>
                                            <a href={artifact.downloadUrl}>
                                                <Download />
                                                {t('Download')}
                                            </a>
                                        </DropdownMenuItem>
                                    ) : null}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                                        <Trash2 />
                                        {t('Delete')}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                    <Card>
                        <CardContent className={artifact.resultSet?.sql ? 'grid gap-6 p-4 text-sm lg:grid-cols-2' : 'grid gap-4 p-4 text-sm'}>
                            <div className="grid content-start gap-4">
                                {artifact.workId ? (
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('ProducedBy')}</span>
                                        <Link href={`/${encodeURIComponent(organization)}/agent-runs/${encodeURIComponent(artifact.workId)}?fromArtifact=${encodeURIComponent(artifact.id)}`} className="font-medium text-primary hover:underline">
                                            {t('AgentRun', { title: artifact.runTitle ?? artifact.workId })}
                                        </Link>
                                    </div>
                                ) : null}
                                <div className="grid gap-2">
                                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('EvidenceFor')}</span>
                                    {artifact.usedBy.length ? (
                                        artifact.usedBy.map(finding => (
                                            <Link key={finding.findingId} href={`/${encodeURIComponent(organization)}/agent-runs/${encodeURIComponent(finding.workId)}?fromArtifact=${encodeURIComponent(artifact.id)}`} className="text-primary hover:underline">
                                                {finding.title}
                                            </Link>
                                        ))
                                    ) : (
                                        <span className="text-muted-foreground">{t('NoEvidence')}</span>
                                    )}
                                </div>
                            </div>
                            {artifact.resultSet?.sql ? (
                                <div className="min-w-0 border-t pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                                    <SmartCodeBlock label={t('SourceQuery')} value={artifact.resultSet.sql} type="sql" maxHeightClassName="max-h-64" variant="bare" />
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>
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
                            <CardContent className="flex min-h-0 flex-1 flex-col">
                                <ArtifactCharts
                                    className="min-h-0"
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
                                    onSaveArtifact={() => chartMutation.mutate()}
                                    saveArtifactLabel={t('SaveChart')}
                                    saveArtifactPending={chartMutation.isPending}
                                    saveArtifactDisabled={!chartState}
                                    saveArtifactPlacement="inline"
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
                            onCreateChart={() => setShowChartBuilder(true)}
                            onExport={format => exportMutation.mutate(format)}
                            exportPending={exportMutation.isPending}
                        />
                    ) : null}
                </div>
            </main>
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('DeleteDialog.Title')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('DeleteDialog.Description', { title: artifact.title })}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteMutation.isPending}>{t('DeleteDialog.Cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => deleteMutation.mutate()}
                            disabled={deleteMutation.isPending}
                        >
                            {deleteMutation.isPending ? <Loader2 className="animate-spin" /> : null}
                            {t('DeleteDialog.Confirm')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

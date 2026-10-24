'use client';

import dynamic from 'next/dynamic';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { Download, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { executeActionClient } from '@/lib/actions/client';
import { getPreviewColumnNames } from '@/lib/agent-runs/report';
import type { ArtifactDetail } from '@/lib/artifacts/types';
import { SqlResultBody } from '@/components/@dory/ui/ai/sql-result';
import { SmartCodeBlock } from '@/components/@dory/ui/code-block/code-block';
import { SavedSqlDetail } from '@/components/agent-runs/chat-tool-activity';
import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';

const ArtifactCharts = dynamic(() => import('@/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts').then(module => module.Charts), {
    ssr: false,
    loading: () => <Skeleton className="h-96 w-full" />,
});

const PAGE_SIZE = 100;
type RowsOutput = { rows: Record<string, unknown>[]; rowCount: number | null; columns: unknown[]; dataAvailability: string };

export function AgentQueryPreview({ workId, sessionId }: { workId: string; sessionId: string }) {
    return (
        <div className="h-full space-y-4 overflow-auto p-5" data-testid="agent-query-preview">
            <h2 className="text-lg font-medium">Queries</h2>
            <SavedSqlDetail workId={workId} sessionId={sessionId} open onCopySql={sql => navigator.clipboard.writeText(sql)} />
        </div>
    );
}

export function AgentArtifactPreview({ artifactId, page, onPageChange }: { artifactId: string; page: number; onPageChange: (page: number) => void }) {
    const organizationId = useOrganizationId();
    const t = useTranslations('WorkDocuments.Resources');
    const artifactsT = useTranslations('Artifacts');
    const viewerT = useTranslations('Artifacts.Viewer');
    const runsT = useTranslations('AgentRuns');
    const detail = useQuery({
        queryKey: ['artifact', organizationId, artifactId],
        queryFn: ({ signal }) => executeActionClient<ArtifactDetail>('artifact.get', { artifactId }, { organizationId, signal }),
    });
    const artifact = detail.data;
    const resultSetId = artifact?.sourceResultSetId;
    const rows = useQuery({
        queryKey: ['agent-artifact-preview-rows', organizationId, artifactId, resultSetId, page],
        enabled: Boolean(resultSetId && artifact?.status === 'ready'),
        queryFn: ({ signal }) => executeActionClient<RowsOutput>('resultSet.rows.read', { resultSetId, offset: page * PAGE_SIZE, limit: PAGE_SIZE }, { organizationId, signal }),
    });
    if (detail.isPending)
        return (
            <div role="status" className="flex items-center gap-2 p-5">
                <Loader2 className="size-4 animate-spin" />
                {t('Loading')}
            </div>
        );
    if (detail.isError)
        return (
            <div role="alert" className="space-y-3 p-5">
                <p>{t('LoadFailed')}</p>
                <Button variant="outline" onClick={() => void detail.refetch()}>
                    {t('Retry')}
                </Button>
            </div>
        );
    if (!artifact) return null;
    const data = rows.data;
    const rowCount = data?.rowCount ?? artifact.rowCount ?? 0;
    const pages = Math.max(1, Math.ceil(rowCount / PAGE_SIZE));
    const columns = getPreviewColumnNames(data?.columns ?? artifact.resultSet?.columns ?? [], data?.rows ?? []);
    return (
        <div className="h-full space-y-5 overflow-auto p-5" data-testid="agent-artifact-preview">
            <header className="space-y-2">
                <h2 className="break-words text-lg font-medium">{artifact.title}</h2>
                <p className="text-sm text-muted-foreground">
                    {[artifactsT(`Types.${artifact.type}`), artifact.connectionName, artifact.rowCount != null ? runsT('Counts.Rows', { count: artifact.rowCount }) : null]
                        .filter(Boolean)
                        .join(' · ')}
                </p>
            </header>
            {artifact.status === 'unavailable' ? (
                <p role="status" className="text-muted-foreground">
                    {artifactsT('Statuses.unavailable')}
                </p>
            ) : null}
            {artifact.resultSet?.sql ? (
                <SmartCodeBlock label={viewerT('SourceQuery')} value={artifact.resultSet.sql} type="sql" variant="bare" maxHeightClassName="max-h-48" />
            ) : null}
            {artifact.type === 'file' ? (
                <div className="space-y-3 rounded-lg border p-4">
                    <p className="break-words font-medium">{artifact.fileName}</p>
                    <p className="text-sm text-muted-foreground">{viewerT('FileDescription', { format: artifact.fileFormat?.toUpperCase() ?? '' })}</p>
                    {artifact.downloadUrl && artifact.status === 'ready' ? (
                        <Button asChild variant="outline">
                            <a href={artifact.downloadUrl} download>
                                <Download className="size-4" />
                                {viewerT('Download')}
                            </a>
                        </Button>
                    ) : null}
                </div>
            ) : null}
            {resultSetId && artifact.status === 'ready' ? (
                rows.isPending ? (
                    <p role="status">{viewerT('LoadingRows')}</p>
                ) : rows.isError ? (
                    <div role="alert" className="space-y-3">
                        <p>{t('LoadFailed')}</p>
                        <Button variant="outline" onClick={() => void rows.refetch()}>
                            {t('Retry')}
                        </Button>
                    </div>
                ) : data?.dataAvailability === 'none' ? (
                    <p>{runsT('Report.PreviewUnavailable')}</p>
                ) : (
                    <>
                        {artifact.type === 'chart' ? (
                            <div className="h-[28rem] min-w-0" data-testid="agent-artifact-chart">
                                <ArtifactCharts
                                    rows={(data?.rows ?? []).map(row => ({ rowData: row }))}
                                    columnsRaw={data?.columns ?? artifact.resultSet?.columns}
                                    initialState={artifact.chartState ?? undefined}
                                    stateKey={`agent-preview:${artifact.id}`}
                                    stateSyncEnabled={false}
                                    remoteSource={{
                                        cacheKey: `${resultSetId}:agent-preview`,
                                        readChart: (state, signal) =>
                                            executeActionClient(
                                                'resultSet.chart.read',
                                                { resultSetId, xKey: state.xKey, yKey: state.yKey, groupKey: state.groupKey, chartType: state.chartType },
                                                { organizationId, signal },
                                            ),
                                    }}
                                />
                            </div>
                        ) : (
                            <>
                                <SqlResultBody
                                    embedded
                                    onManualExecute={() => undefined}
                                    manualPrimaryAction={<></>}
                                    manualMenuActions={<></>}
                                    result={{
                                        type: 'sql-result',
                                        ok: true,
                                        sql: artifact.resultSet?.sql ?? '',
                                        database: null,
                                        columns: columns.map(name => ({ name, type: null })),
                                        previewRows: data?.rows ?? [],
                                        rowCount,
                                    }}
                                />
                                {data?.dataAvailability === 'full' && pages > 1 ? (
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
                                            {viewerT('Previous')}
                                        </Button>
                                        <span className="text-sm text-muted-foreground">{viewerT('Page', { page: page + 1, pages })}</span>
                                        <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => onPageChange(page + 1)}>
                                            {viewerT('Next')}
                                        </Button>
                                    </div>
                                ) : null}
                            </>
                        )}
                        {data?.dataAvailability !== 'full' ? (
                            <p className="text-xs text-muted-foreground">{runsT('Report.SavedPreview', { count: data?.rows.length ?? 0 })}</p>
                        ) : null}
                    </>
                )
            ) : null}
        </div>
    );
}

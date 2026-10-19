'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, ChevronDown, Database } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { SmartCodeBlock } from '@/components/@dory/ui/code-block/code-block';
import { AgentRunVerifiedQueryButton } from '@/components/knowledge/agent-run-verified-query-button';
import { executeActionClient } from '@/lib/actions/client';
import { formatPreviewValue, getPreviewColumnNames } from '@/lib/agent-runs/report';
import type { ArtifactDetail } from '@/lib/artifacts/types';
import { buildArtifactWorkspacePath } from '@/lib/artifacts/workspace-url';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/registry/new-york-v4/ui/table';

const PREVIEW_LIMIT = 8;

type EvidenceArtifact = { id: string; title: string; type: string; rowCount: number | null; sourceResultSetId?: string | null };
type PreviewRows = { rows: Record<string, unknown>[]; columns: unknown[]; rowCount: number | null; dataAvailability: string };

export function AgentRunEvidence({ artifact, organization, workId }: { artifact: EvidenceArtifact; organization: string; workId: string }) {
    const t = useTranslations('AgentRuns');
    const artifactsT = useTranslations('Artifacts.Viewer');
    const organizationId = useOrganizationId();
    const detailQuery = useQuery({
        queryKey: ['artifact', organizationId, artifact.id],
        queryFn: ({ signal }) => executeActionClient<ArtifactDetail>('artifact.get', { artifactId: artifact.id }, { organizationId, signal }),
    });
    const detail = detailQuery.data;
    const resultSetId = artifact.sourceResultSetId ?? detail?.sourceResultSetId;
    const previewQuery = useQuery({
        queryKey: ['agent-run-evidence-rows', organizationId, resultSetId, PREVIEW_LIMIT],
        enabled: Boolean(resultSetId && artifact.type === 'result_set'),
        queryFn: ({ signal }) => executeActionClient<PreviewRows>('resultSet.rows.read', { resultSetId, offset: 0, limit: PREVIEW_LIMIT }, { organizationId, signal }),
    });
    const preview = previewQuery.data;
    const columns = getPreviewColumnNames(preview?.columns ?? detail?.resultSet?.columns ?? [], preview?.rows ?? []);
    const rowCount = preview?.rowCount ?? artifact.rowCount;
    const href = `/${encodeURIComponent(organization)}/artifacts/${encodeURIComponent(artifact.id)}?fromAgentRun=${encodeURIComponent(workId)}`;
    const displayTitle = /^\s*(?:select|with)\b/i.test(artifact.title) ? t('Report.SavedResult') : artifact.title;
    const isResultSet = artifact.type === 'result_set';
    const sql = detail?.resultSet?.sql;

    return (
        <div className="min-w-0 space-y-4" data-testid="agent-run-evidence">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <Link href={href} className="flex min-w-0 items-start gap-2 font-medium hover:underline">
                    <Database className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="break-words">{displayTitle}</span>
                </Link>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{artifactsT(`Types.${artifact.type === 'chart' ? 'chart' : artifact.type === 'file' ? 'file' : 'result_set'}`)}</span>
                    {rowCount != null ? <Badge variant="secondary">{t('Counts.Rows', { count: rowCount })}</Badge> : null}
                    {columns.length ? <span>{t('Report.Columns', { count: columns.length })}</span> : null}
                </div>
            </div>
            {isResultSet ? (
                previewQuery.isError || (!resultSetId && detailQuery.isError) ? (
                    <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 p-4 text-sm text-muted-foreground" role="status">
                        {t('Report.PreviewFailed')}
                        <Button variant="outline" size="sm" onClick={() => void (resultSetId ? previewQuery.refetch() : detailQuery.refetch())}>
                            {t('Report.Retry')}
                        </Button>
                    </div>
                ) : previewQuery.isLoading || (detailQuery.isLoading && !resultSetId) ? (
                    <Skeleton className="h-48 w-full" aria-label={t('Report.LoadingPreview')} />
                ) : !preview || preview.dataAvailability === 'none' ? (
                    <p className="rounded-md bg-muted/40 p-4 text-sm text-muted-foreground">{t('Report.PreviewUnavailable')}</p>
                ) : (
                    <div className="space-y-2">
                        <div className="overflow-hidden rounded-md border">
                            <Table>
                                <TableHeader className="bg-muted/40">
                                    <TableRow>
                                        {columns.map(column => (
                                            <TableHead key={column} scope="col" className="whitespace-nowrap">
                                                {column}
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {preview.rows.map((row, index) => (
                                        <TableRow key={index}>
                                            {columns.map(column => {
                                                const value = formatPreviewValue(row[column]);
                                                return (
                                                    <TableCell key={column} className="max-w-72 truncate tabular-nums" title={value}>
                                                        {value}
                                                    </TableCell>
                                                );
                                            })}
                                        </TableRow>
                                    ))}
                                    {!preview.rows.length ? (
                                        <TableRow>
                                            <TableCell colSpan={Math.max(columns.length, 1)} className="h-20 text-center text-muted-foreground">
                                                {t('Report.NoRows')}
                                            </TableCell>
                                        </TableRow>
                                    ) : null}
                                </TableBody>
                            </Table>
                        </div>
                        <p className="text-xs leading-5 text-muted-foreground">
                            {preview.dataAvailability !== 'full'
                                ? t('Report.SavedPreview', { count: preview.rows.length })
                                : rowCount != null && preview.rows.length >= rowCount
                                  ? t('Report.AllRows', { count: preview.rows.length })
                                  : t('Report.FirstRows', { count: preview.rows.length })}
                        </p>
                    </div>
                )
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
                <Button asChild variant="outline" size="sm">
                    <Link href={href}>
                        {t('Findings.ViewResult')}
                        <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                </Button>
                {detail?.workspaceTarget ? (
                    <Button asChild variant="ghost" size="sm">
                        <Link href={buildArtifactWorkspacePath(organization, artifact.id, detail.workspaceTarget.connectionId)}>
                            {t('Report.ContinueWorkspace')}
                            <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                    </Button>
                ) : null}
            </div>
            {detailQuery.isError && resultSetId ? (
                <p className="text-xs text-muted-foreground" role="status">
                    {t('Report.DetailsFailed')}{' '}
                    <button className="underline" onClick={() => void detailQuery.refetch()}>
                        {t('Report.Retry')}
                    </button>
                </p>
            ) : null}
            {sql ? (
                <details className="group border-t pt-3">
                    <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm text-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                        {t('Findings.ViewSql')}
                    </summary>
                    <div className="mt-3 space-y-3">
                        <SmartCodeBlock value={sql} type="sql" maxHeightClassName="max-h-72" variant="bare" />
                        {detail?.connectionId ? <AgentRunVerifiedQueryButton connectionId={detail.connectionId} sql={sql} workId={workId} title={artifact.title} /> : null}
                    </div>
                </details>
            ) : null}
            <details className="group text-xs text-muted-foreground">
                <summary className="w-fit cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">{t('Report.EvidenceDetails')}</summary>
                <dl className="mt-2 grid gap-2 break-all rounded-md bg-muted/30 p-3">
                    <div>
                        <dt className="inline font-medium">Artifact ID · </dt>
                        <dd className="inline">{artifact.id}</dd>
                    </div>
                    {detail?.connectionName ? (
                        <div>
                            <dt className="inline font-medium">{t('Metrics.DataSource')} · </dt>
                            <dd className="inline">{detail.connectionName}</dd>
                        </div>
                    ) : null}
                </dl>
            </details>
        </div>
    );
}

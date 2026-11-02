'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { WorkDocumentView } from '@dory/shared/types/work-document';
import type { ReportEvidenceInspection, ReportEvidenceReference, ReportEvidenceRows } from '@dory/shared/types/report-workspace';
import { useTranslations } from 'next-intl';
import { createSerializer, parseAsInteger, parseAsString } from 'nuqs';
import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { executeActionClient } from '@/lib/actions/client';
import { reportEvidenceGroupText } from '@/lib/work-documents/evidence-groups';
import { formatWorkValue } from '@/lib/work-documents/render';
import { buildReportWorkspacePath } from '@/lib/work-documents/workspace-url';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/registry/new-york-v4/ui/sheet';
import { SnapshotTable } from './report-body';

const artifactUrl = createSerializer({ report: parseAsString, revision: parseAsInteger, publication: parseAsString, snapshot: parseAsString });

export type ReportEvidenceSelection = { artifactId: string } | { groupId: string };

function EvidenceData({
    inspection,
    reference,
    organization,
    onBeforeNavigate,
}: {
    inspection: ReportEvidenceInspection;
    reference: ReportEvidenceReference;
    organization: string;
    onBeforeNavigate: (href: string) => void;
}) {
    const t = useTranslations('WorkDocuments.Evidence');
    const reportT = useTranslations('WorkDocuments.Report');
    const organizationId = useOrganizationId();
    const [mode, setMode] = useState<'snapshot' | 'full'>('snapshot');
    const [page, setPage] = useState(0);
    const full = useQuery({
        queryKey: ['report-evidence-rows', organizationId, reference, page],
        enabled: mode === 'full' && inspection.fullResultAvailable,
        retry: false,
        queryFn: ({ signal }) => executeActionClient<ReportEvidenceRows>('report.evidence.rows', { ...reference, offset: page * 25, limit: 25 }, { organizationId, signal }),
    });
    const { evidence } = inspection;
    const source =
        evidence.attachmentSource?.files
            .map(file => file.filename)
            .filter((name, index, all) => all.indexOf(name) === index)
            .join(', ') ||
        evidence.connectionName ||
        evidence.title;
    const artifactHref = artifactUrl(`/${encodeURIComponent(organization)}/artifacts/${encodeURIComponent(evidence.artifactId)}`, {
        report: reference.documentId,
        revision: reference.revision,
        publication: reference.publicationId ?? null,
        snapshot: evidence.snapshotId ?? null,
    });
    const pages = Math.max(1, Math.ceil((full.data?.rowCount ?? 0) / 25));
    return (
        <section className="min-w-0 space-y-4" data-testid="report-evidence-data">
            <div className="space-y-1 text-sm">
                <h3 className="font-medium">{evidence.title}</h3>
                <p className="break-words text-muted-foreground">{source}</p>
                <p className="text-muted-foreground">{t('CapturedAt', { time: new Date(evidence.capturedAt).toLocaleString() })}</p>
                <p>
                    {evidence.rowCount == null ? t('UnknownRange', { shown: evidence.rows.length }) : t('DisplayRange', { shown: evidence.rows.length, total: evidence.rowCount })}
                </p>
                <p className="text-muted-foreground">{t(inspection.fullResultAvailable ? 'FullAvailable' : 'SnapshotOnly')}</p>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('Title')}>
                <Button size="sm" variant={mode === 'snapshot' ? 'secondary' : 'outline'} aria-pressed={mode === 'snapshot'} onClick={() => setMode('snapshot')}>
                    {t('Snapshot')}
                </Button>
                <Button
                    size="sm"
                    variant={mode === 'full' ? 'secondary' : 'outline'}
                    aria-pressed={mode === 'full'}
                    disabled={!inspection.fullResultAvailable}
                    onClick={() => setMode('full')}
                >
                    {t('FullResult')}
                </Button>
            </div>
            <div className="work-prose min-w-0">
                {mode === 'snapshot' ? (
                    <SnapshotTable evidence={evidence} />
                ) : full.isPending ? (
                    <p role="status">{t('Loading')}</p>
                ) : full.isError ? (
                    <p role="alert" className="text-destructive">
                        {t('FullFailed')}
                    </p>
                ) : full.data ? (
                    <>
                        <div className="work-table-scroll" tabIndex={0}>
                            <table>
                                <thead>
                                    <tr>
                                        {full.data.columns.map(column => (
                                            <th key={column}>{column}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {full.data.rows.map((row, index) => (
                                        <tr key={index}>
                                            {full.data.columns.map(column => (
                                                <td key={column}>{formatWorkValue(row[column])}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {full.data.rowCount === 0 ? <p className="text-sm text-muted-foreground">{t('NoRows')}</p> : null}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <Button variant="outline" size="sm" disabled={!page} onClick={() => setPage(previous => previous - 1)}>
                                {reportT('Previous')}
                            </Button>
                            <span>{full.data.rowCount == null ? t('PageUnknown', { page: page + 1 }) : t('Page', { page: page + 1, pages })}</span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={full.data.rowCount == null ? full.data.rows.length < 25 : page + 1 >= pages}
                                onClick={() => setPage(previous => previous + 1)}
                            >
                                {reportT('Next')}
                            </Button>
                        </div>
                    </>
                ) : null}
            </div>
            {evidence.sql ? (
                <details className="rounded-md border p-3">
                    <summary className="cursor-pointer text-sm font-medium">{t('SourceQuery')}</summary>
                    <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">
                        <code>{evidence.sql}</code>
                    </pre>
                    <p className="mt-2 text-xs text-muted-foreground">{t('QueryScope')}</p>
                </details>
            ) : null}
            <div className="flex flex-wrap gap-2">
                {inspection.artifactAvailable ? (
                    <Button variant="outline" size="sm" asChild>
                        <Link
                            data-report-evidence-navigation
                            href={artifactHref}
                            onClick={event => {
                                event.preventDefault();
                                onBeforeNavigate(artifactHref);
                            }}
                        >
                            {t('OpenArtifact')}
                        </Link>
                    </Button>
                ) : null}
                {inspection.canOpenWorkspace ? (
                    <Button variant="outline" size="sm" asChild>
                        <Link
                            data-report-evidence-navigation
                            href={buildReportWorkspacePath(organization, reference)}
                            onClick={event => {
                                event.preventDefault();
                                onBeforeNavigate(buildReportWorkspacePath(organization, reference));
                            }}
                        >
                            {t('OpenWorkspace')}
                        </Link>
                    </Button>
                ) : null}
            </div>
        </section>
    );
}

export function ReportEvidencePanel({
    document,
    selection,
    organization,
    onClose,
    onBeforeNavigate,
}: {
    document: WorkDocumentView;
    selection: ReportEvidenceSelection;
    organization: string;
    onClose: () => void;
    onBeforeNavigate: (href: string) => void;
}) {
    const t = useTranslations('WorkDocuments.Evidence');
    const organizationId = useOrganizationId();
    const [selectedIndex, setSelectedIndex] = useState(0);
    const group = 'groupId' in selection ? document.content.evidenceGroups?.find(item => item.id === selection.groupId) : undefined;
    const references = 'artifactId' in selection ? [{ artifactId: selection.artifactId, explanation: undefined }] : (group?.references ?? []);
    const entries = references.map(item => ({
        item,
        saved: document.content.evidence.some(evidence => evidence.artifactId === item.artifactId),
        reference: {
            documentId: document.id,
            revision: document.revision,
            publicationId: document.publication?.id,
            artifactId: item.artifactId,
            snapshotId: document.content.evidence.find(evidence => evidence.artifactId === item.artifactId)?.snapshotId,
        },
    }));
    const queries = useQueries({
        queries: entries.map(({ reference, saved }) => ({
            queryKey: ['report-evidence-inspection', organizationId, reference],
            enabled: saved,
            retry: false,
            queryFn: ({ signal }: { signal: AbortSignal }) => executeActionClient<ReportEvidenceInspection>('report.evidence.inspect', reference, { organizationId, signal }),
        })),
    });
    const index = selectedIndex < entries.length ? selectedIndex : 0;
    const selected = queries[index];
    return (
        <Sheet
            open
            onOpenChange={open => {
                if (!open) onClose();
            }}
        >
            <SheetContent className="w-full overflow-y-auto sm:max-w-3xl" data-testid="report-evidence-panel">
                <SheetHeader className="pr-10">
                    <SheetTitle>{t(group ? 'SupportingEvidence' : 'Title')}</SheetTitle>
                    <SheetDescription>{document.title}</SheetDescription>
                </SheetHeader>
                <div className="min-w-0 space-y-5 px-4 pb-6">
                    {group ? (
                        <>
                            <blockquote className="border-l-2 pl-3 text-sm">{reportEvidenceGroupText(document.content.body ?? document.content.markdown, group.id)}</blockquote>
                            {group.needsReview ? (
                                <p role="status" className="text-sm text-muted-foreground">
                                    {t('ReviewRequired')}
                                </p>
                            ) : null}
                            <div className="grid gap-2" role="group" aria-label={t('SupportingEvidence')}>
                                {entries.map(({ item }, entryIndex) => (
                                    <Button
                                        key={item.artifactId}
                                        variant={entryIndex === index ? 'secondary' : 'outline'}
                                        className="h-auto justify-start whitespace-normal py-2 text-left"
                                        aria-pressed={entryIndex === index}
                                        onClick={() => setSelectedIndex(entryIndex)}
                                    >
                                        {queries[entryIndex].data?.evidence.title ?? t('EvidenceNumber', { number: entryIndex + 1 })}
                                    </Button>
                                ))}
                            </div>
                            {selected?.data && entries[index]?.item.explanation ? <p className="text-sm">{entries[index].item.explanation}</p> : null}
                        </>
                    ) : null}
                    {entries[index] && !entries[index].saved ? (
                        <p role="status" className="text-sm text-muted-foreground">
                            {t('PendingSnapshot')}
                        </p>
                    ) : selected?.isPending ? (
                        <p role="status">{t('Loading')}</p>
                    ) : selected?.data ? (
                        <EvidenceData
                            key={`${entries[index].item.artifactId}:${entries[index].reference.snapshotId}`}
                            inspection={selected.data}
                            reference={entries[index].reference}
                            organization={organization}
                            onBeforeNavigate={onBeforeNavigate}
                        />
                    ) : (
                        <p role="alert" className="text-sm text-muted-foreground">
                            {t('Restricted')}
                        </p>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}

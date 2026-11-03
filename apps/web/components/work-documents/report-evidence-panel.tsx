'use client';

import { useCallback, useRef, useState, type RefObject } from 'react';
import Link from 'next/link';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { WorkDocumentView } from '@dory/shared/types/work-document';
import type { ReportEvidenceInspection, ReportEvidenceReference, ReportEvidenceRows } from '@dory/shared/types/report-workspace';
import { useTranslations } from 'next-intl';
import { createSerializer, parseAsInteger, parseAsString } from 'nuqs';
import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { executeActionClient } from '@/lib/actions/client';
import { reportEvidenceGroupText } from '@/lib/work-documents/evidence-groups';
import { hasCompleteReportSnapshot, hasQueryLimit } from '@/lib/work-documents/evidence-preview';
import { formatWorkValue } from '@/lib/work-documents/render';
import { buildReportWorkspacePath } from '@/lib/work-documents/workspace-url';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';

const artifactUrl = createSerializer({ report: parseAsString, revision: parseAsInteger, publication: parseAsString, snapshot: parseAsString });
export type ReportEvidenceSelection = { artifactId: string; componentId?: string } | { groupId: string };
const sourceLabel = (evidence: ReportEvidenceInspection['evidence']) =>
    evidence.attachmentSource?.files
        .map(file => file.filename)
        .filter((name, index, all) => all.indexOf(name) === index)
        .join(', ') ||
    evidence.connectionName ||
    evidence.title;

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
    const [filter, setFilter] = useState('');
    const [expanded, setExpanded] = useState(false);
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
    const { evidence } = inspection;
    const complete = hasCompleteReportSnapshot(inspection);
    const switchable = inspection.fullResultAvailable && !complete;
    const fullMode = switchable && mode === 'full';
    const full = useQuery({
        queryKey: ['report-evidence-rows', organizationId, reference, page],
        enabled: fullMode,
        retry: false,
        queryFn: ({ signal }) => executeActionClient<ReportEvidenceRows>('report.evidence.rows', { ...reference, offset: page * 25, limit: 25 }, { organizationId, signal }),
    });
    const loaded = fullMode ? (full.data?.rows ?? []) : evidence.rows;
    const columns = fullMode ? (full.data?.columns ?? []) : evidence.columns;
    const filtered = loaded.filter(row => columns.some(column => formatWorkValue(row[column]).toLocaleLowerCase().includes(filter.toLocaleLowerCase())));
    const rows = fullMode ? filtered : filtered.slice(page * 25, page * 25 + 25);
    const total = fullMode ? full.data?.rowCount : filtered.length;
    const pages = total == null ? null : Math.max(1, Math.ceil(total / 25));
    const paginate = pages == null ? fullMode && (page > 0 || loaded.length === 25) : pages > 1;
    const sql = evidence.sql;
    const [longSql, setLongSql] = useState(false);
    const sqlCallback = useCallback((element: HTMLPreElement | null) => {
        if (!element) return;
        const measure = () => {
            const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
            setLongSql(element.scrollHeight > lineHeight * 5 + 1);
        };
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        measure();
        return () => observer.disconnect();
    }, []);
    const artifactHref = artifactUrl(`/${encodeURIComponent(organization)}/artifacts/${encodeURIComponent(evidence.artifactId)}`, {
        report: reference.documentId,
        revision: reference.revision,
        publication: reference.publicationId ?? null,
        snapshot: evidence.snapshotId ?? null,
    });
    return (
        <section className="flex min-h-0 flex-1 flex-col" data-testid="report-evidence-data">
            <div className="min-h-0 space-y-5 overflow-y-auto px-6 pb-5">
                <div className="space-y-1 text-sm">
                    <h3 className="font-medium">{evidence.title}</h3>
                    <p className="break-words text-muted-foreground">
                        {sourceLabel(evidence)} · {new Date(evidence.capturedAt).toLocaleString()}
                    </p>
                    <p>{complete ? t('CompleteRows', { count: evidence.rows.length }) : t('SnapshotRows', { count: evidence.rows.length })}</p>
                    {!inspection.fullResultAvailable && <p className="text-muted-foreground">{t('SnapshotOnly')}</p>}
                    {evidence.rowCount == null && <p className="text-muted-foreground">{t('UnknownRange', { shown: evidence.rows.length })}</p>}
                    {sql && hasQueryLimit(sql) && (
                        <p className="text-xs text-muted-foreground">
                            {t('QueryLimit')} · {t('QueryScope')}
                        </p>
                    )}
                </div>
                <div className="space-y-2" data-testid="report-source-query">
                    <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-medium">{t('SourceQuery')}</h4>
                        {sql && (
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={async () => {
                                    try {
                                        await navigator.clipboard.writeText(sql);
                                        setCopyStatus('copied');
                                    } catch {
                                        setCopyStatus('error');
                                    }
                                }}
                            >
                                {t(copyStatus === 'copied' ? 'CopiedSql' : 'CopySql')}
                            </Button>
                        )}
                    </div>
                    {sql ? (
                        <>
                            <div className="rounded-md bg-muted p-3">
                                <pre
                                    ref={sqlCallback}
                                    className="overflow-hidden text-xs leading-5 whitespace-pre-wrap break-words"
                                    style={expanded ? undefined : { maxHeight: '6.25rem' }}
                                >
                                    <code>{sql}</code>
                                </pre>
                            </div>
                            {(longSql || expanded) && (
                                <Button variant="ghost" size="sm" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
                                    {t(expanded ? 'CollapseSql' : 'ExpandSql')}
                                </Button>
                            )}
                            {copyStatus === 'error' && (
                                <p role="alert" className="text-sm text-destructive">
                                    {t('CopyFailed')}
                                </p>
                            )}
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground">{t('NoSql')}</p>
                    )}
                </div>
                <div className="space-y-3" data-testid="report-data-preview">
                    <h4 className="text-sm font-medium">{t('DataPreview')}</h4>
                    {switchable && (
                        <div className="flex flex-wrap gap-2" role="group" aria-label={t('Title')}>
                            <Button
                                size="sm"
                                variant={mode === 'snapshot' ? 'secondary' : 'outline'}
                                aria-pressed={mode === 'snapshot'}
                                onClick={() => {
                                    setMode('snapshot');
                                    setPage(0);
                                    setFilter('');
                                }}
                            >
                                {t('SnapshotCount', { count: evidence.rows.length })}
                            </Button>
                            <Button
                                size="sm"
                                variant={mode === 'full' ? 'secondary' : 'outline'}
                                aria-pressed={mode === 'full'}
                                onClick={() => {
                                    setMode('full');
                                    setPage(0);
                                    setFilter('');
                                }}
                            >
                                {evidence.rowCount == null ? t('FullResult') : t('FullCount', { count: evidence.rowCount })}
                            </Button>
                        </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                        {evidence.rowCount == null ? t('UnknownRange', { shown: rows.length }) : t('PreviewRange', { shown: rows.length, total: evidence.rowCount })}
                    </p>
                    <Input
                        value={filter}
                        onChange={event => {
                            setFilter(event.target.value);
                            if (!fullMode) setPage(0);
                        }}
                        aria-label={t('SearchLoaded')}
                        placeholder={t('SearchLoaded')}
                        className="max-w-sm"
                    />
                    {fullMode && full.isPending ? (
                        <p role="status">{t('Loading')}</p>
                    ) : fullMode && full.isError ? (
                        <p role="alert" className="text-destructive">
                            {t('FullFailed')}
                        </p>
                    ) : (
                        <>
                            <div className="work-prose min-w-0">
                                <div className="work-table-scroll" tabIndex={0}>
                                    <table>
                                        <thead>
                                            <tr>
                                                {columns.map(column => (
                                                    <th key={column}>{column}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((row, index) => (
                                                <tr key={index}>
                                                    {columns.map(column => (
                                                        <td key={column}>{formatWorkValue(row[column])}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            {!rows.length && <p className="text-sm text-muted-foreground">{t(evidence.rowCount === 0 ? 'NoRows' : 'NoMatches')}</p>}
                            {paginate && (
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={!page}
                                        onClick={() => {
                                            setPage(page - 1);
                                            if (fullMode) setFilter('');
                                        }}
                                    >
                                        {reportT('Previous')}
                                    </Button>
                                    <span>{pages === null ? t('PageUnknown', { page: page + 1 }) : t('Page', { page: page + 1, pages })}</span>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={pages === null ? loaded.length < 25 : page + 1 >= pages}
                                        onClick={() => {
                                            setPage(page + 1);
                                            if (fullMode) setFilter('');
                                        }}
                                    >
                                        {reportT('Next')}
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
            {(inspection.artifactAvailable || inspection.canOpenWorkspace) && (
                <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-card px-6 py-4">
                    {inspection.artifactAvailable && (
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
                    )}
                    {inspection.canOpenWorkspace && (
                        <Button size="sm" asChild>
                            <Link
                                data-report-evidence-navigation
                                href={buildReportWorkspacePath(organization, reference)}
                                onClick={event => {
                                    event.preventDefault();
                                    onBeforeNavigate(buildReportWorkspacePath(organization, reference));
                                }}
                            >
                                {t('EditSql')}
                            </Link>
                        </Button>
                    )}
                </div>
            )}
        </section>
    );
}

export function ReportEvidencePanel({
    document,
    selection,
    organization,
    onClose,
    onBeforeNavigate,
    returnFocusRef,
}: {
    document: WorkDocumentView;
    selection: ReportEvidenceSelection;
    organization: string;
    onClose: () => void;
    onBeforeNavigate: (href: string) => void;
    returnFocusRef?: RefObject<HTMLElement | null>;
}) {
    const t = useTranslations('WorkDocuments.Evidence');
    const organizationId = useOrganizationId();
    const [selectedIndex, setSelectedIndex] = useState<number | null>('artifactId' in selection ? 0 : null);
    const list = useRef<HTMLDivElement>(null);
    const scroll = useRef(0);
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
            ...('componentId' in selection ? { componentId: selection.componentId } : {}),
            ...(group ? { groupId: group.id } : {}),
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
    const index = selectedIndex ?? 0;
    const selected = queries[index];
    return (
        <Dialog
            open
            onOpenChange={open => {
                if (!open) onClose();
            }}
        >
            <DialogContent
                className="flex max-h-[90dvh] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[960px]"
                data-testid="report-evidence-panel"
                onCloseAutoFocus={event => {
                    if (returnFocusRef?.current?.isConnected) {
                        event.preventDefault();
                        returnFocusRef.current.focus({ preventScroll: true });
                    }
                }}
            >
                <DialogHeader className="shrink-0 px-6 pt-6 pb-4 pr-12">
                    <DialogTitle>{t(group ? 'SupportingEvidence' : 'Title')}</DialogTitle>
                    <DialogDescription>{document.title}</DialogDescription>
                </DialogHeader>
                {group && selectedIndex !== null && (
                    <div className="shrink-0 px-6 pb-3">
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                                const oldIndex = selectedIndex;
                                setSelectedIndex(null);
                                requestAnimationFrame(() => {
                                    if (list.current) {
                                        list.current.scrollTop = scroll.current;
                                        list.current.querySelector<HTMLElement>(`[data-choice="${oldIndex}"]`)?.focus({ preventScroll: true });
                                    }
                                });
                            }}
                        >
                            {t('BackToEvidence')}
                        </Button>
                    </div>
                )}
                {group && selectedIndex === null ? (
                    <div ref={list} className="min-h-0 space-y-4 overflow-y-auto px-6 pb-6">
                        <blockquote className="border-l-2 pl-3 text-sm">{reportEvidenceGroupText(document.content.body ?? document.content.markdown, group.id)}</blockquote>
                        {group.needsReview && (
                            <p role="status" className="text-sm text-muted-foreground">
                                {t('ReviewRequired')}
                            </p>
                        )}
                        {entries.map(({ item, saved }, entryIndex) => {
                            const query = queries[entryIndex];
                            return (
                                <Button
                                    key={item.artifactId}
                                    data-choice={entryIndex}
                                    variant="outline"
                                    className="h-auto w-full flex-col items-start gap-1 whitespace-normal p-3 text-left"
                                    onClick={() => {
                                        scroll.current = list.current?.scrollTop ?? 0;
                                        setSelectedIndex(entryIndex);
                                    }}
                                >
                                    <span className="font-medium">{query.data?.evidence.title ?? t('EvidenceNumber', { number: entryIndex + 1 })}</span>
                                    {query.data ? (
                                        <>
                                            <span className="text-xs text-muted-foreground">
                                                {sourceLabel(query.data.evidence)} · {new Date(query.data.evidence.capturedAt).toLocaleString()}
                                            </span>
                                            {item.explanation && <span className="text-sm font-normal">{item.explanation}</span>}
                                        </>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">{t(!saved ? 'PendingSnapshot' : query.isPending ? 'Loading' : 'Restricted')}</span>
                                    )}
                                </Button>
                            );
                        })}
                    </div>
                ) : entries[index] && !entries[index].saved ? (
                    <p role="status" className="px-6 pb-6 text-sm">
                        {t('PendingSnapshot')}
                    </p>
                ) : selected?.isPending ? (
                    <p role="status" className="px-6 pb-6">
                        {t('Loading')}
                    </p>
                ) : selected?.data ? (
                    <>
                        {group && entries[index].item.explanation && <p className="shrink-0 px-6 pb-3 text-sm">{entries[index].item.explanation}</p>}
                        <EvidenceData
                            key={`${entries[index].item.artifactId}:${entries[index].reference.snapshotId}`}
                            inspection={selected.data}
                            reference={entries[index].reference}
                            organization={organization}
                            onBeforeNavigate={onBeforeNavigate}
                        />
                    </>
                ) : (
                    <p role="alert" className="px-6 pb-6 text-sm text-muted-foreground">
                        {t('Restricted')}
                    </p>
                )}
            </DialogContent>
        </Dialog>
    );
}

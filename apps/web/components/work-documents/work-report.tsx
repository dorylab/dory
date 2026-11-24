'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { cn } from '@/registry/new-york-v4/lib/utils';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/registry/new-york-v4/ui/alert-dialog';
import { Button } from '@/registry/new-york-v4/ui/button';
import type { WorkDocumentView } from '@dory/shared/types/work-document';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { createSerializer, parseAsInteger, parseAsString, useQueryState, useQueryStates } from 'nuqs';
import { toast } from 'sonner';

import { workRequest } from '@/lib/work-documents/client';
import { reportListParsers, serializeReportList } from '@/lib/work-documents/list-state';
import { renderWorkHtml } from '@/lib/work-documents/render';
import { editableReport, parseReport, reportEmbeds } from '@/lib/work-documents/report-core';
import type { ReportMode } from '@/lib/work-documents/report-blocks';
import { reportRunWorkspacePath } from '@/lib/work-documents/workspace-url';
import type { AgentWorkspaceTarget } from '@/lib/agent-runs/workspace-url';

import { AddDefinitionDialog } from './add-definition-dialog';
import { ReportBody } from './report-body';
import type { ReportEditorHandle } from './report-editor';
import type { ReportEvidenceSelection } from './report-evidence-panel';
import { ReportSelectionPopover } from './report-selection-popover';
import { ReportToolbar } from './report-toolbar';

const ReportEditor = dynamic(() => import('./report-editor'), { ssr: false });
const ReportEvidencePanel = dynamic(() => import('./report-evidence-panel').then(module => module.ReportEvidencePanel), { ssr: false });
const continueUrl = createSerializer({ document: parseAsString, revision: parseAsInteger, chat: parseAsString });

type Detail = {
    workspace: (AgentWorkspaceTarget & { workId: string }) | null;
    editorOwnerId: string;
    document: WorkDocumentView;
    versions: Array<{ revision: number; version?: number; sourceChatId?: string | null; source: string; createdAt: string }>;
};
export type WorkReportHandle = { requestLeave: () => Promise<boolean> };
export function WorkReport({
    ref,
    documentId,
    onContinue,
    busy = false,
    onEditingChange,
    presentation = 'embedded',
}: {
    ref?: Ref<WorkReportHandle>;
    documentId: string;
    presentation?: 'standalone' | 'embedded';
    onContinue?: (prompt: string, report: { id: string; title: string; revision: number; version?: number }) => void;
    busy?: boolean;
    onEditingChange?: (editing: boolean) => void;
}) {
    const { organization } = useParams<{ organization: string }>();
    const t = useTranslations('WorkDocuments');
    const reportT = useTranslations('WorkDocuments.Report');
    const evidenceT = useTranslations('WorkDocuments.Evidence');
    const router = useRouter();
    const [listState] = useQueryStates(reportListParsers);
    const client = useQueryClient();
    const key = ['work-document', organization, documentId];
    const query = useQuery({ queryKey: key, queryFn: () => workRequest<Detail>(`/api/work-documents/${encodeURIComponent(documentId)}`), refetchInterval: busy ? 2000 : 15000 });
    const updates = useRef<BroadcastChannel | null>(null);
    useEffect(() => {
        if (typeof BroadcastChannel === 'undefined') return;
        const channel = new BroadcastChannel(`report:${organization}:${documentId}`);
        updates.current = channel;
        channel.onmessage = () => void client.invalidateQueries({ queryKey: ['work-document', organization, documentId] });
        return () => {
            channel.close();
            updates.current = null;
        };
    }, [client, documentId, organization]);
    const [selectedPublication, setSelectedPublication] = useQueryState('publication', parseAsString);
    const [selectedRevision, setSelectedRevision] = useQueryState('revision', parseAsInteger);
    const previousDocument = useRef(documentId);
    const changingDocument = previousDocument.current !== documentId;
    const latestRevision = query.data?.document.revision;
    const historical = !changingDocument && (selectedPublication !== null || (selectedRevision !== null && latestRevision !== undefined && selectedRevision !== latestRevision));
    const historyQuery = useQuery({
        queryKey: [...key, selectedRevision, selectedPublication],
        enabled: historical,
        retry: false,
        queryFn: () =>
            workRequest<Detail>(
                `/api/work-documents/${encodeURIComponent(documentId)}?${selectedPublication ? `publication=${encodeURIComponent(selectedPublication)}` : `revision=${selectedRevision}`}`,
            ),
    });
    const [restoreOpen, setRestoreOpen] = useState(false);
    const restore = useMutation({
        mutationFn: ({ revision, expectedRevision }: { revision: number; expectedRevision: number }) =>
            workRequest<{ document: WorkDocumentView }>(`/api/work-documents/${encodeURIComponent(documentId)}`, { action: 'restore', revision, expectedRevision }),
        onSuccess: async data => {
            updates.current?.postMessage(data.document.revision);
            client.setQueryData<Detail>(key, previous => (previous ? { ...previous, document: data.document } : undefined));
            setRestoreOpen(false);
            await setSelectedRevision(null);
            await setSelectedPublication(null);
            await Promise.all([
                client.invalidateQueries({ queryKey: key }),
                client.invalidateQueries({ queryKey: ['work-documents', organization] }),
                client.invalidateQueries({ queryKey: ['data-agent', organization] }),
            ]);
        },
        onError: error => {
            toast.error(error.message);
            void query.refetch();
        },
    });
    const [editorReady, setEditorReady] = useState(false);
    const editorRef = useRef<ReportEditorHandle>(null);
    const [editing, setEditing] = useState<WorkDocumentView | null>(null);
    const [editMode, setEditMode] = useState<'blocks' | 'source'>('blocks');
    const [dirty, setDirty] = useState(false);
    const [leaveDecision, setLeaveDecision] = useState<((leave: boolean) => void) | null>(null);
    const leaveAfterSave = useRef(false);
    const finishAfterSave = useRef(false);
    const resolveLeave = (leave: boolean) => {
        leaveAfterSave.current = false;
        leaveDecision?.(leave);
        setLeaveDecision(null);
    };
    const [saveError, setSaveError] = useState(false);
    const [definition, setDefinition] = useState<{ title: string; text: string } | null>(null);
    const reportBodyRef = useRef<HTMLDivElement>(null);
    const [evidenceSelection, setEvidenceSelection] = useState<ReportEvidenceSelection | null>(null);
    const editingActive = Boolean(editing);
    useEffect(() => {
        onEditingChange?.(editingActive);
    }, [editingActive, onEditingChange]);
    useEffect(() => () => onEditingChange?.(false), [onEditingChange]);
    const editRef = useRef(editing);
    editRef.current = editing;
    const mutation = useMutation({
        mutationFn: (body: unknown) => workRequest<{ document: WorkDocumentView }>(`/api/work-documents/${encodeURIComponent(documentId)}`, body),
        onSuccess: async data => {
            updates.current?.postMessage(data.document.revision);
            client.setQueryData<Detail>(key, previous => (previous ? { ...previous, document: data.document } : undefined));
            if (editRef.current) {
                baseline.current = data.document;
                const wasChangedDuringSave = editRef.current !== savingRef.current;
                setEditing(previous =>
                    previous
                        ? wasChangedDuringSave
                            ? {
                                  ...previous,
                                  revision: data.document.revision,
                                  version: data.document.version,
                                  content: {
                                      ...previous.content,
                                      evidence: data.document.content.evidence,
                                      embeds: reportEmbeds(previous.content.visuals, data.document.content.evidence),
                                  },
                              }
                            : data.document
                        : null,
                );
                setDirty(wasChangedDuringSave);
                if (wasChangedDuringSave) finishAfterSave.current = false;
                if (!wasChangedDuringSave && recoveryKey) sessionStorage.removeItem(recoveryKey);
                if (!wasChangedDuringSave && leaveAfterSave.current) resolveLeave(true);
                if (!wasChangedDuringSave && finishAfterSave.current) {
                    finishAfterSave.current = false;
                    setEditing(null);
                }
            }
            setSaveError(false);
            await Promise.all([
                client.invalidateQueries({ queryKey: key }),
                client.invalidateQueries({ queryKey: ['work-documents', organization] }),
                client.invalidateQueries({ queryKey: ['data-agent', organization] }),
            ]);
        },
        onError: error => {
            leaveAfterSave.current = false;
            finishAfterSave.current = false;
            setSaveError(true);
            void query.refetch();
            toast.error(error.message);
        },
    });
    const requestLeave = useCallback(async () => {
        if (!((await editorRef.current?.requestLeave()) ?? true)) return false;
        if (!dirty && !mutation.isPending) return Promise.resolve(true);
        return new Promise<boolean>(resolve => {
            setLeaveDecision((previous: ((leave: boolean) => void) | null) => {
                previous?.(false);
                return resolve;
            });
        });
    }, [dirty, mutation.isPending]);
    useImperativeHandle(ref, () => ({ requestLeave }), [requestLeave]);
    const leaveReport = async (navigate: () => void) => {
        if (!(await requestLeave())) return;
        setEditing(null);
        setDirty(false);
        setSaveError(false);
        navigate();
    };
    const evidenceOpener = useRef<HTMLElement | null>(null);
    const openEvidence = (artifactId: string) => {
        evidenceOpener.current = window.document.activeElement as HTMLElement;
        setEvidenceSelection({ artifactId });
    };
    const openEvidenceGroup = (groupId: string) => {
        evidenceOpener.current = window.document.activeElement as HTMLElement;
        setEvidenceSelection({ groupId });
    };
    const switchVersion = async (revision: number | null) => {
        if (!(await requestLeave())) return;
        setEditing(null);
        setDirty(false);
        setSaveError(false);
        setDefinition(null);
        setEvidenceSelection(null);
        await setSelectedPublication(null);
        await setSelectedRevision(revision);
    };
    useEffect(() => {
        if (previousDocument.current === documentId) return;
        previousDocument.current = documentId;
        setEditing(null);
        setDirty(false);
        setSaveError(false);
        setRestoreOpen(false);
        setEvidenceSelection(null);
        recovered.current = null;
    }, [documentId]);
    const savingRef = useRef<WorkDocumentView | null>(null);
    const { mutate, isPending } = mutation;
    const save = useCallback(() => {
        const current = editRef.current;
        if (!current || isPending) return;
        savingRef.current = current;
        mutate({
            action: 'save',
            expectedRevision: current.revision,
            draft: {
                title: current.title,
                format: current.content.format,
                body: current.content.body,
                markdown: current.content.body ?? current.content.markdown,
                visuals: current.content.visuals,
                evidenceGroups: current.content.evidenceGroups?.map(({ id, references }) => ({ id, references })),
                reviewedEvidenceGroupIds: current.content.reviewedEvidenceGroupIds,
                status: 'ready',
            },
        });
    }, [mutate, isPending]);
    const recoveryKey = query.data?.editorOwnerId ? JSON.stringify(['report-editor', organization, query.data.editorOwnerId, documentId]) : null;
    const recovered = useRef<string | null>(null);
    const baseline = useRef<WorkDocumentView | null>(null);
    const discard = () => {
        if (recoveryKey) sessionStorage.removeItem(recoveryKey);
        setEditing(null);
        setDirty(false);
        setSaveError(false);
    };
    useEffect(() => {
        if (historical || !recoveryKey || !query.data || changingDocument || recovered.current === recoveryKey) return;
        recovered.current = recoveryKey;
        try {
            const raw = sessionStorage.getItem(recoveryKey);
            if (!raw) return;
            const draft: WorkDocumentView = JSON.parse(raw);
            if (draft.id !== documentId || !draft.content) return;
            if (selectedRevision !== null) void setSelectedRevision(null);
            baseline.current = query.data.document;
            setEditing(draft);
            setDirty(true);
            setEditMode(parseReport(draft.content.body ?? '', draft.content.visuals).diagnostics.length ? 'source' : 'blocks');
            setSaveError(draft.revision !== query.data.document.revision);
        } catch {
            /* Unavailable browser storage does not prevent editing. */
        }
    }, [recoveryKey, historical, query.data, changingDocument, documentId, selectedRevision, setSelectedRevision]);
    useEffect(() => {
        if (editing?.id !== documentId || !dirty || !recoveryKey) return;
        try {
            sessionStorage.setItem(recoveryKey, JSON.stringify(editing));
        } catch {
            /* Keep in-memory edits when storage is full. */
        }
    }, [editing, dirty, recoveryKey, documentId]);
    useEffect(() => {
        const warn = (event: BeforeUnloadEvent) => {
            if (dirty || editorRef.current?.hasPendingChanges()) event.preventDefault();
        };
        const guard = (event: MouseEvent) => {
            if (event.target instanceof Element && event.target.closest('[data-report-evidence-navigation]')) return;
            if (event.target instanceof Element && event.target.closest('[data-evidence], [data-evidence-group], a[href^="dory://evidence/"], a[href^="dory://evidence-group/"]'))
                return;
            if ((dirty || editorRef.current?.hasPendingChanges()) && event.target instanceof Element && event.target.closest('a[href]')) {
                event.preventDefault();
                event.stopPropagation();
                const link = event.target.closest<HTMLAnchorElement>('a[href]');
                if (link && (link.protocol === 'http:' || link.protocol === 'https:')) {
                    const href = link.href;
                    void requestLeave().then(leave => {
                        if (!leave) return;
                        if (link.origin === window.location.origin) router.push(href);
                        else window.location.assign(href);
                    });
                }
            }
        };
        window.addEventListener('beforeunload', warn);
        window.document.addEventListener('click', guard, true);
        return () => {
            window.removeEventListener('beforeunload', warn);
            window.document.removeEventListener('click', guard, true);
        };
    }, [dirty, requestLeave, router]);
    const isEditing = !historical && !changingDocument && Boolean(editing);
    const sourceMode = isEditing && editMode === 'source';
    const viewPending = historical && historyQuery.isPending;
    const viewError = historical ? historyQuery.error : null;
    const viewUnavailable = viewPending || Boolean(viewError);
    const document = (!historical && !changingDocument ? editing : null) ?? (historical ? historyQuery.data?.document : undefined) ?? query.data?.document;
    useEffect(() => {
        if (!document || !window.location.hash) return;
        const focus = decodeURIComponent(window.location.hash.slice(1));
        const value = focus.slice(focus.indexOf(':') + 1);
        const selector = focus.startsWith('visual:')
            ? '[data-visual="' + CSS.escape(value) + '"]'
            : focus.startsWith('group:')
              ? '[data-evidence-group="' + CSS.escape(value) + '"]'
              : null;
        if (selector) reportBodyRef.current?.querySelector(selector)?.scrollIntoView({ block: 'center' });
    }, [document]);
    const versions = query.data?.versions ?? [];
    const editingConflict = Boolean(isEditing && editing && latestRevision && editing.revision !== latestRevision);
    const displayedVersion = historical
        ? (historyQuery.data?.document.version ?? versions.find(version => version.revision === selectedRevision)?.version ?? selectedRevision!)
        : (document?.version ?? document?.revision);
    if (query.isPending) return <p className="p-6 text-muted-foreground">{t('Loading')}</p>;
    if (query.error && !query.data)
        return (
            <p role="alert" className="p-6 text-destructive">
                {query.error.message}
            </p>
        );
    if (!document) return null;
    const change = (next: WorkDocumentView) => {
        setEditing(next);
        const changed = next.title !== baseline.current?.title || JSON.stringify(next.content) !== JSON.stringify(baseline.current?.content);
        setDirty(changed);
        if (!changed && recoveryKey) sessionStorage.removeItem(recoveryKey);
        setSaveError(false);
    };
    const switchMode = async (mode: ReportMode) => {
        if (mode === (isEditing ? editMode : 'view')) return;
        if (historical && mode !== 'view') {
            setRestoreOpen(true);
            return;
        }
        if (mode === 'view') {
            if (await requestLeave()) discard();
            return;
        }
        if (!((await editorRef.current?.requestLeave()) ?? true)) return;
        const content = editableReport(editRef.current?.content ?? document.content);
        if (mode === 'blocks' && parseReport(content.body ?? '', content.visuals).diagnostics.length) {
            toast.error(reportT('FixSourceFirst'));
            return;
        }
        // Both editing surfaces share the same draft. Entering an editor alone is not a mutation.
        if (!editRef.current) {
            if (selectedRevision !== null) await setSelectedRevision(null);
            baseline.current = { ...structuredClone(document), content };
            setEditing(baseline.current);
        }
        finishAfterSave.current = false;
        setEditMode(mode);
    };
    const exportReport = async (format: 'html' | 'pdf' | 'markdown' | 'mdx') => {
        const snapshot = (historical ? historyQuery.data : query.data)?.document;
        if (viewUnavailable || !snapshot) return;
        let html: string;
        try {
            html = renderWorkHtml(snapshot);
            if (format === 'pdf') {
                const frame = window.document.createElement('iframe');
                frame.style.cssText = 'position:fixed;width:0;height:0;border:0';
                frame.title = snapshot.title;
                frame.onload = () => {
                    frame.contentWindow?.focus();
                    frame.contentWindow?.print();
                    setTimeout(() => frame.remove(), 60000);
                };
                frame.srcdoc = html;
                window.document.body.appendChild(frame);
            } else {
                const bytes =
                    format === 'markdown'
                        ? (await import('@/lib/work-documents/export')).exportMarkdownZip(snapshot)
                        : format === 'mdx'
                          ? (await import('@/lib/work-documents/export')).exportDoryMdxZip(snapshot)
                          : null;
                const url = URL.createObjectURL(bytes ? new Blob([new Uint8Array(bytes)], { type: 'application/zip' }) : new Blob([html], { type: 'text/html;charset=utf-8' }));
                const anchor = window.document.createElement('a');
                anchor.href = url;
                anchor.download = `${snapshot.title.replace(/[/\\:*?"<>|]/g, '-')}.${format === 'markdown' || format === 'mdx' ? 'zip' : 'html'}`;
                anchor.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : reportT('Invalid'));
        }
    };
    const workspace = (historical ? historyQuery.data : query.data)?.workspace;
    const openAt = (origin: { artifactId?: string; componentId?: string; section?: string } = {}) => {
        if (workspace)
            void leaveReport(() =>
                router.push(
                    reportRunWorkspacePath(
                        organization,
                        {
                            documentId: document.id,
                            revision: document.revision,
                            artifactId: origin.artifactId ?? '',
                            componentId: origin.componentId,
                        },
                        { ...workspace, historical, section: origin.section },
                    ),
                    { scroll: false },
                ),
            );
    };
    const openWorkspace = () => openAt();
    return (
        <article className="report-surface h-full min-w-0 overflow-auto bg-background text-foreground" data-testid="work-report">
            {evidenceSelection ? (
                <ReportEvidencePanel
                    key={`${document.id}:${document.revision}:${'groupId' in evidenceSelection ? evidenceSelection.groupId : evidenceSelection.artifactId}`}
                    document={document}
                    selection={evidenceSelection}
                    run={workspace ? { ...workspace, historical } : undefined}
                    returnFocusRef={evidenceOpener}
                    organization={organization}
                    onClose={() => setEvidenceSelection(null)}
                    onBeforeNavigate={href => {
                        void leaveReport(() => {
                            setEvidenceSelection(null);
                            router.push(href, { scroll: false });
                        });
                    }}
                />
            ) : null}
            <div className={cn('min-w-0', sourceMode && 'flex h-full min-h-0 flex-col')}>
                <AlertDialog
                    open={Boolean(leaveDecision)}
                    onOpenChange={open => {
                        if (!open) resolveLeave(false);
                    }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{t('Resources.UnsavedTitle')}</AlertDialogTitle>
                            <AlertDialogDescription>{t('Resources.UnsavedDescription')}</AlertDialogDescription>
                        </AlertDialogHeader>
                        {saveError || editingConflict ? (
                            <p role="alert" className="text-sm text-destructive">
                                {t('Resources.SaveFailed')}
                            </p>
                        ) : null}
                        <AlertDialogFooter>
                            <Button variant="ghost" onClick={() => resolveLeave(false)}>
                                {t('VersionHistory.KeepEditing')}
                            </Button>
                            <Button
                                variant="outline"
                                disabled={mutation.isPending}
                                onClick={() => {
                                    discard();
                                    resolveLeave(true);
                                }}
                            >
                                {t('Resources.Discard')}
                            </Button>
                            <Button
                                onClick={() => {
                                    leaveAfterSave.current = true;
                                    if (!mutation.isPending) {
                                        if (!dirty) resolveLeave(true);
                                        else save();
                                    }
                                }}
                                disabled={mutation.isPending}
                            >
                                {t('Resources.SaveAndContinue')}
                            </Button>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
                <ReportToolbar
                    onOpenWorkspace={openWorkspace}
                    workspaceAvailable={Boolean(workspace)}
                    document={document}
                    standalone={presentation === 'standalone'}
                    historical={historical}
                    editing={isEditing}
                    dirty={dirty}
                    saving={mutation.isPending}
                    saveError={saveError}
                    unavailable={viewUnavailable}
                    disabled={busy || restore.isPending || Boolean(document.archivedAt)}
                    versions={versions}
                    latestRevision={latestRevision}
                    onCancel={discard}
                    onSourceChat={id => void leaveReport(() => router.push(continueUrl(`/${organization}/work`, { chat: id })))}
                    canExport={!viewUnavailable && !busy && !restore.isPending}
                    onBack={() => void leaveReport(() => router.push(serializeReportList(`/${organization}/reports`, listState)))}
                    onContinue={() =>
                        void leaveReport(() => {
                            if (onContinue) onContinue(t('RefreshPrompt'), { id: document.id, title: document.title, revision: document.revision, version: document.version });
                            else router.push(continueUrl(`/${organization}/work`, { document: document.id, revision: document.revision, chat: document.chatId }));
                        })
                    }
                    onTitle={title => change({ ...document, title })}
                    mode={isEditing ? editMode : 'view'}
                    onMode={mode => void switchMode(mode)}
                    onEdit={() => {
                        if (!dirty) discard();
                        else {
                            finishAfterSave.current = true;
                            save();
                        }
                    }}
                    onVersion={revision => void switchVersion(revision)}
                    onExport={format => void exportReport(format)}
                    editorReady={editorReady}
                    onInsert={type => editorRef.current?.insert(type)}
                />
                <div className={cn('mx-auto w-full max-w-[960px] px-4 sm:px-6', sourceMode ? 'flex min-h-0 flex-1 flex-col pb-4' : 'pb-8')} data-testid="report-content">
                    <AlertDialog
                        open={restoreOpen}
                        onOpenChange={open => {
                            if (!restore.isPending) setRestoreOpen(open);
                        }}
                    >
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>{t('VersionHistory.Restore')}</AlertDialogTitle>
                                <AlertDialogDescription>{t('VersionHistory.RestoreDescription', { revision: displayedVersion! })}</AlertDialogDescription>
                            </AlertDialogHeader>
                            {restore.error ? (
                                <p role="alert" className="text-sm text-destructive">
                                    {t('VersionHistory.RestoreFailed')} {restore.error.message}
                                </p>
                            ) : null}
                            <AlertDialogFooter>
                                <Button variant="ghost" disabled={restore.isPending} onClick={() => setRestoreOpen(false)}>
                                    {t('Resources.Cancel')}
                                </Button>
                                <Button
                                    disabled={restore.isPending || busy || !latestRevision}
                                    onClick={() => {
                                        if (latestRevision) restore.mutate({ revision: document.revision, expectedRevision: latestRevision });
                                    }}
                                >
                                    {t('VersionHistory.Restore')}
                                </Button>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    {saveError || editingConflict ? (
                        <div role="alert" className="mb-4 rounded border border-destructive p-3 text-sm">
                            {editingConflict ? t('VersionHistory.Conflict') : t('Conflict')}{' '}
                            {editingConflict && (
                                <Button asChild variant="outline">
                                    <a
                                        data-report-evidence-navigation
                                        href={`/${encodeURIComponent(organization)}/reports/${encodeURIComponent(documentId)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        {t('VersionHistory.OpenCurrent')}
                                    </a>
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                onClick={() =>
                                    void leaveReport(() => {
                                        discard();
                                        void query.refetch();
                                    })
                                }
                            >
                                {t('Reload')}
                            </Button>
                        </div>
                    ) : null}
                    {viewPending ? (
                        <p role="status">{t('Loading')}</p>
                    ) : viewError ? (
                        <div role="alert" className="text-destructive">
                            {viewError.message === 'REPORT_VERSION_REMOVED' ? t('VersionHistory.Removed') : viewError.message}{' '}
                            <Button variant="outline" onClick={() => void switchVersion(null)}>
                                {t(viewError.message === 'REPORT_VERSION_REMOVED' ? 'VersionHistory.OpenCurrent' : 'VersionHistory.BackToLatest')}
                            </Button>
                            <Button variant="outline" onClick={() => void historyQuery.refetch()}>
                                {t('Reload')}
                            </Button>
                        </div>
                    ) : (
                        <>
                            {historical && (
                                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
                                    {t('VersionHistory.ReadOnly', { revision: displayedVersion! })}
                                    <Button size="sm" variant="outline" onClick={() => void switchVersion(null)}>
                                        {t('VersionHistory.BackToLatest')}
                                    </Button>
                                    <Button size="sm" disabled={busy || Boolean(document.archivedAt) || latestRevision === document.revision} onClick={() => setRestoreOpen(true)}>
                                        {t('VersionHistory.Restore')}
                                    </Button>
                                </div>
                            )}
                            {document.content.evidenceGroups?.some(group => group.needsReview) ? (
                                <p role="status" className="mb-3 text-sm text-muted-foreground">
                                    {evidenceT('ReviewRequired')}
                                </p>
                            ) : null}
                            <div
                                ref={reportBodyRef}
                                className={cn('work-prose', sourceMode && 'flex min-h-0 flex-1 flex-col')}
                                onClick={event => {
                                    const group = event.target instanceof Element ? event.target.closest('[data-evidence-group]')?.getAttribute('data-evidence-group') : null;
                                    if (group) {
                                        event.preventDefault();
                                        openEvidenceGroup(group);
                                        return;
                                    }
                                    const target = event.target instanceof Element ? event.target.closest('[data-evidence], a[href^="dory://evidence/"]') : null;
                                    if (target) {
                                        event.preventDefault();
                                        const id = target.getAttribute('data-evidence') ?? target.getAttribute('href')?.slice('dory://evidence/'.length);
                                        if (id) openEvidence(id);
                                    }
                                }}
                            >
                                {isEditing ? (
                                    <ReportEditor
                                        ref={editorRef}
                                        onReadyChange={setEditorReady}
                                        mode={editMode}
                                        onSource={() => void switchMode('source')}
                                        documentId={documentId}
                                        content={document.content}
                                        onChange={content => change({ ...document, content })}
                                        onEvidenceGroup={openEvidenceGroup}
                                    />
                                ) : (
                                    <ReportBody key={document.revision} content={document.content} onEvidenceGroup={openEvidenceGroup} onOpenSql={workspace ? openAt : undefined} />
                                )}
                            </div>
                            {!isEditing && !definition ? (
                                <ReportSelectionPopover
                                    key={`${document.id}:${document.revision}`}
                                    bodyRef={reportBodyRef}
                                    onAdd={text => setDefinition({ title: document.title, text })}
                                />
                            ) : null}
                        </>
                    )}
                    {definition ? <AddDefinitionDialog {...definition} connectionIds={document.scope.connectionIds} onClose={() => setDefinition(null)} /> : null}
                </div>
            </div>
        </article>
    );
}

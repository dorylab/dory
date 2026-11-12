'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
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
import { buildReportWorkspacePath } from '@/lib/work-documents/workspace-url';

import { AddDefinitionDialog } from './add-definition-dialog';
import { ReportBody } from './report-body';
import type { ReportEditorHandle } from './report-editor';
import type { ReportEvidenceSelection } from './report-evidence-panel';
import { ReportToolbar } from './report-toolbar';

const ReportEditor = dynamic(() => import('./report-editor'), { ssr: false });
const ReportEvidencePanel = dynamic(() => import('./report-evidence-panel').then(module => module.ReportEvidencePanel), { ssr: false });
const continueUrl = createSerializer({ document: parseAsString, revision: parseAsInteger, chat: parseAsString });

type Detail = {
    publications?: Array<{ id: string; number: number; revision: number; publishedAt: string }>;
    document: WorkDocumentView;
    versions: Array<{ revision: number; version?: number; source: string; createdAt: string }>;
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
    const analysisT = useTranslations('WorkDocuments.Analysis');
    const router = useRouter();
    const [listState] = useQueryStates(reportListParsers);
    const client = useQueryClient();
    const key = ['work-document', organization, documentId];
    const query = useQuery({ queryKey: key, queryFn: () => workRequest<Detail>(`/api/work-documents/${encodeURIComponent(documentId)}`), refetchInterval: busy ? 2000 : false });
    const [selectedPublication, setSelectedPublication] = useQueryState('publication', parseAsString);
    const [selectedRevision, setSelectedRevision] = useQueryState('revision', parseAsInteger);
    const previousDocument = useRef(documentId);
    const changingDocument = previousDocument.current !== documentId;
    const historical = (selectedRevision !== null || selectedPublication !== null) && !changingDocument;
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
            client.setQueryData<Detail>(key, previous => (previous ? { ...previous, document: data.document } : undefined));
            if (editRef.current) {
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
        void setSelectedRevision(null);
        void setSelectedPublication(null);
    }, [documentId, setSelectedRevision, setSelectedPublication]);
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
                status: 'draft',
            },
        });
    }, [mutate, isPending]);
    useEffect(() => {
        if (!dirty || busy || saveError || mutation.isPending || leaveDecision) return;
        const timer = setTimeout(save, 1200);
        return () => clearTimeout(timer);
    }, [editing, dirty, busy, saveError, mutation.isPending, save, leaveDecision]);
    useEffect(() => {
        const warn = (event: BeforeUnloadEvent) => {
            if (dirty) event.preventDefault();
        };
        const guard = (event: MouseEvent) => {
            if (event.target instanceof Element && event.target.closest('[data-report-evidence-navigation]')) return;
            if (event.target instanceof Element && event.target.closest('[data-evidence], [data-evidence-group], a[href^="dory://evidence/"], a[href^="dory://evidence-group/"]'))
                return;
            if (dirty && event.target instanceof Element && event.target.closest('a[href]')) {
                event.preventDefault();
                event.stopPropagation();
                toast.info(t('LeaveUnsaved'));
            }
        };
        window.addEventListener('beforeunload', warn);
        window.document.addEventListener('click', guard, true);
        return () => {
            window.removeEventListener('beforeunload', warn);
            window.document.removeEventListener('click', guard, true);
        };
    }, [dirty, t]);
    const publish = useMutation({
        mutationFn: ({ revision }: { revision: number }) =>
            workRequest<{ document: WorkDocumentView }>(`/api/work-documents/${encodeURIComponent(documentId)}`, {
                action: 'publish',
                expectedRevision: revision,
                requestId: `publish:${documentId}:${revision}`,
            }),
        onSuccess: async data => {
            await client.invalidateQueries({ queryKey: key });
            await setSelectedRevision(null);
            await setSelectedPublication(data.document.publication?.id ?? null);
        },
        onError: error => toast.error(error.message),
    });
    const isEditing = !historical && !changingDocument && Boolean(editing);
    const viewPending = historical && historyQuery.isPending;
    const viewError = historical ? historyQuery.error : null;
    const viewUnavailable = viewPending || Boolean(viewError);
    const document = (!historical && !changingDocument ? editing : null) ?? (historical ? historyQuery.data?.document : undefined) ?? query.data?.document;
    const latestRevision = query.data?.document.revision;
    const versions = query.data?.versions ?? [];
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
        setDirty(true);
        setSaveError(false);
    };
    const switchMode = async (mode: ReportMode) => {
        if (mode === (isEditing ? editMode : 'view')) return;
        if (historical && mode !== 'view') {
            setRestoreOpen(true);
            return;
        }
        if (!((await editorRef.current?.requestLeave()) ?? true)) return;
        if (mode === 'view') {
            if (dirty) {
                finishAfterSave.current = true;
                save();
            } else setEditing(null);
            return;
        }
        const content = editableReport(editRef.current?.content ?? document.content);
        if (mode === 'blocks' && parseReport(content.body ?? '', content.visuals).diagnostics.length) {
            toast.error(reportT('FixSourceFirst'));
            return;
        }
        // Both editing surfaces share the same draft. Entering an editor alone is not a mutation.
        if (!editRef.current) setEditing({ ...structuredClone(document), content });
        finishAfterSave.current = false;
        setEditMode(mode);
    };
    const exportReport = async (format: 'html' | 'pdf' | 'markdown' | 'mdx') => {
        if (viewUnavailable) return;
        let html: string;
        try {
            html = renderWorkHtml(document);
            if (format === 'pdf') {
                const frame = window.document.createElement('iframe');
                frame.style.cssText = 'position:fixed;width:0;height:0;border:0';
                frame.title = document.title;
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
                        ? (await import('@/lib/work-documents/export')).exportMarkdownZip(document)
                        : format === 'mdx'
                          ? (await import('@/lib/work-documents/export')).exportDoryMdxZip(document)
                          : null;
                const url = URL.createObjectURL(bytes ? new Blob([new Uint8Array(bytes)], { type: 'application/zip' }) : new Blob([html], { type: 'text/html;charset=utf-8' }));
                const anchor = window.document.createElement('a');
                anchor.href = url;
                anchor.download = `${document.title.replace(/[/\\:*?"<>|]/g, '-')}.${format === 'markdown' || format === 'mdx' ? 'zip' : 'html'}`;
                anchor.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : reportT('Invalid'));
        }
    };
    return (
        <article className="report-surface h-full min-w-0 overflow-auto bg-background text-foreground" data-testid="work-report">
            {evidenceSelection ? (
                <ReportEvidencePanel
                    key={`${document.id}:${document.revision}:${'groupId' in evidenceSelection ? evidenceSelection.groupId : evidenceSelection.artifactId}`}
                    document={document}
                    selection={evidenceSelection}
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
            <div className="min-w-0">
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
                        {saveError ? (
                            <p role="alert" className="text-sm text-destructive">
                                {t('Resources.SaveFailed')}
                            </p>
                        ) : null}
                        <AlertDialogFooter>
                            <Button variant="ghost" onClick={() => resolveLeave(false)}>
                                {t('Resources.Cancel')}
                            </Button>
                            <Button variant="outline" disabled={mutation.isPending} onClick={() => resolveLeave(true)}>
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
                    onOpenWorkspace={() =>
                        void leaveReport(() =>
                            router.push(
                                buildReportWorkspacePath(organization, {
                                    documentId: document.id,
                                    artifactId: '',
                                    revision: document.revision,
                                    publicationId: document.publication?.id,
                                }),
                            ),
                        )
                    }
                    document={document}
                    standalone={presentation === 'standalone'}
                    historical={historical}
                    editing={isEditing}
                    dirty={dirty}
                    saving={mutation.isPending}
                    saveError={saveError}
                    unavailable={viewUnavailable}
                    disabled={busy || restore.isPending || Boolean(document.archivedAt)}
                    publications={query.data?.publications ?? []}
                    versions={versions}
                    latestRevision={latestRevision}
                    canPublish={
                        !historical &&
                        !dirty &&
                        !busy &&
                        !isEditing &&
                        !publish.isPending &&
                        !document.archivedAt &&
                        !document.content.evidenceGroups?.some(group => group.needsReview) &&
                        Boolean(document.content.format && document.content.body?.trim()) &&
                        !document.content.diagnostics?.length
                    }
                    canExport={!viewUnavailable && !dirty && !busy && !isEditing && !restore.isPending}
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
                    onEdit={() => void switchMode(isEditing ? 'view' : 'blocks')}
                    onPublish={() => publish.mutate({ revision: document.revision })}
                    onVersion={value => {
                        if (value === 'draft') void switchVersion(null);
                        else if (value.startsWith('revision:')) void switchVersion(Number(value.slice(9)));
                        else
                            void leaveReport(() => {
                                void setSelectedRevision(null);
                                void setSelectedPublication(value.slice(12));
                            });
                    }}
                    onRestore={() => {
                        restore.reset();
                        setRestoreOpen(true);
                    }}
                    onExport={format => void exportReport(format)}
                    onInsert={type => editorRef.current?.insert(type)}
                />
                <div className="mx-auto w-full max-w-[960px] px-4 pb-8 sm:px-6" data-testid="report-content">
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
                    {saveError ? (
                        <div role="alert" className="mb-4 rounded border border-destructive p-3 text-sm">
                            {t('Conflict')}{' '}
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setEditing(null);
                                    setDirty(false);
                                    setSaveError(false);
                                    void query.refetch();
                                }}
                            >
                                {t('Reload')}
                            </Button>
                        </div>
                    ) : null}
                    {viewPending ? (
                        <p role="status">{t('Loading')}</p>
                    ) : viewError ? (
                        <div role="alert" className="text-destructive">
                            {viewError.message}{' '}
                            <Button variant="outline" onClick={() => void historyQuery.refetch()}>
                                {t('Reload')}
                            </Button>
                        </div>
                    ) : (
                        <>
                            {document.content.workspaceOrigin && (
                                <p className="mb-3 text-xs text-muted-foreground">{analysisT('BasedOn', { version: document.content.workspaceOrigin.baseRevision })}</p>
                            )}
                            {document.content.evidenceGroups?.some(group => group.needsReview) ? (
                                <p role="status" className="mb-3 text-sm text-muted-foreground">
                                    {evidenceT('ReviewRequired')}
                                </p>
                            ) : null}
                            <div
                                className="work-prose"
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
                                        mode={editMode}
                                        onSource={() => void switchMode('source')}
                                        documentId={documentId}
                                        content={document.content}
                                        title={document.title}
                                        onChange={content => change({ ...document, content })}
                                        onEvidenceGroup={openEvidenceGroup}
                                    />
                                ) : (
                                    <ReportBody key={document.revision} content={document.content} title={document.title} onEvidenceGroup={openEvidenceGroup} />
                                )}
                            </div>
                            {!isEditing ? (
                                <div className="mt-5 flex gap-2">
                                    <Button
                                        variant="ghost"
                                        onMouseDown={event => event.preventDefault()}
                                        onClick={() => {
                                            const text = window.getSelection()?.toString().trim();
                                            if (text) setDefinition({ title: document.title, text });
                                            else toast.info(t('SelectDefinition'));
                                        }}
                                    >
                                        {t('AddDefinition')}
                                    </Button>
                                </div>
                            ) : null}
                        </>
                    )}
                    {definition ? <AddDefinitionDialog {...definition} connectionIds={document.scope.connectionIds} onClose={() => setDefinition(null)} /> : null}
                </div>
            </div>
        </article>
    );
}

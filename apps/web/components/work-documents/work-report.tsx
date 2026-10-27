'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/registry/new-york-v4/ui/alert-dialog';
import { Button } from '@/registry/new-york-v4/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { parseAsInteger, useQueryState, useQueryStates } from 'nuqs';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/registry/new-york-v4/ui/sheet';
import type { WorkDocumentView, WorkEvidence } from '@dory/shared/types/work-document';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { workRequest } from '@/lib/work-documents/client';
import { reportListParsers, serializeReportList } from '@/lib/work-documents/list-state';
import { renderWorkHtml, renderWorkMarkdown } from '@/lib/work-documents/render';
import { AddVerifiedQueryDialog } from '@/components/knowledge/add-verified-query-dialog';

import { AddDefinitionDialog } from './add-definition-dialog';

const MarkdownEditor = dynamic(() => import('./markdown-editor'), { ssr: false });

type Detail = { document: WorkDocumentView; versions: Array<{ revision: number; source: string; createdAt: string }> };
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
    onContinue?: (prompt: string) => void;
    busy?: boolean;
    onEditingChange?: (editing: boolean) => void;
}) {
    const { organization } = useParams<{ organization: string }>();
    const t = useTranslations('WorkDocuments');
    const router = useRouter();
    const [listState] = useQueryStates(reportListParsers);
    const client = useQueryClient();
    const key = ['work-document', organization, documentId];
    const query = useQuery({ queryKey: key, queryFn: () => workRequest<Detail>(`/api/work-documents/${encodeURIComponent(documentId)}`), refetchInterval: busy ? 2000 : false });
    const [selectedRevision, setSelectedRevision] = useQueryState('revision', parseAsInteger);
    const previousDocument = useRef(documentId);
    const changingDocument = previousDocument.current !== documentId;
    const historical = selectedRevision !== null && !changingDocument;
    const historyQuery = useQuery({
        queryKey: [...key, selectedRevision],
        enabled: historical,
        retry: false,
        queryFn: () => workRequest<Detail>(`/api/work-documents/${encodeURIComponent(documentId)}?revision=${selectedRevision}`),
    });
    const [restoreOpen, setRestoreOpen] = useState(false);
    const restore = useMutation({
        mutationFn: ({ revision, expectedRevision }: { revision: number; expectedRevision: number }) =>
            workRequest<{ document: WorkDocumentView }>(`/api/work-documents/${encodeURIComponent(documentId)}`, { action: 'restore', revision, expectedRevision }),
        onSuccess: async data => {
            client.setQueryData<Detail>(key, previous => (previous ? { ...previous, document: data.document } : undefined));
            setRestoreOpen(false);
            await setSelectedRevision(null);
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
    const [editing, setEditing] = useState<WorkDocumentView | null>(null);
    const [dirty, setDirty] = useState(false);
    const [leaveDecision, setLeaveDecision] = useState<((leave: boolean) => void) | null>(null);
    const leaveAfterSave = useRef(false);
    const resolveLeave = (leave: boolean) => {
        leaveAfterSave.current = false;
        leaveDecision?.(leave);
        setLeaveDecision(null);
    };
    const [saveError, setSaveError] = useState(false);
    const [definition, setDefinition] = useState<{ title: string; text: string } | null>(null);
    const [knowledge, setKnowledge] = useState<WorkEvidence | null>(null);
    useEffect(() => {
        onEditingChange?.(Boolean(editing));
        return () => onEditingChange?.(false);
    }, [editing, onEditingChange]);
    const [evidenceId, setEvidenceId] = useState<string | null>(null);
    const editRef = useRef(editing);
    editRef.current = editing;
    const mutation = useMutation({
        mutationFn: (body: unknown) => workRequest<{ document: WorkDocumentView }>(`/api/work-documents/${encodeURIComponent(documentId)}`, body),
        onSuccess: async data => {
            client.setQueryData<Detail>(key, previous => (previous ? { ...previous, document: data.document } : undefined));
            if (editRef.current) {
                const wasChangedDuringSave = editRef.current !== savingRef.current;
                setEditing(previous => (previous ? { ...previous, revision: data.document.revision } : null));
                setDirty(wasChangedDuringSave);
                if (!wasChangedDuringSave && leaveAfterSave.current) resolveLeave(true);
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
            setSaveError(true);
            toast.error(error.message);
        },
    });
    const requestLeave = useCallback(() => {
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
    const switchVersion = async (revision: number | null) => {
        if (!(await requestLeave())) return;
        setEditing(null);
        setDirty(false);
        setSaveError(false);
        setEvidenceId(null);
        setKnowledge(null);
        setDefinition(null);
        await setSelectedRevision(revision);
    };
    useEffect(() => {
        if (previousDocument.current === documentId) return;
        previousDocument.current = documentId;
        setEditing(null);
        setDirty(false);
        setSaveError(false);
        setEvidenceId(null);
        setRestoreOpen(false);
        void setSelectedRevision(null);
    }, [documentId, setSelectedRevision]);
    const savingRef = useRef<WorkDocumentView | null>(null);
    const { mutate, isPending } = mutation;
    const save = useCallback(() => {
        const current = editRef.current;
        if (!current || isPending) return;
        savingRef.current = current;
        mutate({
            action: 'save',
            expectedRevision: current.revision,
            draft: { title: current.title, markdown: current.content.markdown, visuals: current.content.visuals, status: current.status },
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
            if (event.target instanceof Element && event.target.closest('[data-evidence], a[href^="dory://evidence/"]')) return;
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
    const isEditing = !historical && !changingDocument && Boolean(editing);
    const viewPending = historical && historyQuery.isPending;
    const viewError = historical ? historyQuery.error : null;
    const viewUnavailable = viewPending || Boolean(viewError);
    const document = (!historical && !changingDocument ? editing : null) ?? (historical ? historyQuery.data?.document : undefined) ?? query.data?.document;
    const latestRevision = query.data?.document.revision;
    const versions = query.data?.versions ?? [];
    const latestVersion = versions.find(version => version.revision === latestRevision);
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
    const exportReport = async (format: 'html' | 'pdf' | 'markdown') => {
        if (viewUnavailable) return;
        const html = renderWorkHtml(document);
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
            const bytes = format === 'markdown' ? (await import('@/lib/work-documents/export')).exportMarkdownZip(document) : null;
            const url = URL.createObjectURL(bytes ? new Blob([new Uint8Array(bytes)], { type: 'application/zip' }) : new Blob([html], { type: 'text/html;charset=utf-8' }));
            const anchor = window.document.createElement('a');
            anchor.href = url;
            anchor.download = `${document.title.replace(/[/\\:*?"<>|]/g, '-')}.${format === 'markdown' ? 'zip' : 'html'}`;
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
    };
    return (
        <article className="h-full min-w-0 overflow-auto bg-background p-4 text-foreground sm:p-6" data-testid="work-report">
            <div className={presentation === 'standalone' ? 'mx-auto w-full max-w-6xl' : 'min-w-0'}>
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
                <header className="mb-6 space-y-4 border-b pb-5">
                    {presentation === 'standalone' ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="-ml-2"
                            onClick={() => void leaveReport(() => router.push(serializeReportList(`/${organization}/reports`, listState)))}
                        >
                            <ArrowLeft className="mr-1 size-4" />
                            {t('BackToReports')}
                        </Button>
                    ) : null}
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1 basis-64">
                            {!viewUnavailable ? (
                                isEditing ? (
                                    <Input aria-label={t('Title')} value={document.title} maxLength={160} onChange={event => change({ ...document, title: event.target.value })} />
                                ) : (
                                    <h1 className="break-words text-2xl font-semibold tracking-tight">{document.title}</h1>
                                )
                            ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {historical ? (
                                <Button variant="outline" disabled={restore.isPending} onClick={() => void switchVersion(null)}>
                                    {t('VersionHistory.BackToLatest')}
                                </Button>
                            ) : (
                                <Button
                                    disabled={busy || restore.isPending || Boolean(document.archivedAt)}
                                    onClick={() =>
                                        void leaveReport(() => {
                                            if (onContinue) onContinue(t('RefreshPrompt'));
                                            else
                                                router.push(
                                                    `/${organization}/work?document=${encodeURIComponent(document.id)}${document.chatId ? `&chat=${encodeURIComponent(document.chatId)}` : ''}`,
                                                );
                                        })
                                    }
                                >
                                    {t(onContinue ? 'Refresh' : 'Continue')}
                                </Button>
                            )}
                            <Button
                                variant="outline"
                                disabled={historical || busy || Boolean(document.archivedAt)}
                                onClick={() => {
                                    if (editing && dirty) save();
                                    else setEditing(editing ? null : structuredClone(document));
                                }}
                            >
                                {isEditing ? (dirty ? t('Save') : t('Done')) : t('Edit')}
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" disabled={viewUnavailable || dirty || busy || isEditing || restore.isPending}>
                                        {t('Export')}
                                        <ChevronDown className="ml-1 size-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onSelect={() => void exportReport('html')}>HTML</DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => void exportReport('pdf')}>{t('ExportPdf')}</DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => void exportReport('markdown')}>{t('ExportMarkdown')}</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                    {!viewUnavailable ? (
                        <p className="min-w-0 break-words text-xs text-muted-foreground">
                            {t('Sources')}:{' '}
                            {[
                                ...new Set(
                                    document.content.evidence.map(
                                        item =>
                                            item.connectionName ??
                                            item.attachmentSource?.files.map(file => (file.sheet ? `${file.filename} / ${file.sheet}` : file.filename)).join(', ') ??
                                            item.connectionId,
                                    ),
                                ),
                            ].join(', ')}
                        </p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-3">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" aria-label={t('VersionHistory.Select')} disabled={restore.isPending}>
                                    {t('VersionLabel', { revision: historical ? selectedRevision! : document.revision })}
                                    <ChevronDown className="ml-1 size-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="max-h-80 max-w-[calc(100vw-2rem)] overflow-auto">
                                <DropdownMenuRadioGroup
                                    value={String(historical ? selectedRevision : latestRevision)}
                                    onValueChange={value => void switchVersion(Number(value) === latestRevision ? null : Number(value))}
                                >
                                    <DropdownMenuRadioItem value={String(latestRevision)}>
                                        v{latestRevision} · {t('VersionHistory.Latest')}
                                        {latestVersion ? (
                                            <>
                                                {' '}
                                                · {new Date(latestVersion.createdAt).toLocaleString()} ·{' '}
                                                {t(
                                                    latestVersion.source === 'user'
                                                        ? 'VersionHistory.User'
                                                        : latestVersion.source === 'restore'
                                                          ? 'VersionHistory.Restored'
                                                          : 'VersionHistory.Agent',
                                                )}
                                            </>
                                        ) : null}
                                    </DropdownMenuRadioItem>
                                    {versions
                                        .filter(version => version.revision !== latestRevision)
                                        .map(version => (
                                            <DropdownMenuRadioItem key={version.revision} value={String(version.revision)}>
                                                v{version.revision} · {new Date(version.createdAt).toLocaleString()} ·{' '}
                                                {t(
                                                    version.source === 'user'
                                                        ? 'VersionHistory.User'
                                                        : version.source === 'restore'
                                                          ? 'VersionHistory.Restored'
                                                          : 'VersionHistory.Agent',
                                                )}
                                            </DropdownMenuRadioItem>
                                        ))}
                                </DropdownMenuRadioGroup>
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {!viewUnavailable ? (
                            <>
                                {isEditing ? (
                                    <span role="status" aria-live="polite" className={`text-xs ${saveError ? 'text-destructive' : 'text-muted-foreground'}`}>
                                        {saveError ? t('Resources.SaveFailed') : mutation.isPending ? t('Saving') : dirty ? t('Unsaved') : t('Saved')}
                                    </span>
                                ) : null}
                                {document.archivedAt ? <span className="rounded bg-muted px-2 py-1 text-xs">{t('Archived')}</span> : null}
                                {document.status === 'draft' ? <span className="rounded border px-2 py-1 text-xs">{t('Incomplete')}</span> : null}
                            </>
                        ) : null}
                    </div>
                </header>
                {historical ? (
                    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 p-3 text-sm">
                        <span>{t('VersionHistory.ReadOnly', { revision: selectedRevision! })}</span>
                        <Button
                            variant="outline"
                            disabled={viewUnavailable || busy || restore.isPending || Boolean(document.archivedAt)}
                            onClick={() => {
                                restore.reset();
                                setRestoreOpen(true);
                            }}
                        >
                            {t('VersionHistory.Restore')}
                        </Button>
                    </div>
                ) : null}
                <AlertDialog
                    open={restoreOpen}
                    onOpenChange={open => {
                        if (!restore.isPending) setRestoreOpen(open);
                    }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{t('VersionHistory.Restore')}</AlertDialogTitle>
                            <AlertDialogDescription>{t('VersionHistory.RestoreDescription', { revision: selectedRevision ?? document.revision })}</AlertDialogDescription>
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
                                    if (selectedRevision !== null && latestRevision) restore.mutate({ revision: selectedRevision, expectedRevision: latestRevision });
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
                        <div
                            className="work-prose"
                            onClick={event => {
                                const target = event.target instanceof Element ? event.target.closest('[data-evidence], a[href^="dory://evidence/"]') : null;
                                if (target) {
                                    event.preventDefault();
                                    setEvidenceId(target.getAttribute('data-evidence') ?? target.getAttribute('href')?.slice('dory://evidence/'.length) ?? null);
                                }
                            }}
                        >
                            {isEditing ? (
                                <MarkdownEditor
                                    content={document.content}
                                    onChange={markdown => change({ ...document, content: { ...document.content, markdown } })}
                                    onEvidence={setEvidenceId}
                                />
                            ) : (
                                <div data-testid="work-markdown" dangerouslySetInnerHTML={{ __html: renderWorkMarkdown(document.content) }} />
                            )}
                        </div>
                        {!isEditing ? (
                            <div className="mt-5 flex gap-2">
                                <Button variant="outline" onClick={() => setEvidenceId(document.content.evidence[0]?.artifactId ?? 'all')}>
                                    {t('Evidence')}
                                </Button>
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
                <Sheet
                    open={!viewUnavailable && Boolean(evidenceId)}
                    onOpenChange={open => {
                        if (!open) setEvidenceId(null);
                    }}
                >
                    <SheetContent className="overflow-auto sm:max-w-xl">
                        <SheetHeader>
                            <SheetTitle>{t('Evidence')}</SheetTitle>
                            <SheetDescription>{t('EvidenceDescription')}</SheetDescription>
                        </SheetHeader>
                        <div className="space-y-5 px-4 pb-6">
                            {document.content.evidence.map(item => (
                                <details key={item.artifactId} open={evidenceId === item.artifactId} className="rounded border p-3 text-sm">
                                    <summary className="cursor-pointer font-medium">
                                        {item.title} ·{' '}
                                        {item.connectionName ??
                                            item.attachmentSource?.files.map(file => (file.sheet ? `${file.filename} / ${file.sheet}` : file.filename)).join(', ')}
                                    </summary>
                                    <p className="my-2 text-xs text-muted-foreground">
                                        {t('CapturedAt')}: {item.capturedAt}
                                        {item.truncated ? ` · ${t('Preview')}` : ''}
                                    </p>
                                    <pre className="my-3 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">{item.sql}</pre>
                                    <pre className="max-h-64 overflow-auto text-xs">{JSON.stringify(item.rows.slice(0, 10), null, 2)}</pre>
                                    <div className="mt-3 flex gap-2">
                                        {item.runId ? (
                                            <Link className="text-primary underline" href={`/${organization}/agent-runs/${item.runId}`}>
                                                {t('Run')}
                                            </Link>
                                        ) : null}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setEvidenceId(null);
                                                setKnowledge(item);
                                            }}
                                        >
                                            {t('AddKnowledge')}
                                        </Button>
                                    </div>
                                </details>
                            ))}
                            {document.content.knowledge.map(item => (
                                <details className="rounded border p-3" key={`${item.ref}:${item.revision}`}>
                                    <summary>{item.title}</summary>
                                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{item.content}</pre>
                                </details>
                            ))}
                        </div>
                    </SheetContent>
                </Sheet>
                {definition ? <AddDefinitionDialog {...definition} connectionIds={document.scope.connectionIds} onClose={() => setDefinition(null)} /> : null}
                {knowledge ? (
                    <AddVerifiedQueryDialog
                        open
                        onOpenChange={open => {
                            if (!open) setKnowledge(null);
                        }}
                        connectionId={knowledge.connectionId}
                        sql={knowledge.sql}
                        sourceType="work_document"
                        sourceId={document.id}
                        initialTitle={knowledge.title}
                    />
                ) : null}
            </div>
        </article>
    );
}

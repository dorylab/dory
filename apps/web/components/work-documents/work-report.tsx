'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/registry/new-york-v4/ui/alert-dialog';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/registry/new-york-v4/ui/sheet';
import type { WorkDocumentView, WorkEvidence } from '@dory/shared/types/work-document';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { workRequest } from '@/lib/work-documents/client';
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
}: {
    ref?: Ref<WorkReportHandle>;
    documentId: string;
    onContinue?: (prompt: string) => void;
    busy?: boolean;
    onEditingChange?: (editing: boolean) => void;
}) {
    const { organization } = useParams<{ organization: string }>();
    const t = useTranslations('WorkDocuments');
    const client = useQueryClient();
    const key = ['work-document', organization, documentId];
    const query = useQuery({ queryKey: key, queryFn: () => workRequest<Detail>(`/api/work-documents/${encodeURIComponent(documentId)}`), refetchInterval: busy ? 2000 : false });
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
            await Promise.all([client.invalidateQueries({ queryKey: key }), client.invalidateQueries({ queryKey: ['work-documents', organization] })]);
        },
        onError: error => {
            leaveAfterSave.current = false;
            setSaveError(true);
            toast.error(error.message);
        },
    });
    useImperativeHandle(
        ref,
        () => ({
            requestLeave: () => {
                if (!dirty && !mutation.isPending) return Promise.resolve(true);
                return new Promise<boolean>(resolve => {
                    setLeaveDecision((previous: ((leave: boolean) => void) | null) => {
                        previous?.(false);
                        return resolve;
                    });
                });
            },
        }),
        [dirty, mutation.isPending],
    );
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
    const document = editing ?? query.data?.document;
    if (query.isPending) return <p className="p-6 text-muted-foreground">{t('Loading')}</p>;
    if (query.error)
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
        <article className="h-full overflow-auto bg-background p-6 text-foreground" data-testid="work-report">
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
            <div className="mb-6 flex flex-wrap items-center gap-2">
                {onContinue ? (
                    <Button variant="outline" disabled={busy || dirty || Boolean(editing) || Boolean(document.archivedAt)} onClick={() => onContinue(t('RefreshPrompt'))}>
                        {t('Refresh')}
                    </Button>
                ) : (
                    <Button variant="outline" asChild>
                        <Link href={`/${organization}/data-agent?document=${document.id}${document.chatId ? `&chat=${document.chatId}` : ''}`}>{t('Continue')}</Link>
                    </Button>
                )}
                <Button
                    variant="outline"
                    disabled={busy || Boolean(document.archivedAt)}
                    onClick={() => {
                        if (editing && dirty) save();
                        else setEditing(editing ? null : structuredClone(document));
                    }}
                >
                    {editing ? (dirty ? t('Save') : t('Done')) : t('Edit')}
                </Button>
                <Button variant="outline" disabled={dirty || busy || Boolean(editing)} onClick={() => void exportReport('html')}>
                    HTML
                </Button>
                <Button variant="outline" disabled={dirty || busy || Boolean(editing)} onClick={() => void exportReport('pdf')}>
                    {t('ExportPdf')}
                </Button>
                <Button variant="outline" disabled={dirty || busy || Boolean(editing)} onClick={() => void exportReport('markdown')}>
                    {t('ExportMarkdown')}
                </Button>
                <span className="text-xs text-muted-foreground">
                    v{document.revision} · {dirty ? t('Unsaved') : t('Saved')} · {document.status === 'draft' ? t('Incomplete') : t('Ready')}
                </span>
            </div>
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
            {editing ? (
                <Input aria-label={t('Title')} value={document.title} onChange={event => change({ ...document, title: event.target.value })} />
            ) : (
                <h1 className="text-2xl font-semibold">{document.title}</h1>
            )}
            <p className="my-3 text-xs text-muted-foreground">
                {t('Sources')}: {[...new Set(document.content.evidence.map(item => item.connectionName ?? item.connectionId))].join(', ')}
            </p>
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
                {editing ? (
                    <MarkdownEditor
                        content={document.content}
                        onChange={markdown => change({ ...document, content: { ...document.content, markdown } })}
                        onEvidence={setEvidenceId}
                    />
                ) : (
                    <div data-testid="work-markdown" dangerouslySetInnerHTML={{ __html: renderWorkMarkdown(document.content) }} />
                )}
            </div>
            {!editing ? (
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
            <Sheet
                open={Boolean(evidenceId)}
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
                                    {item.title} · {item.connectionName}
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
            <details className="mt-8 border-t pt-4">
                <summary>{t('Versions')}</summary>
                {query.data?.versions.map(version => (
                    <div className="my-2 flex items-center justify-between gap-3 text-sm" key={version.revision}>
                        <span>
                            v{version.revision} · {new Date(version.createdAt).toLocaleString()}
                        </span>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || dirty || mutation.isPending || version.revision === document.revision || Boolean(document.archivedAt)}
                            onClick={() => {
                                setEditing(null);
                                mutation.mutate({ action: 'restore', revision: version.revision, expectedRevision: document.revision });
                            }}
                        >
                            {t('Restore')}
                        </Button>
                    </div>
                ))}
            </details>
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
        </article>
    );
}

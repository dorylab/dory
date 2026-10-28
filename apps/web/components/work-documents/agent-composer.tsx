'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { FileUIPart } from 'ai';
import type { AnalysisScope } from '@dory/shared/types/work-document';
import type { Editor } from '@tiptap/core';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ArrowUp, AtSign, FileText, Folder, Loader2, Paperclip, Plus, Square, X } from 'lucide-react';

import { Button } from '@/registry/new-york-v4/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { attachmentAccept, validateAttachmentSizes, validateAttachmentHeader, attachmentLimits, attachmentMediaType, AttachmentError } from '@/lib/chat-context/attachments';
import { referenceKey, type ChatReference, type ChatSubmission, type MentionSpan } from '@/lib/chat-context/types';
import { useMutation } from '@tanstack/react-query';
import { storedAttachmentId } from '@/lib/chat-context/attachments';
import { useRecentReferences } from '@/lib/chat-context/use-recent-references';
import { mentionLabel, referenceInScope } from '@/lib/chat-context/mentions';
import { ResourceMentionEditor } from './resource-mention-editor';

export function AgentComposer({
    text,
    onTextChange,
    onSubmit,
    onStop,
    scope,
    chatId = null,
    runIds = [],
    busy = false,
    disabled = false,
    ready = true,
    sourceNames = {},
    restoreDraft,
    children,
    toolbar,
}: {
    text: string;
    onTextChange: (text: string) => void;
    onSubmit: (message: ChatSubmission) => Promise<boolean | void> | boolean | void;
    onStop?: () => void;
    scope: AnalysisScope;
    chatId?: string | null;
    runIds?: string[];
    busy?: boolean;
    disabled?: boolean;
    ready?: boolean;
    sourceNames?: Record<string, string>;
    restoreDraft?: ChatSubmission | null;
    children?: ReactNode;
    toolbar?: ReactNode;
}) {
    const t = useTranslations('ChatComposer');
    const { organization } = useParams<{ organization: string }>();
    const [references, setReferences] = useState<ChatReference[]>([]);
    const [files, setFiles] = useState<FileUIPart[]>([]);
    const [report, setReport] = useState(false);
    const [reading, setReading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [mentionSpans, setMentionSpans] = useState<MentionSpan[]>([]);
    const editorRef = useRef<Editor | null>(null);
    const openPickerRef = useRef<(() => void) | null>(null);
    const mentionMenuSelected = useRef(false);
    const recents = useRecentReferences(organization);
    const invalidReferences = references.some(reference => !referenceInScope(reference, scope));
    const fileInput = useRef<HTMLInputElement>(null);
    const folderInput = useRef<HTMLInputElement>(null);
    const sending = useRef(false);
    const localFiles = useRef(new Map<string, File>());
    const uploadController = useRef<AbortController | null>(null);
    useEffect(
        () => () => {
            uploadController.current?.abort();
            for (const url of localFiles.current.keys()) URL.revokeObjectURL(url);
            localFiles.current.clear();
        },
        [],
    );
    const attemptId = useRef<string | null>(null);
    const restoredDraft = useRef<ChatSubmission | null>(null);
    useEffect(() => {
        if (!restoreDraft || restoreDraft === restoredDraft.current) return;
        restoredDraft.current = restoreDraft;
        attemptId.current = restoreDraft.id ?? null;
        let restoredText = restoreDraft.text;
        const spans = [...(restoreDraft.mentionSpans ?? [])];
        if (!restoreDraft.mentionSpans) {
            for (const reference of restoreDraft.references ?? []) {
                restoredText += restoredText ? ' ' : '';
                const start = restoredText.length;
                restoredText += mentionLabel(reference);
                spans.push({ start, end: restoredText.length, referenceKey: referenceKey(reference) });
            }
        }
        setMentionSpans(spans);
        onTextChange(restoredText);
        setFiles(restoreDraft.files);
        setReferences(restoreDraft.references ?? []);
        setReport(restoreDraft.outputIntent === 'report');
    }, [restoreDraft, onTextChange]);
    const discard = useMutation({
        mutationFn: async (file: FileUIPart) => {
            if (storedAttachmentId(file)) await fetch(file.url, { method: 'DELETE' });
        },
    });
    const upload = useMutation({
        mutationFn: async (file: FileUIPart | File) => {
            if (!(file instanceof File)) {
                if (storedAttachmentId(file)) return file;
                // Legacy restored drafts may still contain inline file parts.
                const original = localFiles.current.get(file.url);
                file = original ?? new File([await (await fetch(file.url)).blob()], file.filename ?? 'attachment');
            }
            const controller = new AbortController();
            uploadController.current = controller;
            const response = await fetch('/api/chat/attachments', {
                signal: controller.signal,
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream', 'X-Dory-Filename': encodeURIComponent(file.webkitRelativePath || file.name) },
                body: file,
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error || t('SendFailed'));
            return body.file as FileUIPart;
        },
    });
    const addFiles = async (selected: FileList | null) => {
        if (!selected || disabled) return;
        setReading(true);
        setError('');
        try {
            if (files.length + selected.length > attachmentLimits.count) throw new AttachmentError('limit');
            validateAttachmentSizes([
                ...files.map(file => ({ filename: file.filename, byteSize: (file as FileUIPart & { byteSize: number }).byteSize })),
                ...Array.from(selected, file => ({ filename: file.name, byteSize: file.size })),
            ]);
            const added: FileUIPart[] = [];
            try {
                for (const file of Array.from(selected)) {
                    const filename = file.webkitRelativePath || file.name;
                    const mediaType = attachmentMediaType(filename);
                    validateAttachmentHeader(filename, new Uint8Array(await file.slice(0, 16).arrayBuffer()));
                    const url = URL.createObjectURL(file);
                    localFiles.current.set(url, file);
                    added.push({ type: 'file', filename, mediaType, url, byteSize: file.size } as FileUIPart);
                }
            } catch (error) {
                for (const file of added) {
                    URL.revokeObjectURL(file.url);
                    localFiles.current.delete(file.url);
                }
                throw error;
            }
            const next = [...files, ...added];
            attemptId.current = null;
            setFiles(next);
        } catch (cause) {
            setError(
                cause instanceof AttachmentError
                    ? t(`AttachmentErrors.${cause.reason}`, { filename: cause.filename, size: (cause.byteSize / 1024 / 1024).toFixed(2) })
                    : t('ReadFailed'),
            );
        } finally {
            setReading(false);
            if (fileInput.current) fileInput.current.value = '';
            if (folderInput.current) folderInput.current.value = '';
        }
    };
    const submit = async () => {
        if (invalidReferences || sending.current || busy || disabled || !ready || reading || upload.isPending || (!text.trim() && !files.length && !references.length && !report))
            return;
        sending.current = true;
        setSubmitting(true);
        setError('');
        attemptId.current ??= crypto.randomUUID();
        const draft = {
            id: attemptId.current,
            text: text.trim() ? text : report ? t('ReportPrompt') : t('AttachmentPrompt'),
            files,
            references,
            mentionSpans,
            outputIntent: report ? ('report' as const) : ('answer' as const),
        };
        try {
            const uploaded = [...files];
            for (let index = 0; index < uploaded.length; index++) {
                const previous = uploaded[index];
                uploaded[index] = await upload.mutateAsync(previous);
                if (localFiles.current.delete(previous.url)) URL.revokeObjectURL(previous.url);
                setFiles([...uploaded]);
            }
            const result = await onSubmit({ ...draft, files: uploaded });
            if (result !== false) {
                if (result === true) recents.record(references);
                attemptId.current = null;
                onTextChange('');
                setFiles([]);
                setReferences([]);
                setReport(false);
                setMentionSpans([]);
            }
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : t('SendFailed'));
        } finally {
            sending.current = false;
            setSubmitting(false);
        }
    };
    const locked = disabled || reading || submitting;
    return (
        <form
            onSubmit={event => {
                event.preventDefault();
                void submit();
            }}
            className="relative rounded-2xl border bg-background shadow-sm transition-[border-color,box-shadow] focus-within:border-ring dark:bg-muted"
            data-testid="agent-composer"
        >
            {children}
            <input ref={fileInput} type="file" multiple accept={attachmentAccept} hidden onChange={event => void addFiles(event.target.files)} />
            <input ref={folderInput} type="file" multiple hidden {...{ webkitdirectory: '' }} onChange={event => void addFiles(event.target.files)} />
            {(report || files.length > 0) && (
                <div className="flex flex-wrap gap-2 px-3 pt-3">
                    {report && (
                        <span className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-xs">
                            <FileText className="size-3" />
                            {t('ReportMode')}
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-5"
                                aria-label={t('Remove', { name: 'Report' })}
                                disabled={locked}
                                onClick={() => {
                                    attemptId.current = null;
                                    setReport(false);
                                }}
                            >
                                <X className="size-3" />
                            </Button>
                        </span>
                    )}
                    {files.map((file, index) => (
                        <span key={`${file.filename}:${index}`} className="inline-flex max-w-full items-center gap-2 rounded-md border px-2 py-1 text-xs">
                            {file.mediaType.startsWith('image/') ? (
                                <Image unoptimized width={40} height={40} src={file.url} alt={file.filename ?? ''} className="size-10 rounded object-cover" />
                            ) : (
                                <Paperclip className="size-3 shrink-0" />
                            )}
                            <span className="truncate">{file.filename}</span>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-5 shrink-0"
                                aria-label={t('Remove', { name: file.filename ?? '' })}
                                disabled={locked}
                                onClick={() => {
                                    attemptId.current = null;
                                    if (localFiles.current.delete(file.url)) URL.revokeObjectURL(file.url);
                                    discard.mutate(file);
                                    setFiles(previous => previous.filter((_, i) => i !== index));
                                }}
                            >
                                <X className="size-3" />
                            </Button>
                        </span>
                    ))}
                </div>
            )}
            <ResourceMentionEditor
                draft={{ text, references, mentionSpans }}
                onChange={draft => {
                    attemptId.current = null;
                    onTextChange(draft.text);
                    setReferences(draft.references);
                    setMentionSpans(draft.mentionSpans);
                }}
                onSubmit={() => void submit()}
                onError={setError}
                disabled={locked}
                organization={organization}
                chatId={chatId}
                runIds={runIds}
                scope={scope}
                recent={recents.recent}
                sourceNames={sourceNames}
                editorRef={editorRef}
                openPickerRef={openPickerRef}
            />
            {invalidReferences && (
                <p role="alert" className="px-3 pb-2 text-sm text-destructive">
                    {t('Picker.OutOfScope')}
                </p>
            )}
            {error && (
                <p role="alert" className="px-3 pb-2 text-sm text-destructive">
                    {error}
                </p>
            )}
            <div className="flex items-end gap-2 px-3 pb-3">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" className="rounded-full" aria-label={t('Add')} disabled={locked}>
                                <Plus className="size-5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            align="start"
                            side="top"
                            onCloseAutoFocus={event => {
                                if (!mentionMenuSelected.current) return;
                                event.preventDefault();
                                mentionMenuSelected.current = false;
                                openPickerRef.current?.();
                            }}
                        >
                            <DropdownMenuItem
                                onSelect={() => {
                                    mentionMenuSelected.current = true;
                                }}
                            >
                                <AtSign className="size-4" />
                                {t('MentionResource')}
                                <DropdownMenuShortcut>@</DropdownMenuShortcut>
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => fileInput.current?.click()}>
                                <Paperclip className="size-4" />
                                {t('AddFiles')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => folderInput.current?.click()}>
                                <Folder className="size-4" />
                                {t('AddFolder')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onSelect={() => {
                                    attemptId.current = null;
                                    setReport(true);
                                    editorRef.current?.commands.focus();
                                }}
                            >
                                <FileText className="size-4" />
                                {t('ReportMode')}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    {toolbar}
                </div>
                {upload.isPending ? (
                    <Button type="button" size="icon" className="rounded-full" variant="secondary" aria-label={t('Stop')} onClick={() => uploadController.current?.abort()}>
                        <Square className="size-4" />
                    </Button>
                ) : busy && onStop ? (
                    <Button type="button" size="icon" className="rounded-full" variant="secondary" aria-label={t('Stop')} onClick={onStop}>
                        <Square className="size-4" />
                    </Button>
                ) : (
                    <Button
                        type="submit"
                        size="icon"
                        className="rounded-full"
                        aria-label={t('Send')}
                        disabled={invalidReferences || locked || !ready || (!text.trim() && !files.length && !references.length && !report)}
                    >
                        {reading || upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                    </Button>
                )}
            </div>
        </form>
    );
}

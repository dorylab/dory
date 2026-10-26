'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { FileUIPart } from 'ai';
import type { AnalysisScope } from '@dory/shared/types/work-document';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ArrowUp, FileText, Folder, Loader2, Paperclip, Plus, Square, X } from 'lucide-react';

import { Button } from '@/registry/new-york-v4/ui/button';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { attachmentAccept, validateAttachmentSizes, validateAttachmentHeader, attachmentLimits, attachmentMediaType, AttachmentError } from '@/lib/chat-context/attachments';
import { referenceKey, type ChatReference, type ChatSubmission } from '@/lib/chat-context/types';
import { useMutation } from '@tanstack/react-query';
import { storedAttachmentId } from '@/lib/chat-context/attachments';
import { useChatReferences } from '@/lib/chat-context/use-references';

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
    const [mention, setMention] = useState<{ start: number; end: number; query: string } | null>(null);
    const [active, setActive] = useState(0);
    const textarea = useRef<HTMLTextAreaElement>(null);
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
        onTextChange(restoreDraft.text);
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
    const listId = useId();
    const [search, setSearch] = useState<string | null>(null);
    useEffect(() => {
        const timer = setTimeout(() => setSearch(mention?.query ?? null), 180);
        return () => clearTimeout(timer);
    }, [mention?.query]);
    const candidates = useChatReferences(organization, chatId, scope, search, runIds);
    const options = (['table', 'report', 'artifact'] as const).flatMap(kind => candidates.options.filter(item => item.reference.kind === kind)).slice(0, 60);
    const scopeKey = JSON.stringify(scope);
    useEffect(() => {
        const selectedScope = JSON.parse(scopeKey) as AnalysisScope;
        setReferences(previous =>
            previous.filter(
                ref =>
                    ref.kind !== 'table' ||
                    selectedScope.connectionMode === 'auto' ||
                    (!selectedScope.connectionMode && !selectedScope.connectionIds.length) ||
                    (selectedScope.connectionIds.includes(ref.connectionId) &&
                        (!selectedScope.databasesByConnection?.[ref.connectionId] || selectedScope.databasesByConnection[ref.connectionId] === ref.database)),
            ),
        );
        setMention(null);
    }, [scopeKey]);
    const inspectCursor = (element: HTMLTextAreaElement) => {
        const cursor = element.selectionStart;
        const match = /(?:^|\s)@([^@\n]*)$/.exec(element.value.slice(0, cursor));
        setMention(match ? { start: cursor - match[1].length - 1, end: cursor, query: match[1] } : null);
        setActive(0);
    };
    const choose = (reference: ChatReference) => {
        if (!mention) return;
        attemptId.current = null;
        if (references.length >= 20) {
            setError(t('ReferenceLimit'));
            return;
        }
        setReferences(previous => [...new Map([...previous, reference].map(item => [referenceKey(item), item])).values()]);
        onTextChange(text.slice(0, mention.start) + text.slice(mention.end));
        const cursor = mention.start;
        setMention(null);
        requestAnimationFrame(() => {
            textarea.current?.focus();
            textarea.current?.setSelectionRange(cursor, cursor);
        });
    };
    const addFiles = async (selected: FileList | null) => {
        if (!selected || busy || disabled) return;
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
        if (sending.current || busy || disabled || !ready || reading || upload.isPending || (!text.trim() && !files.length && !references.length && !report)) return;
        sending.current = true;
        setSubmitting(true);
        setError('');
        attemptId.current ??= crypto.randomUUID();
        const draft = {
            id: attemptId.current,
            text: text.trim() || (report ? t('ReportPrompt') : t('AttachmentPrompt')),
            files,
            references,
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
                attemptId.current = null;
                onTextChange('');
                setFiles([]);
                setReferences([]);
                setReport(false);
                setMention(null);
            }
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : t('SendFailed'));
        } finally {
            sending.current = false;
            setSubmitting(false);
        }
    };
    const locked = disabled || busy || reading || submitting;
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
            {(report || references.length > 0 || files.length > 0) && (
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
                    {references.map(reference => (
                        <span
                            key={referenceKey(reference)}
                            className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs"
                            title={reference.kind === 'table' ? `${reference.connectionId} / ${reference.database} / ${reference.table}` : reference.title}
                        >
                            <span className="truncate">@{reference.title}</span>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-5 shrink-0"
                                aria-label={t('Remove', { name: reference.title })}
                                disabled={locked}
                                onClick={() => {
                                    attemptId.current = null;
                                    setReferences(previous => previous.filter(item => referenceKey(item) !== referenceKey(reference)));
                                }}
                            >
                                <X className="size-3" />
                            </Button>
                        </span>
                    ))}
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
            {mention && (
                <div
                    className="absolute bottom-full left-0 z-30 mb-2 max-h-72 w-full max-w-lg overflow-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
                    role="listbox"
                    id={listId}
                    aria-label={t('References')}
                >
                    {candidates.loading && (
                        <div className="p-2 text-sm text-muted-foreground">
                            <Loader2 className="inline size-4 animate-spin" /> {t('Loading')}
                        </div>
                    )}
                    {candidates.error && (
                        <div role="alert" className="p-2 text-sm text-destructive">
                            {t('SearchFailed')}{' '}
                            <Button type="button" variant="ghost" size="sm" onClick={candidates.retry}>
                                {t('Retry')}
                            </Button>
                        </div>
                    )}
                    {!candidates.loading && options.length === 0 && <div className="p-2 text-sm text-muted-foreground">{t('NoReferences')}</div>}
                    {options.map((option, index) => (
                        <div key={referenceKey(option.reference)}>
                            {(index === 0 || options[index - 1].reference.kind !== option.reference.kind) && (
                                <div className="px-2 py-1 text-xs font-medium text-muted-foreground">{t(`Kinds.${option.reference.kind}`)}</div>
                            )}
                            <button
                                type="button"
                                role="option"
                                id={`${listId}-${index}`}
                                aria-selected={index === active}
                                onMouseDown={event => event.preventDefault()}
                                onClick={() => choose(option.reference)}
                                className={`flex w-full flex-col rounded px-2 py-2 text-left text-sm ${index === active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent'}`}
                            >
                                <span className="max-w-full truncate">{option.reference.title}</span>
                                <span className="max-w-full truncate text-xs text-muted-foreground">
                                    {option.current ? `${t('CurrentChat')} · ` : ''}
                                    {option.reference.kind === 'table'
                                        ? [sourceNames[option.reference.connectionId] ?? option.reference.connectionId, option.reference.database, option.reference.schema]
                                              .filter(Boolean)
                                              .join(' / ')
                                        : option.detail}
                                </span>
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <Textarea
                ref={textarea}
                value={text}
                aria-label={t('Question')}
                placeholder={t('Placeholder')}
                disabled={locked}
                aria-autocomplete="list"
                aria-controls={mention ? listId : undefined}
                aria-activedescendant={mention && options[active] ? `${listId}-${active}` : undefined}
                onChange={event => {
                    attemptId.current = null;
                    onTextChange(event.target.value);
                    inspectCursor(event.target);
                }}
                onClick={event => inspectCursor(event.currentTarget)}
                onSelect={event => inspectCursor(event.currentTarget)}
                onBlur={() => setMention(null)}
                onKeyDown={event => {
                    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                    if (mention && ['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(event.key) && !event.shiftKey) {
                        event.preventDefault();
                        if (event.key === 'Escape') setMention(null);
                        else if (event.key === 'Enter') {
                            if (options[active]) choose(options[active].reference);
                        } else {
                            const next = (active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % Math.max(options.length, 1);
                            setActive(next);
                            document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: 'nearest' });
                        }
                        return;
                    }
                    if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void submit();
                    }
                }}
                className="min-h-24 resize-none rounded-none border-0 bg-transparent px-4 pt-4 pb-3 shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
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
                        <DropdownMenuContent align="start" side="top">
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
                                    textarea.current?.focus();
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
                        disabled={locked || !ready || (!text.trim() && !files.length && !references.length && !report)}
                    >
                        {reading || upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
                    </Button>
                )}
            </div>
        </form>
    );
}

'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileCode2, FileText, MoreHorizontal, Pencil, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/registry/new-york-v4/ui/alert-dialog';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';

type DataSource = { connectionId: string; name: string; type: string; engine: string };
type Definition = {
    id: string;
    name: string;
    kind: 'entity' | 'metric' | 'measure' | 'dimension' | 'relationship';
    status: 'verified' | 'unverified';
    sourceConnectionId: string;
    description?: string;
    aliases?: string[];
    source?: string;
    expression?: string;
    filters?: string[];
    timeDimension?: string;
    dimensions?: string[];
    from?: string;
    to?: string;
};
type KnowledgeSourceSummary = {
    id: string;
    organizationId: string;
    semanticModelId: string;
    connectionId: string | null;
    fileName: string;
    format: 'markdown' | 'yaml' | 'text';
    byteSize: number;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string;
};
type KnowledgeSource = KnowledgeSourceSummary & { contentText: string };
type PendingFile = { key: string; fileName: string; contentText: string; byteSize: number; connectionId: string | null };
type ImportSuggestion = Omit<Definition, 'sourceConnectionId'> & { sourceConnectionId?: string };

const MAX_FILE_BYTES = 500_000;
const MAX_FILES_PER_UPLOAD = 20;
const SUPPORTED_FILE_NAME = /\.(md|markdown|ya?ml|txt)$/i;
const MonacoYamlEditor = dynamic(() => import('@/components/@dory/ui/monaco-editor'), {
    ssr: false,
    loading: () => <div className="h-full animate-pulse bg-muted" aria-label="Loading YAML editor" />,
});

const knowledgeSourcesKey = (semanticModelId: string) => ['semantic-model', semanticModelId, 'knowledge-sources'] as const;

function formatBytes(bytes: number) {
    if (bytes < 1_000) return `${bytes} B`;
    return `${(bytes / 1_000).toFixed(bytes < 10_000 ? 1 : 0)} KB`;
}

function ScopeSelect({ value, dataSources, onChange }: { value: string | null; dataSources: DataSource[]; onChange: (value: string | null) => void }) {
    const t = useTranslations('SemanticContext.KnowledgeSources');
    return (
        <select className="h-9 rounded-md border bg-background px-3 text-sm" value={value ?? ''} onChange={event => onChange(event.target.value || null)}>
            <option value="">{t('Shared')}</option>
            {dataSources.map(source => (
                <option key={source.connectionId} value={source.connectionId}>
                    {source.name}
                </option>
            ))}
        </select>
    );
}

function UploadSourcesDialog({
    open,
    onOpenChange,
    organization,
    semanticModelId,
    dataSources,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organization: string;
    semanticModelId: string;
    dataSources: DataSource[];
}) {
    const t = useTranslations('SemanticContext.KnowledgeSources');
    const queryClient = useQueryClient();
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [files, setFiles] = useState<PendingFile[]>([]);

    const addFiles = async (selected: File[]) => {
        const accepted = selected.slice(0, MAX_FILES_PER_UPLOAD).filter(file => {
            if (!SUPPORTED_FILE_NAME.test(file.name)) {
                toast.error(t('Unsupported', { name: file.name }));
                return false;
            }
            if (file.size > MAX_FILE_BYTES) {
                toast.error(t('TooLarge', { name: file.name }));
                return false;
            }
            return true;
        });
        const next = await Promise.all(
            accepted.map(async file => ({
                key: `${file.name}:${file.size}:${file.lastModified}`,
                fileName: file.name,
                contentText: await file.text(),
                byteSize: file.size,
                connectionId: null,
            })),
        );
        setFiles(current => [...current, ...next.filter(item => !current.some(existing => existing.fileName === item.fileName))].slice(0, MAX_FILES_PER_UPLOAD));
    };

    const upload = useMutation({
        mutationFn: async () => {
            const results = await Promise.allSettled(
                files.map(file =>
                    executeActionClient<KnowledgeSource>(
                        'semantic.createKnowledgeSource',
                        { semanticModelId, fileName: file.fileName, contentText: file.contentText, connectionId: file.connectionId },
                        { organizationId: organization },
                    ),
                ),
            );
            return {
                uploadedNames: results.flatMap((result, index) => (result.status === 'fulfilled' ? [files[index]!.fileName] : [])),
                errors: results.filter((result): result is PromiseRejectedResult => result.status === 'rejected').map(result => String(result.reason)),
            };
        },
        onSuccess: result => {
            void queryClient.invalidateQueries({ queryKey: knowledgeSourcesKey(semanticModelId) });
            if (result.uploadedNames.length) toast.success(t('Uploaded', { count: result.uploadedNames.length }));
            result.errors.forEach(error => toast.error(error));
            if (result.uploadedNames.length === files.length) {
                setFiles([]);
                onOpenChange(false);
            } else {
                const uploadedNames = new Set(result.uploadedNames);
                setFiles(current => current.filter(file => !uploadedNames.has(file.fileName)));
            }
        },
    });

    return (
        <Dialog
            open={open}
            onOpenChange={next => {
                onOpenChange(next);
                if (!next && !upload.isPending) setFiles([]);
            }}
        >
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t('UploadTitle')}</DialogTitle>
                    <DialogDescription>{t('UploadDescription')}</DialogDescription>
                </DialogHeader>
                <button
                    type="button"
                    className="flex min-h-36 w-full flex-col items-center justify-center rounded-md border border-dashed bg-muted/20 px-6 text-center transition-colors hover:bg-muted/35"
                    onClick={() => inputRef.current?.click()}
                    onDragOver={event => event.preventDefault()}
                    onDrop={event => {
                        event.preventDefault();
                        void addFiles(Array.from(event.dataTransfer.files));
                    }}
                >
                    <Upload className="size-5" />
                    <span className="mt-3 text-sm font-medium">{t('Drop')}</span>
                    <span className="mt-1 text-xs text-muted-foreground">{t('Limits')}</span>
                    <input
                        ref={inputRef}
                        type="file"
                        multiple
                        accept=".md,.markdown,.yaml,.yml,.txt,text/markdown,text/plain,application/yaml,text/yaml"
                        className="hidden"
                        onChange={event => {
                            const selected = Array.from(event.target.files ?? []);
                            event.target.value = '';
                            void addFiles(selected);
                        }}
                    />
                </button>
                {files.length ? (
                    <div className="max-h-64 divide-y overflow-y-auto rounded-md border">
                        {files.map(file => (
                            <div key={file.key} className="flex items-center gap-3 p-3">
                                <FileText className="size-4 shrink-0 text-muted-foreground" />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">{file.fileName}</div>
                                    <div className="text-xs text-muted-foreground">{formatBytes(file.byteSize)}</div>
                                </div>
                                <ScopeSelect
                                    value={file.connectionId}
                                    dataSources={dataSources}
                                    onChange={connectionId => setFiles(current => current.map(item => (item.key === file.key ? { ...item, connectionId } : item)))}
                                />
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`Remove ${file.fileName}`}
                                    onClick={() => setFiles(current => current.filter(item => item.key !== file.key))}
                                >
                                    <Trash2 />
                                </Button>
                            </div>
                        ))}
                    </div>
                ) : null}
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={upload.isPending}>
                        {t('Cancel')}
                    </Button>
                    <Button onClick={() => upload.mutate()} disabled={!files.length || upload.isPending}>
                        {upload.isPending ? t('Uploading') : t('UploadCount', { count: files.length })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function SourceEditorDialog({
    source,
    open,
    onOpenChange,
    organization,
    semanticModelId,
    dataSources,
}: {
    source: KnowledgeSourceSummary | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organization: string;
    semanticModelId: string;
    dataSources: DataSource[];
}) {
    const t = useTranslations('SemanticContext.KnowledgeSources');
    const queryClient = useQueryClient();
    const detail = useQuery({
        queryKey: [...knowledgeSourcesKey(semanticModelId), source?.id],
        queryFn: () => executeActionClient<KnowledgeSource>('semantic.getKnowledgeSource', { semanticModelId, id: source!.id }, { organizationId: organization }),
        enabled: Boolean(source && open),
    });
    const [contentText, setContentText] = useState('');
    const [connectionId, setConnectionId] = useState<string | null>(null);
    useEffect(() => {
        if (!detail.data) return;
        setContentText(detail.data.contentText);
        setConnectionId(detail.data.connectionId);
    }, [detail.data]);
    const save = useMutation({
        mutationFn: () =>
            executeActionClient<KnowledgeSource>(
                'semantic.updateKnowledgeSource',
                { semanticModelId, id: source!.id, contentText, connectionId },
                { organizationId: organization },
            ),
        onSuccess: updated => {
            queryClient.setQueryData([...knowledgeSourcesKey(semanticModelId), updated.id], updated);
            void queryClient.invalidateQueries({ queryKey: knowledgeSourcesKey(semanticModelId) });
            onOpenChange(false);
            toast.success(t('Saved'));
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('SaveFailed')),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[min(42rem,calc(100dvh-2rem))] flex-col sm:max-w-3xl">
                <DialogHeader className="shrink-0">
                    <DialogTitle>{source?.fileName ?? t('Title')}</DialogTitle>
                    <DialogDescription>{t('EditorDescription')}</DialogDescription>
                </DialogHeader>
                <div className="flex shrink-0 items-center gap-3">
                    <ScopeSelect value={connectionId} dataSources={dataSources} onChange={setConnectionId} />
                    {source ? <Badge variant="outline">{source.format}</Badge> : null}
                    {source ? <span className="text-xs text-muted-foreground">{formatBytes(new TextEncoder().encode(contentText).byteLength)}</span> : null}
                </div>
                <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
                    {detail.isLoading ? (
                        <div className="h-full animate-pulse bg-muted" />
                    ) : source?.format === 'yaml' ? (
                        <MonacoYamlEditor
                            height="100%"
                            language="yaml"
                            value={contentText}
                            onChange={value => setContentText(value ?? '')}
                            options={{
                                automaticLayout: true,
                                minimap: { enabled: false },
                                fontSize: 13,
                                lineNumbers: 'off',
                                lineNumbersMinChars: 0,
                                scrollBeyondLastLine: false,
                                tabSize: 2,
                                wordWrap: 'on',
                            }}
                        />
                    ) : (
                        <Textarea
                            className="h-full resize-none rounded-none border-0 font-mono focus-visible:ring-0"
                            value={contentText}
                            onChange={event => setContentText(event.target.value)}
                        />
                    )}
                </div>
                <DialogFooter className="shrink-0">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t('Cancel')}
                    </Button>
                    <Button onClick={() => save.mutate()} disabled={!detail.data || save.isPending || new TextEncoder().encode(contentText).byteLength > MAX_FILE_BYTES}>
                        {save.isPending ? t('Saving') : t('Save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ImportReviewDialog({
    source,
    suggestions,
    existingDefinitions,
    dataSources,
    onOpenChange,
    onImport,
}: {
    source: KnowledgeSourceSummary | null;
    suggestions: ImportSuggestion[];
    existingDefinitions: Definition[];
    dataSources: DataSource[];
    onOpenChange: (open: boolean) => void;
    onImport: (definitions: Definition[]) => void;
}) {
    const t = useTranslations('SemanticContext.KnowledgeSources');
    const existingIds = new Set(existingDefinitions.map(item => item.id));
    const [drafts, setDrafts] = useState<ImportSuggestion[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    useEffect(() => {
        setDrafts(suggestions);
        setSelectedIds(suggestions.filter(item => !existingIds.has(item.id)).map(item => item.id));
        // The existing definition set is fixed while the review dialog is open.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [suggestions]);
    const selected = drafts.filter(item => selectedIds.includes(item.id));
    const canImport = selected.length > 0 && selected.every(item => Boolean(item.sourceConnectionId));
    const accept = () => {
        if (!canImport) return;
        const selectedIdSet = new Set(selected.map(item => item.id));
        onImport([
            ...existingDefinitions.filter(item => !selectedIdSet.has(item.id)),
            ...selected.map(item => ({ ...item, sourceConnectionId: item.sourceConnectionId!, status: 'unverified' as const })),
        ]);
        onOpenChange(false);
    };
    return (
        <Dialog open={Boolean(source && suggestions.length)} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[min(42rem,calc(100dvh-2rem))] flex-col sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{t('ReviewTitle', { name: source?.fileName ?? '' })}</DialogTitle>
                    <DialogDescription>{t('ReviewDescription')}</DialogDescription>
                </DialogHeader>
                <div className="min-h-0 flex-1 divide-y overflow-y-auto rounded-md border">
                    {drafts.map(item => {
                        const conflict = existingIds.has(item.id);
                        const checked = selectedIds.includes(item.id);
                        return (
                            <div key={item.id} className="grid gap-3 p-3 sm:grid-cols-[1fr_14rem]">
                                <label className="flex min-w-0 items-start gap-3">
                                    <input
                                        type="checkbox"
                                        className="mt-1"
                                        checked={checked}
                                        onChange={() => setSelectedIds(current => (checked ? current.filter(id => id !== item.id) : [...current, item.id]))}
                                    />
                                    <span className="min-w-0">
                                        <span className="flex items-center gap-2 font-medium">
                                            {item.name}
                                            <Badge variant="outline">{item.kind}</Badge>
                                            {conflict ? <Badge variant="secondary">{t('ExistingReplace')}</Badge> : null}
                                        </span>
                                        {item.description ? <span className="mt-1 block text-xs text-muted-foreground">{item.description}</span> : null}
                                    </span>
                                </label>
                                <select
                                    className="h-9 rounded-md border bg-background px-3 text-sm"
                                    value={item.sourceConnectionId ?? ''}
                                    onChange={event =>
                                        setDrafts(current =>
                                            current.map(draft => (draft.id === item.id ? { ...draft, sourceConnectionId: event.target.value || undefined } : draft)),
                                        )
                                    }
                                >
                                    <option value="">{t('SelectDataSource')}</option>
                                    {dataSources.map(dataSource => (
                                        <option key={dataSource.connectionId} value={dataSource.connectionId}>
                                            {dataSource.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        );
                    })}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t('Cancel')}
                    </Button>
                    <Button onClick={accept} disabled={!canImport}>
                        {t('ImportCount', { count: selected.length })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function KnowledgeSourcesPanel({
    organization,
    semanticModelId,
    dataSources,
    definitions,
    onImportDefinitions,
}: {
    organization: string;
    semanticModelId: string;
    dataSources: DataSource[];
    definitions: Definition[];
    onImportDefinitions: (definitions: Definition[]) => void;
}) {
    const t = useTranslations('SemanticContext.KnowledgeSources');
    const queryClient = useQueryClient();
    const [uploadOpen, setUploadOpen] = useState(false);
    const [editing, setEditing] = useState<KnowledgeSourceSummary | null>(null);
    const [deleting, setDeleting] = useState<KnowledgeSourceSummary | null>(null);
    const [reviewing, setReviewing] = useState<KnowledgeSourceSummary | null>(null);
    const [suggestions, setSuggestions] = useState<ImportSuggestion[]>([]);
    const sources = useQuery({
        queryKey: knowledgeSourcesKey(semanticModelId),
        queryFn: () => executeActionClient<{ sources: KnowledgeSourceSummary[] }>('semantic.listKnowledgeSources', { semanticModelId }, { organizationId: organization }),
    });
    const previewImport = useMutation({
        mutationFn: (source: KnowledgeSourceSummary) =>
            executeActionClient<{ suggestions: ImportSuggestion[] }>('semantic.previewKnowledgeSourceImport', { semanticModelId, id: source.id }, { organizationId: organization }),
        onSuccess: (result, source) => {
            if (!result.suggestions.length) {
                toast.error(t('NoImportable'));
                return;
            }
            setReviewing(source);
            setSuggestions(result.suggestions);
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('ParseFailed')),
    });
    const remove = useMutation({
        mutationFn: (source: KnowledgeSourceSummary) =>
            executeActionClient(
                'semantic.deleteKnowledgeSource',
                { semanticModelId, id: source.id },
                { organizationId: organization, confirmationToken: 'semantic.deleteKnowledgeSource' },
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: knowledgeSourcesKey(semanticModelId) });
            setDeleting(null);
            toast.success(t('Deleted'));
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('DeleteFailed')),
    });
    const scopeName = (source: KnowledgeSourceSummary) =>
        source.connectionId ? (dataSources.find(item => item.connectionId === source.connectionId)?.name ?? t('UnavailableDataSource')) : t('Shared');

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
                <p className="max-w-2xl text-sm text-muted-foreground">{t('Description')}</p>
                <Button onClick={() => setUploadOpen(true)}>
                    <Upload />
                    {t('Upload')}
                </Button>
            </div>
            {sources.isLoading ? <p className="text-sm text-muted-foreground">{t('Loading')}</p> : null}
            {sources.data?.sources.length ? (
                <div className="overflow-hidden rounded-md border bg-card">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-left text-muted-foreground">
                            <tr>
                                <th className="px-4 py-3 font-medium">{t('Name')}</th>
                                <th className="px-4 py-3 font-medium">{t('Type')}</th>
                                <th className="px-4 py-3 font-medium">{t('Scope')}</th>
                                <th className="px-4 py-3 font-medium">{t('Size')}</th>
                                <th className="px-4 py-3 font-medium">{t('Updated')}</th>
                                <th className="w-14" />
                            </tr>
                        </thead>
                        <tbody>
                            {sources.data.sources.map(source => (
                                <tr key={source.id} className="cursor-pointer border-t hover:bg-muted/30" onClick={() => setEditing(source)}>
                                    <td className="px-4 py-3">
                                        <span className="flex items-center gap-2 font-medium">
                                            {source.format === 'yaml' ? (
                                                <FileCode2 className="size-4 text-muted-foreground" />
                                            ) : (
                                                <FileText className="size-4 text-muted-foreground" />
                                            )}
                                            {source.fileName}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 capitalize text-muted-foreground">{source.format}</td>
                                    <td className="px-4 py-3 text-muted-foreground">{scopeName(source)}</td>
                                    <td className="px-4 py-3 text-muted-foreground">{formatBytes(source.byteSize)}</td>
                                    <td className="px-4 py-3 text-muted-foreground">{new Date(source.updatedAt).toLocaleDateString()}</td>
                                    <td className="px-4 py-3 text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${source.fileName}`} onClick={event => event.stopPropagation()}>
                                                    <MoreHorizontal />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" onClick={event => event.stopPropagation()}>
                                                <DropdownMenuItem onSelect={() => setEditing(source)}>
                                                    <Pencil /> {t('Edit')}
                                                </DropdownMenuItem>
                                                {source.format === 'yaml' ? (
                                                    <DropdownMenuItem onSelect={() => previewImport.mutate(source)}>
                                                        <FileCode2 /> {t('ReviewImport')}
                                                    </DropdownMenuItem>
                                                ) : null}
                                                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(source)}>
                                                    <Trash2 /> {t('Delete')}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : sources.data ? (
                <div className="flex min-h-64 flex-col items-center justify-center rounded-md border border-dashed px-6 text-center">
                    <FileText className="size-8 text-muted-foreground" />
                    <h3 className="mt-4 font-medium">{t('EmptyTitle')}</h3>
                    <p className="mt-1 max-w-md text-sm text-muted-foreground">{t('EmptyDescription')}</p>
                    <Button className="mt-4" onClick={() => setUploadOpen(true)}>
                        {t('Upload')}
                    </Button>
                </div>
            ) : null}
            <UploadSourcesDialog open={uploadOpen} onOpenChange={setUploadOpen} organization={organization} semanticModelId={semanticModelId} dataSources={dataSources} />
            <SourceEditorDialog
                source={editing}
                open={Boolean(editing)}
                onOpenChange={open => !open && setEditing(null)}
                organization={organization}
                semanticModelId={semanticModelId}
                dataSources={dataSources}
            />
            <ImportReviewDialog
                source={reviewing}
                suggestions={suggestions}
                existingDefinitions={definitions}
                dataSources={dataSources}
                onOpenChange={open => {
                    if (!open) {
                        setReviewing(null);
                        setSuggestions([]);
                    }
                }}
                onImport={onImportDefinitions}
            />
            <AlertDialog open={Boolean(deleting)} onOpenChange={open => !open && !remove.isPending && setDeleting(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('DeleteTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('DeleteDescription', { name: deleting?.fileName ?? '' })}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={remove.isPending}>{t('Cancel')}</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>
                            {remove.isPending ? t('Deleting') : t('Delete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

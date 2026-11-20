'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import { IconBrandGithub } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, FileText, Pencil, Trash2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';

import { knowledgeSourceDisplayName } from './knowledge-source-display';
import type { KnowledgeConnectorView } from './linear-connector-dialog';

type DataSource = { connectionId: string; name: string; type: string; engine: string };
export type KnowledgeSourceSummary = {
    id: string;
    organizationId: string;
    knowledgeModelId: string;
    connectionId: string | null;
    folderId: string | null;
    projectId: string | null;
    projectName: string | null;
    fileName: string;
    format: 'markdown' | 'yaml' | 'text';
    byteSize: number;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string;
    connectorId: string | null;
    connectorProvider: 'github' | 'linear' | 'local' | 'drive' | null;
    sourceUrl: string | null;
    remotePath: string | null;
    folderTrail?: { id: string; name: string }[] | null;
};
type KnowledgeSource = KnowledgeSourceSummary & { contentText: string; remoteRevision: string | null };
type PendingFile = { file: File; connectionId: string | null };
type KnowledgeConnector = KnowledgeConnectorView;
type GitHubRepository = { id: string; fullName: string; defaultBranch: string; private: boolean };
const MAX_FILE_BYTES = 10_000_000;
const MAX_FILES_PER_UPLOAD = 20;
const SUPPORTED_FILE_NAME = /\.(md|markdown|ya?ml|txt)$/i;
const MonacoYamlEditor = dynamic(() => import('@/components/@dory/ui/monaco-editor'), {
    ssr: false,
    loading: () => <div className="h-full animate-pulse bg-muted" />,
});
export const MarkdownViewer = dynamic(() => import('@/components/ai-elements/message').then(module => module.MessageResponse), { ssr: false });

const knowledgeSourcesKey = (knowledgeModelId: string) => ['knowledge-model', knowledgeModelId, 'knowledge-sources'] as const;

function formatBytes(bytes: number) {
    if (bytes < 1_000) return `${bytes} B`;
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
    return `${(bytes / 1_000).toFixed(bytes < 10_000 ? 1 : 0)} KB`;
}

function ScopeSelect({
    value,
    dataSources,
    onChange,
    disabled,
    className = 'w-full',
}: {
    value: string | null;
    dataSources: DataSource[];
    onChange: (value: string | null) => void;
    disabled?: boolean;
    className?: string;
}) {
    const t = useTranslations('Knowledge.KnowledgeSources');
    return (
        <Select disabled={disabled} value={value ?? '__shared__'} onValueChange={selected => onChange(selected === '__shared__' ? null : selected)}>
            <SelectTrigger className={className}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="__shared__">{t('Shared')}</SelectItem>
                {dataSources.map(source => (
                    <SelectItem key={source.connectionId} value={source.connectionId}>
                        {source.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

export function UploadSourcesDialog({
    open,
    onOpenChange,
    organization,
    knowledgeModelId,
    dataSources,
    folderId,
    targetPath,
    onUploaded,
    markdownOnly = false,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organization: string;
    knowledgeModelId: string;
    dataSources: DataSource[];
    folderId?: string | null;
    targetPath?: string;
    onUploaded?: () => void;
    markdownOnly?: boolean;
}) {
    const t = useTranslations('Knowledge.KnowledgeSources');
    const docs = useTranslations('Knowledge.Documents');
    const queryClient = useQueryClient();
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [files, setFiles] = useState<PendingFile[]>([]);

    const addFiles = (selected: File[]) => {
        const accepted = selected.slice(0, MAX_FILES_PER_UPLOAD).filter(file => {
            if (!(markdownOnly ? /\.(md|markdown)$/i : SUPPORTED_FILE_NAME).test(file.name)) {
                toast.error(t('Unsupported', { name: file.name }));
                return false;
            }
            if (file.size > MAX_FILE_BYTES) {
                toast.error(t('TooLarge', { name: file.name }));
                return false;
            }
            return true;
        });
        setFiles(current => {
            const byName = new Map(current.map(item => [item.file.name, item]));
            for (const file of accepted) {
                if (!byName.has(file.name)) byName.set(file.name, { file, connectionId: null });
            }
            return [...byName.values()].slice(0, MAX_FILES_PER_UPLOAD);
        });
    };

    const upload = useMutation({
        mutationFn: async () => {
            const results = await Promise.allSettled(
                files.map(async ({ file, connectionId }) =>
                    executeActionClient<KnowledgeSource>(
                        'knowledge.createKnowledgeSource',
                        { knowledgeModelId, folderId, fileName: file.name, contentText: await file.text(), connectionId },
                        { organizationId: organization },
                    ),
                ),
            );
            return {
                uploadedNames: results.flatMap((result, index) => (result.status === 'fulfilled' ? [files[index]!.file.name] : [])),
                errors: results.filter((result): result is PromiseRejectedResult => result.status === 'rejected').map(result => String(result.reason)),
            };
        },
        onSuccess: async result => {
            if (result.uploadedNames.length) await queryClient.invalidateQueries({ queryKey: knowledgeSourcesKey(knowledgeModelId), exact: true });
            if (result.uploadedNames.length) toast.success(t('Uploaded', { count: result.uploadedNames.length }));
            result.errors.forEach(error => toast.error(error));
            if (!result.errors.length) {
                setFiles([]);
                onUploaded?.();
                onOpenChange(false);
            } else {
                const uploadedNames = new Set(result.uploadedNames);
                setFiles(current => current.filter(file => !uploadedNames.has(file.file.name)));
            }
        },
    });

    return (
        <Dialog
            open={open}
            onOpenChange={next => {
                if (upload.isPending) return;
                onOpenChange(next);
            }}
        >
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t('UploadTitle')}</DialogTitle>
                    <DialogDescription className="break-words">
                        {targetPath !== undefined ? docs('TargetFolder', { path: targetPath }) : markdownOnly ? docs('Upload') : t('UploadDescription')}
                    </DialogDescription>
                </DialogHeader>
                <button
                    type="button"
                    className="flex min-h-36 w-full flex-col items-center justify-center rounded-md border border-dashed bg-muted/20 px-6 text-center transition-colors hover:bg-muted/35"
                    disabled={upload.isPending}
                    onClick={() => inputRef.current?.click()}
                    onDragOver={event => event.preventDefault()}
                    onDrop={event => {
                        event.preventDefault();
                        if (!upload.isPending) addFiles(Array.from(event.dataTransfer.files));
                    }}
                >
                    <Upload className="size-5" />
                    <span className="mt-3 text-sm font-medium">{t('Drop')}</span>
                    <span className="mt-1 text-xs text-muted-foreground">{markdownOnly ? docs('UploadLimits') : t('Limits')}</span>
                    <input
                        ref={inputRef}
                        type="file"
                        multiple
                        accept={markdownOnly ? '.md,.markdown,text/markdown' : '.md,.markdown,.yaml,.yml,.txt,text/markdown,text/plain,application/yaml,text/yaml'}
                        className="hidden"
                        onChange={event => {
                            const selected = Array.from(event.target.files ?? []);
                            event.target.value = '';
                            addFiles(selected);
                        }}
                    />
                </button>
                {files.length ? (
                    <div className="max-h-64 divide-y overflow-y-auto rounded-md border">
                        {files.map(({ file, connectionId }) => (
                            <div key={file.name} className="flex items-center gap-3 p-3">
                                <FileText className="size-4 shrink-0 text-muted-foreground" />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">{file.name}</div>
                                    <div className="text-xs text-muted-foreground">{formatBytes(file.size)}</div>
                                </div>
                                <ScopeSelect
                                    disabled={upload.isPending}
                                    value={connectionId}
                                    dataSources={dataSources}
                                    onChange={connectionId => setFiles(current => current.map(item => (item.file.name === file.name ? { ...item, connectionId } : item)))}
                                    className="w-48 shrink-0"
                                />
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    disabled={upload.isPending}
                                    aria-label={t('RemoveFile', { name: file.name })}
                                    onClick={() => setFiles(current => current.filter(item => item.file.name !== file.name))}
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

export function SourceViewer({
    source,
    organization,
    knowledgeModelId,
    onClose,
    onEdit,
    title = knowledgeSourceDisplayName(source),
}: {
    source: KnowledgeSourceSummary;
    organization: string;
    knowledgeModelId: string;
    onClose?: () => void;
    onEdit?: () => void;
    title?: string;
}) {
    const t = useTranslations('Knowledge.KnowledgeSources');
    const detail = useQuery({
        queryKey: [...knowledgeSourcesKey(knowledgeModelId), source.id, source.updatedAt, 'viewer'],
        queryFn: () => executeActionClient<KnowledgeSource>('knowledge.getKnowledgeSource', { knowledgeModelId, id: source.id }, { organizationId: organization }),
        refetchOnMount: 'always',
        retry: false,
    });

    const actions = (
        <>
            {onEdit && !source.connectorId && source.format === 'markdown' && (
                <Button variant="outline" size="sm" onClick={onEdit}>
                    <Pencil />
                    {t('Edit')}
                </Button>
            )}
            {source.sourceUrl ? (
                <Button variant="outline" size="sm" asChild>
                    <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink /> {t('OpenOriginal')}
                    </a>
                </Button>
            ) : null}
        </>
    );
    const content = (
        <>
            <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{source.format}</Badge>
                <span>
                    {source.connectorProvider === 'github'
                        ? 'GitHub'
                        : source.connectorProvider === 'linear'
                          ? 'Linear'
                          : source.connectorProvider === 'drive'
                            ? 'Google Drive'
                            : t('ViewerLocalSource')}
                </span>
                <span aria-hidden="true">·</span>
                <time dateTime={source.updatedAt}>{new Date(source.updatedAt).toLocaleString()}</time>
                {detail.data?.remoteRevision ? <span className="break-all">{t('SyncedRevision', { revision: detail.data.remoteRevision })}</span> : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-card p-4">
                {detail.isFetching || detail.isPending ? (
                    <div className="space-y-3" role="status" aria-label={t('ViewerLoading')}>
                        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                        <div className="h-4 w-full animate-pulse rounded bg-muted" />
                        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                    </div>
                ) : detail.isError ? (
                    <div className="flex flex-col items-start gap-3 text-sm" role="alert">
                        <p>{t('ViewerLoadFailed')}</p>
                        <Button variant="outline" size="sm" onClick={() => void detail.refetch()}>
                            {t('ViewerRetry')}
                        </Button>
                    </div>
                ) : !detail.data?.contentText ? (
                    <p className="text-sm text-muted-foreground">{t('ViewerEmpty')}</p>
                ) : detail.data.format === 'markdown' ? (
                    <MarkdownViewer mode="static">{detail.data.contentText}</MarkdownViewer>
                ) : (
                    <pre className="whitespace-pre-wrap break-words font-mono text-sm">{detail.data.contentText}</pre>
                )}
            </div>
        </>
    );
    if (!onClose)
        return (
            <section aria-label={title} className="min-w-0 space-y-4">
                <header className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="min-w-0 break-words text-lg font-semibold">{title}</h3>
                    <div className="flex flex-wrap gap-2">{actions}</div>
                </header>
                {content}
            </section>
        );
    return (
        <Dialog open onOpenChange={open => !open && onClose()}>
            <DialogContent className="flex h-[min(48rem,calc(100dvh-2rem))] w-[calc(100vw-2rem)] flex-col sm:max-w-4xl">
                <DialogHeader className="shrink-0">
                    <DialogTitle className="break-words pr-8">{knowledgeSourceDisplayName(source)}</DialogTitle>
                    <DialogDescription>{t('ViewerDescription')}</DialogDescription>
                </DialogHeader>
                {content}
                <DialogFooter className="shrink-0">
                    {actions}
                    <Button variant="outline" size="sm" onClick={onClose}>
                        {t('ViewerClose')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function SourceEditor({
    source,
    open,
    onOpenChange,
    organization,
    knowledgeModelId,
    dataSources,
    folderId,
    targetPath,
    onSaved,
    inline = false,
    onDirtyChange,
}: {
    source: KnowledgeSourceSummary | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organization: string;
    knowledgeModelId: string;
    dataSources: DataSource[];
    folderId?: string | null;
    targetPath?: string;
    onSaved?: () => void;
    inline?: boolean;
    onDirtyChange?: (dirty: boolean) => void;
}) {
    const t = useTranslations('Knowledge.KnowledgeSources');
    const docs = useTranslations('Knowledge.Documents');
    const [title, setTitle] = useState('');
    const queryClient = useQueryClient();
    const detail = useQuery({
        queryKey: [...knowledgeSourcesKey(knowledgeModelId), source?.id],
        queryFn: () => executeActionClient<KnowledgeSource>('knowledge.getKnowledgeSource', { knowledgeModelId, id: source!.id }, { organizationId: organization }),
        enabled: Boolean(source && open),
    });
    const [draft, setContentText] = useState<string>();
    const [draftConnection, setConnectionId] = useState<string | null>();
    const contentText = draft ?? detail.data?.contentText ?? '';
    const connectionId = draftConnection === undefined ? (detail.data?.connectionId ?? null) : draftConnection;
    const dirty = !!detail.data && (contentText !== detail.data.contentText || connectionId !== detail.data.connectionId);
    useEffect(() => {
        onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);
    const save = useMutation({
        mutationFn: () =>
            executeActionClient<KnowledgeSource>(
                source ? 'knowledge.updateKnowledgeSource' : 'knowledge.createKnowledgeSource',
                source
                    ? { knowledgeModelId, id: source.id, contentText, connectionId }
                    : { knowledgeModelId, folderId, fileName: /\.(md|markdown)$/i.test(title.trim()) ? title.trim() : title.trim() + '.md', contentText, connectionId },
                { organizationId: organization },
            ),
        onSuccess: updated => {
            const key = knowledgeSourcesKey(knowledgeModelId);
            queryClient.setQueryData([...key, updated.id], updated);
            queryClient.setQueryData([...key, updated.id, updated.updatedAt, 'viewer'], updated);
            const { contentText: _body, remoteRevision: _revision, ...summary } = updated;
            queryClient.setQueryData<{ sources: KnowledgeSourceSummary[] }>(key, previous =>
                previous && { sources: [summary, ...previous.sources.filter(item => item.id !== updated.id)] },
            );
            void queryClient.invalidateQueries({ queryKey: ['knowledge-model', knowledgeModelId] });
            toast.success(t('Saved'));
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('SaveFailed')),
    });

    const form = (
        <>
            {!source ? <Input aria-label={docs('Title')} placeholder={docs('Title')} value={title} maxLength={237} onChange={event => setTitle(event.target.value)} /> : null}
            <div className="flex shrink-0 items-center gap-3">
                <ScopeSelect disabled={save.isPending} value={connectionId} dataSources={dataSources} onChange={setConnectionId} />
                {source ? <Badge variant="outline">{source.format}</Badge> : null}
                {source ? <span className="text-xs text-muted-foreground">{formatBytes(new TextEncoder().encode(contentText).byteLength)}</span> : null}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
                {detail.isLoading ? (
                    <div className="h-full animate-pulse bg-muted" />
                ) : detail.isError && !detail.data ? (
                    <div role="alert" className="space-y-2 p-4 text-sm">
                        <p>{t('ViewerLoadFailed')}</p>
                        <Button variant="outline" size="sm" onClick={() => void detail.refetch()}>
                            {t('ViewerRetry')}
                        </Button>
                    </div>
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
                        disabled={save.isPending}
                        aria-label={source?.format === 'text' ? knowledgeSourceDisplayName(source) : docs('Body')}
                        className="h-full resize-none rounded-none border-0 font-mono focus-visible:ring-0"
                        value={contentText}
                        onChange={event => setContentText(event.target.value)}
                    />
                )}
            </div>
            <DialogFooter className="shrink-0">
                <Button variant="outline" disabled={save.isPending} onClick={() => onOpenChange(false)}>
                    {t('Cancel')}
                </Button>
                <Button
                    onClick={() =>
                        save.mutate(undefined, {
                            onSuccess: () => {
                                onSaved?.();
                                onOpenChange(false);
                            },
                        })
                    }
                    disabled={(source ? !detail.data : !title.trim() || !contentText.trim()) || save.isPending || new TextEncoder().encode(contentText).byteLength > MAX_FILE_BYTES}
                >
                    {save.isPending ? t('Saving') : t('Save')}
                </Button>
            </DialogFooter>
        </>
    );
    if (inline && source)
        return (
            <section aria-label={knowledgeSourceDisplayName(source)} className="flex min-h-80 h-[min(42rem,70dvh)] min-w-0 flex-col gap-4">
                <h3 className="break-words text-lg font-semibold">{knowledgeSourceDisplayName(source)}</h3>
                {form}
            </section>
        );
    return (
        <Dialog open={open} onOpenChange={next => !save.isPending && onOpenChange(next)}>
            <DialogContent className="flex h-[min(42rem,calc(100dvh-2rem))] flex-col sm:max-w-3xl">
                <DialogHeader className="shrink-0">
                    <DialogTitle>{source ? knowledgeSourceDisplayName(source) : docs('Create')}</DialogTitle>
                    <DialogDescription className="break-words">{targetPath !== undefined ? docs('TargetFolder', { path: targetPath }) : t('EditorDescription')}</DialogDescription>
                </DialogHeader>
                {form}
            </DialogContent>
        </Dialog>
    );
}

export function GitHubConnectorDialog({
    open,
    onOpenChange,
    organization,
    knowledgeModelId,
    installationId,
    connectionState,
    onConnected,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organization: string;
    knowledgeModelId: string;
    installationId: string;
    connectionState: string;
    onConnected: () => void;
}) {
    const t = useTranslations('Knowledge.KnowledgeSources');
    const [repositoryId, setRepositoryId] = useState('');
    const [rootPath, setRootPath] = useState('');
    const setup = useQuery({
        queryKey: ['github-connector-setup', knowledgeModelId],
        queryFn: () =>
            executeActionClient<{ configured: boolean; manualOnly: boolean; installUrl: string | null }>(
                'knowledge.getGitHubConnectorSetup',
                { knowledgeModelId },
                { organizationId: organization },
            ),
        enabled: open,
    });
    const repositories = useQuery({
        queryKey: ['github-connector-repositories', installationId, connectionState],
        queryFn: () =>
            executeActionClient<{ repositories: GitHubRepository[] }>(
                'knowledge.listGitHubRepositories',
                { knowledgeModelId, installationId, connectionState },
                { organizationId: organization },
            ),
        enabled: open && Boolean(installationId && connectionState),
    });
    const selectedRepository = repositories.data?.repositories.find(repository => repository.id === repositoryId);
    const directories = useQuery({
        queryKey: ['github-connector-directories', installationId, repositoryId],
        queryFn: () =>
            executeActionClient<{ directories: string[] }>(
                'knowledge.listGitHubDirectories',
                { knowledgeModelId, installationId, connectionState, repositoryId },
                { organizationId: organization },
            ),
        enabled: open && Boolean(installationId && connectionState && repositoryId),
    });
    useEffect(() => {
        setRootPath('');
    }, [repositoryId]);
    const create = useMutation({
        mutationFn: () =>
            executeActionClient<KnowledgeConnector>(
                'knowledge.createGitHubConnector',
                { knowledgeModelId, installationId, connectionState, repositoryId, rootPath },
                { organizationId: organization },
            ),
        onSuccess: () => {
            toast.success(t('ConnectorSyncQueued'));
            onConnected();
            onOpenChange(false);
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('GitHubCreateFailed')),
    });

    const hasInstallation = Boolean(installationId && connectionState);
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <IconBrandGithub className="size-5" /> {t('GitHubTitle')}
                    </DialogTitle>
                    <DialogDescription>{t('GitHubDescription')}</DialogDescription>
                </DialogHeader>
                {setup.isLoading ? <div className="h-28 animate-pulse rounded-md bg-muted" /> : null}
                {setup.data && !setup.data.configured ? (
                    <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                        {t(setup.data.manualOnly ? 'GitHubDesktopNotConfigured' : 'GitHubNotConfigured')}
                    </div>
                ) : null}
                {setup.data?.configured && !hasInstallation ? (
                    <div className="space-y-4 rounded-md border p-4">
                        <div>
                            <div className="font-medium">{t('GitHubInstallTitle')}</div>
                            <p className="mt-1 text-sm text-muted-foreground">{t('GitHubInstallDescription')}</p>
                        </div>
                        <Button onClick={() => setup.data.installUrl && window.location.assign(setup.data.installUrl)}>
                            <IconBrandGithub /> {t('GitHubInstall')}
                        </Button>
                    </div>
                ) : null}
                {setup.data?.configured && hasInstallation ? (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('GitHubRepository')}</label>
                            <Select value={repositoryId} onValueChange={setRepositoryId} disabled={repositories.isLoading}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder={repositories.isLoading ? t('GitHubLoadingRepositories') : t('GitHubSelectRepository')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {repositories.data?.repositories.map(repository => (
                                        <SelectItem key={repository.id} value={repository.id}>
                                            {repository.fullName} · {repository.defaultBranch}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {selectedRepository ? (
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t('GitHubFolder')}</label>
                                <Select value={rootPath || '__root__'} onValueChange={value => setRootPath(value === '__root__' ? '' : value)} disabled={directories.isLoading}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder={directories.isLoading ? t('GitHubLoadingFolders') : t('GitHubSelectFolder')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {directories.data?.directories.map(directory => (
                                            <SelectItem key={directory || '__root__'} value={directory || '__root__'}>
                                                {directory || t('GitHubRepositoryRoot')}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">{t('GitHubFolderDescription')}</p>
                            </div>
                        ) : null}
                    </div>
                ) : null}
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t('Cancel')}
                    </Button>
                    {hasInstallation ? (
                        <Button onClick={() => create.mutate()} disabled={!repositoryId || !directories.data || create.isPending}>
                            {create.isPending ? t('GitHubConnecting') : t('GitHubConnectAndSync')}
                        </Button>
                    ) : null}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

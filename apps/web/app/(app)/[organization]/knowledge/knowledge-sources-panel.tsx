'use client';

import dynamic from 'next/dynamic';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryStates } from 'nuqs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconBrandGithub } from '@tabler/icons-react';
import { FileCode2, FileText, Link as LinkIcon, MoreHorizontal, Pencil, Plus, RefreshCw, Trash2, Unplug, Upload } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
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
    knowledgeModelId: string;
    connectionId: string | null;
    fileName: string;
    format: 'markdown' | 'yaml' | 'text';
    byteSize: number;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string;
    connectorId: string | null;
    connectorProvider: 'github' | null;
    remotePath: string | null;
};
type KnowledgeSource = KnowledgeSourceSummary & { contentText: string };
type PendingFile = { key: string; fileName: string; contentText: string; byteSize: number; connectionId: string | null };
type ImportSuggestion = Omit<Definition, 'sourceConnectionId'> & { sourceConnectionId?: string };
type ImportVerifiedQuery = {
    id?: string;
    sourceConnectionId?: string;
    title: string;
    question: string;
    sql: string;
    description?: string;
    definitionIds: string[];
};
type KnowledgeConnector = {
    id: string;
    repositoryFullName: string;
    defaultBranch: string;
    rootPath: string;
    status: 'pending' | 'syncing' | 'ready' | 'error' | 'disabled';
    lastSyncedAt: string | null;
    lastError: string | null;
};
type GitHubRepository = { id: string; fullName: string; defaultBranch: string; private: boolean };
type VerifiedQuery = { id: string; title: string };
type KnowledgeGraph = {
    queryDefinitionEdges: Array<{ queryId: string; definitionId: string }>;
    sourceAssetEdges: Array<{
        sourceId: string;
        assetType: 'definition' | 'verified_query';
        assetId: string;
        relationType: 'provided' | 'generated';
    }>;
};

const MAX_FILE_BYTES = 10_000_000;
const MAX_FILES_PER_UPLOAD = 20;
const SUPPORTED_FILE_NAME = /\.(md|markdown|ya?ml|txt)$/i;
const MonacoYamlEditor = dynamic(() => import('@/components/@dory/ui/monaco-editor'), {
    ssr: false,
    loading: () => <div className="h-full animate-pulse bg-muted" />,
});

const knowledgeSourcesKey = (knowledgeModelId: string) => ['knowledge-model', knowledgeModelId, 'knowledge-sources'] as const;
const knowledgeConnectorsKey = (knowledgeModelId: string) => ['knowledge-model', knowledgeModelId, 'knowledge-connectors'] as const;

function formatBytes(bytes: number) {
    if (bytes < 1_000) return `${bytes} B`;
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
    return `${(bytes / 1_000).toFixed(bytes < 10_000 ? 1 : 0)} KB`;
}

function ScopeSelect({ value, dataSources, onChange }: { value: string | null; dataSources: DataSource[]; onChange: (value: string | null) => void }) {
    const t = useTranslations('Knowledge.KnowledgeSources');
    return (
        <Select value={value ?? '__shared__'} onValueChange={selected => onChange(selected === '__shared__' ? null : selected)}>
            <SelectTrigger className="w-full">
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

function UploadSourcesDialog({
    open,
    onOpenChange,
    organization,
    knowledgeModelId,
    dataSources,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organization: string;
    knowledgeModelId: string;
    dataSources: DataSource[];
}) {
    const t = useTranslations('Knowledge.KnowledgeSources');
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
                        'knowledge.createKnowledgeSource',
                        { knowledgeModelId, fileName: file.fileName, contentText: file.contentText, connectionId: file.connectionId },
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
            void queryClient.invalidateQueries({ queryKey: knowledgeSourcesKey(knowledgeModelId) });
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
                                    aria-label={t('RemoveFile', { name: file.fileName })}
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
    knowledgeModelId,
    dataSources,
}: {
    source: KnowledgeSourceSummary | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    organization: string;
    knowledgeModelId: string;
    dataSources: DataSource[];
}) {
    const t = useTranslations('Knowledge.KnowledgeSources');
    const queryClient = useQueryClient();
    const detail = useQuery({
        queryKey: [...knowledgeSourcesKey(knowledgeModelId), source?.id],
        queryFn: () => executeActionClient<KnowledgeSource>('knowledge.getKnowledgeSource', { knowledgeModelId, id: source!.id }, { organizationId: organization }),
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
                'knowledge.updateKnowledgeSource',
                { knowledgeModelId, id: source!.id, contentText, connectionId },
                { organizationId: organization },
            ),
        onSuccess: updated => {
            queryClient.setQueryData([...knowledgeSourcesKey(knowledgeModelId), updated.id], updated);
            void queryClient.invalidateQueries({ queryKey: knowledgeSourcesKey(knowledgeModelId) });
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
    verifiedQueries,
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
    verifiedQueries: ImportVerifiedQuery[];
    onImport: (definitions: Definition[], importedIds: string[], sourceId: string, queries: ImportVerifiedQuery[]) => void;
}) {
    const t = useTranslations('Knowledge.KnowledgeSources');
    const existingIds = new Set(existingDefinitions.map(item => item.id));
    const [drafts, setDrafts] = useState<ImportSuggestion[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [selectedQueryIndexes, setSelectedQueryIndexes] = useState<number[]>([]);
    useEffect(() => {
        setDrafts(suggestions);
        setSelectedIds(suggestions.filter(item => !existingIds.has(item.id)).map(item => item.id));
        setSelectedQueryIndexes(verifiedQueries.map((_, index) => index));
        // The existing definition set is fixed while the review dialog is open.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [suggestions, verifiedQueries]);
    const selected = drafts.filter(item => selectedIds.includes(item.id));
    const selectedQueries = verifiedQueries.filter((_, index) => selectedQueryIndexes.includes(index));
    const canImport =
        (selected.length > 0 || selectedQueries.length > 0) &&
        selected.every(item => Boolean(item.sourceConnectionId)) &&
        selectedQueries.every(item => Boolean(item.sourceConnectionId));
    const accept = () => {
        if (!canImport) return;
        const selectedIdSet = new Set(selected.map(item => item.id));
        onImport(
            [
                ...existingDefinitions.filter(item => !selectedIdSet.has(item.id)),
                ...selected.map(item => ({ ...item, sourceConnectionId: item.sourceConnectionId!, status: 'unverified' as const })),
            ],
            selected.map(item => item.id),
            source!.id,
            selectedQueries,
        );
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
                                        className="mt-1 cursor-pointer"
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
                                <Select
                                    value={item.sourceConnectionId ?? '__unassigned__'}
                                    onValueChange={value =>
                                        setDrafts(current =>
                                            current.map(draft => (draft.id === item.id ? { ...draft, sourceConnectionId: value === '__unassigned__' ? undefined : value } : draft)),
                                        )
                                    }
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder={t('SelectDataSource')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__unassigned__">{t('SelectDataSource')}</SelectItem>
                                        {dataSources.map(dataSource => (
                                            <SelectItem key={dataSource.connectionId} value={dataSource.connectionId}>
                                                {dataSource.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        );
                    })}
                    {verifiedQueries.map((query, index) => (
                        <label key={`${query.id ?? query.title}:${index}`} className="flex items-start gap-3 p-3">
                            <input
                                type="checkbox"
                                className="mt-1 cursor-pointer"
                                checked={selectedQueryIndexes.includes(index)}
                                onChange={() => setSelectedQueryIndexes(current => (current.includes(index) ? current.filter(value => value !== index) : [...current, index]))}
                            />
                            <span className="min-w-0">
                                <span className="flex items-center gap-2 font-medium">
                                    {query.title} <Badge variant="outline">{t('VerifiedQuery')}</Badge>
                                </span>
                                <span className="mt-1 block text-xs text-muted-foreground">{query.question}</span>
                            </span>
                        </label>
                    ))}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t('Cancel')}
                    </Button>
                    <Button onClick={accept} disabled={!canImport}>
                        {t('ImportCount', { count: selected.length + selectedQueries.length })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function GitHubConnectorDialog({
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
            toast.success(t('GitHubSyncQueued'));
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

export function KnowledgeSourcesPanel({
    organization,
    knowledgeModelId,
    dataSources,
    definitions,
    queries,
    graph,
    onImportDefinitions,
}: {
    organization: string;
    knowledgeModelId: string;
    dataSources: DataSource[];
    definitions: Definition[];
    queries: VerifiedQuery[];
    graph: KnowledgeGraph;
    onImportDefinitions: (definitions: Definition[], importedIds: string[], sourceId: string) => Promise<void>;
}) {
    const t = useTranslations('Knowledge.KnowledgeSources');
    const queryClient = useQueryClient();
    const [githubEntry, setGitHubEntry] = useQueryStates(
        { githubInstallationId: parseAsString.withDefault(''), githubConnectionState: parseAsString.withDefault('') },
        { history: 'replace' },
    );
    const [selectedSourceId, setSelectedSourceId] = useQueryStates({ source: parseAsString.withDefault('') }, { history: 'replace' });
    const [uploadOpen, setUploadOpen] = useState(false);
    const [connectorOpen, setConnectorOpen] = useState(Boolean(githubEntry.githubInstallationId && githubEntry.githubConnectionState));
    const [editing, setEditing] = useState<KnowledgeSourceSummary | null>(null);
    const [deleting, setDeleting] = useState<KnowledgeSourceSummary | null>(null);
    const [reviewing, setReviewing] = useState<KnowledgeSourceSummary | null>(null);
    const [suggestions, setSuggestions] = useState<ImportSuggestion[]>([]);
    const [querySuggestions, setQuerySuggestions] = useState<ImportVerifiedQuery[]>([]);
    const [disconnecting, setDisconnecting] = useState<KnowledgeConnector | null>(null);
    const sourceAssets = useMemo(() => {
        const bySource = new Map<string, KnowledgeGraph['sourceAssetEdges']>();
        for (const edge of graph.sourceAssetEdges) bySource.set(edge.sourceId, [...(bySource.get(edge.sourceId) ?? []), edge]);
        return bySource;
    }, [graph.sourceAssetEdges]);
    const sources = useQuery({
        queryKey: knowledgeSourcesKey(knowledgeModelId),
        queryFn: () => executeActionClient<{ sources: KnowledgeSourceSummary[] }>('knowledge.listKnowledgeSources', { knowledgeModelId }, { organizationId: organization }),
    });
    const connectors = useQuery({
        queryKey: knowledgeConnectorsKey(knowledgeModelId),
        queryFn: () => executeActionClient<{ connectors: KnowledgeConnector[] }>('knowledge.listConnectors', { knowledgeModelId }, { organizationId: organization }),
        refetchInterval: query => (query.state.data?.connectors.some(connector => connector.status === 'pending' || connector.status === 'syncing') ? 2_000 : 15_000),
    });
    useEffect(() => {
        if (githubEntry.githubInstallationId && githubEntry.githubConnectionState) setConnectorOpen(true);
    }, [githubEntry.githubConnectionState, githubEntry.githubInstallationId]);
    const previewImport = useMutation({
        mutationFn: (source: KnowledgeSourceSummary) =>
            executeActionClient<{ suggestions: ImportSuggestion[]; verifiedQueries: ImportVerifiedQuery[] }>(
                'knowledge.previewKnowledgeSourceImport',
                { knowledgeModelId, id: source.id },
                { organizationId: organization },
            ),
        onSuccess: (result, source) => {
            if (!result.suggestions.length && !result.verifiedQueries.length) {
                toast.error(t('NoImportable'));
                return;
            }
            setReviewing(source);
            setSuggestions(result.suggestions);
            setQuerySuggestions(result.verifiedQueries);
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('ParseFailed')),
    });
    const remove = useMutation({
        mutationFn: (source: KnowledgeSourceSummary) =>
            executeActionClient(
                'knowledge.deleteKnowledgeSource',
                { knowledgeModelId, id: source.id },
                { organizationId: organization, confirmationToken: 'knowledge.deleteKnowledgeSource' },
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: knowledgeSourcesKey(knowledgeModelId) });
            setDeleting(null);
            toast.success(t('Deleted'));
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('DeleteFailed')),
    });
    const sync = useMutation({
        mutationFn: (connector: KnowledgeConnector) => executeActionClient('knowledge.syncConnector', { connectorId: connector.id }, { organizationId: organization }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: knowledgeConnectorsKey(knowledgeModelId) });
            toast.success(t('GitHubSyncQueued'));
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('GitHubSyncFailed')),
    });
    const disconnect = useMutation({
        mutationFn: (connector: KnowledgeConnector) =>
            executeActionClient('knowledge.deleteConnector', { connectorId: connector.id }, { organizationId: organization, confirmationToken: 'knowledge.deleteConnector' }),
        onSuccess: () => {
            void Promise.all([
                queryClient.invalidateQueries({ queryKey: knowledgeConnectorsKey(knowledgeModelId) }),
                queryClient.invalidateQueries({ queryKey: knowledgeSourcesKey(knowledgeModelId) }),
            ]);
            setDisconnecting(null);
            toast.success(t('GitHubDisconnected'));
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('GitHubDisconnectFailed')),
    });
    const scopeName = (source: KnowledgeSourceSummary) =>
        source.connectionId ? (dataSources.find(item => item.connectionId === source.connectionId)?.name ?? t('UnavailableDataSource')) : t('Shared');
    const connectKnowledgeBase = () => setConnectorOpen(true);

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
                <p className="max-w-2xl text-sm text-muted-foreground">{t('Description')}</p>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button>
                            <Plus />
                            {t('AddSource')}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setUploadOpen(true)}>
                            <Upload />
                            {t('UploadFile')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={connectKnowledgeBase}>
                            <LinkIcon />
                            {t('ConnectKnowledgeBase')}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            {connectors.data?.connectors.length ? (
                <div className="grid gap-3 lg:grid-cols-2">
                    {connectors.data.connectors.map(connector => (
                        <div key={connector.id} className="rounded-md border bg-card p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 font-medium">
                                        <IconBrandGithub className="size-4" /> <span className="truncate">{connector.repositoryFullName}</span>
                                    </div>
                                    <div className="mt-1 truncate text-xs text-muted-foreground">
                                        {connector.defaultBranch} · {connector.rootPath || t('GitHubRepositoryRoot')}
                                    </div>
                                </div>
                                <Badge variant={connector.status === 'error' || connector.status === 'disabled' ? 'destructive' : 'outline'}>
                                    {t(`GitHubStatus.${connector.status}`)}
                                </Badge>
                            </div>
                            {connector.lastError ? <p className="mt-3 line-clamp-2 text-xs text-destructive">{connector.lastError}</p> : null}
                            <div className="mt-3 flex items-center justify-between gap-3">
                                <span className="text-xs text-muted-foreground">
                                    {connector.lastSyncedAt ? t('GitHubLastSynced', { date: new Date(connector.lastSyncedAt).toLocaleString() }) : t('GitHubNotSynced')}
                                </span>
                                <div className="flex gap-1">
                                    <Button variant="ghost" size="sm" onClick={() => sync.mutate(connector)} disabled={sync.isPending || connector.status === 'disabled'}>
                                        <RefreshCw className={connector.status === 'syncing' ? 'animate-spin' : ''} /> {t('GitHubSyncNow')}
                                    </Button>
                                    <Button variant="ghost" size="icon-sm" aria-label={t('GitHubDisconnect')} onClick={() => setDisconnecting(connector)}>
                                        <Unplug />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}
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
                                <th className="px-4 py-3 font-medium">{t('Assets')}</th>
                                <th className="w-14" />
                            </tr>
                        </thead>
                        <tbody>
                            {sources.data.sources.flatMap(source => {
                                const assets = sourceAssets.get(source.id) ?? [];
                                const definitionCount = assets.filter(asset => asset.assetType === 'definition').length;
                                const queryCount = assets.filter(asset => asset.assetType === 'verified_query').length;
                                const selected = selectedSourceId.source === source.id;
                                return [
                                    <tr
                                        key={source.id}
                                        className="cursor-pointer border-t hover:bg-muted/30"
                                        onClick={() => void setSelectedSourceId({ source: selected ? '' : source.id })}
                                    >
                                        <td className="px-4 py-3">
                                            <span className="flex items-center gap-2 font-medium">
                                                {source.format === 'yaml' ? (
                                                    <FileCode2 className="size-4 text-muted-foreground" />
                                                ) : (
                                                    <FileText className="size-4 text-muted-foreground" />
                                                )}
                                                {source.fileName}
                                                {source.connectorProvider === 'github' ? <Badge variant="outline">GitHub · {t('ReadOnly')}</Badge> : null}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 capitalize text-muted-foreground">{source.format}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{scopeName(source)}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{formatBytes(source.byteSize)}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{new Date(source.updatedAt).toLocaleDateString()}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{t('AssetCounts', { definitions: definitionCount, queries: queryCount })}</td>
                                        <td className="px-4 py-3 text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        aria-label={t('ActionsFor', { name: source.fileName })}
                                                        onClick={event => event.stopPropagation()}
                                                    >
                                                        <MoreHorizontal />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" onClick={event => event.stopPropagation()}>
                                                    {!source.connectorId ? (
                                                        <DropdownMenuItem onSelect={() => setEditing(source)}>
                                                            <Pencil /> {t('Edit')}
                                                        </DropdownMenuItem>
                                                    ) : null}
                                                    {source.format === 'yaml' ? (
                                                        <DropdownMenuItem onSelect={() => previewImport.mutate(source)}>
                                                            <FileCode2 /> {t('ReviewImport')}
                                                        </DropdownMenuItem>
                                                    ) : null}
                                                    {!source.connectorId ? (
                                                        <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(source)}>
                                                            <Trash2 /> {t('Delete')}
                                                        </DropdownMenuItem>
                                                    ) : null}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </td>
                                    </tr>,
                                    ...(selected
                                        ? [
                                              <tr key={`${source.id}:assets`} className="border-t bg-muted/10">
                                                  <td colSpan={7} className="p-5">
                                                      <div className="grid gap-5 md:grid-cols-2">
                                                          {(['provided', 'generated'] as const).map(relationType => (
                                                              <section key={relationType}>
                                                                  <h4 className="text-xs font-medium uppercase text-muted-foreground">{t(`RelationTypes.${relationType}`)}</h4>
                                                                  <div className="mt-2 flex flex-wrap gap-2">
                                                                      {assets
                                                                          .filter(asset => asset.relationType === relationType)
                                                                          .map(asset => {
                                                                              const label =
                                                                                  asset.assetType === 'definition'
                                                                                      ? definitions.find(item => item.id === asset.assetId)?.name
                                                                                      : queries.find(item => item.id === asset.assetId)?.title;
                                                                              return (
                                                                                  <Button key={`${asset.assetType}:${asset.assetId}`} variant="outline" size="sm" asChild>
                                                                                      <NextLink
                                                                                          href={`?tab=${asset.assetType === 'definition' ? 'definitions' : 'queries'}&${asset.assetType === 'definition' ? 'definition' : 'query'}=${encodeURIComponent(asset.assetId)}`}
                                                                                      >
                                                                                          {label ?? asset.assetId}
                                                                                      </NextLink>
                                                                                  </Button>
                                                                              );
                                                                          })}
                                                                      {!assets.some(asset => asset.relationType === relationType) ? (
                                                                          <span className="text-sm text-muted-foreground">{t('NoLinkedAssets')}</span>
                                                                      ) : null}
                                                                  </div>
                                                              </section>
                                                          ))}
                                                      </div>
                                                  </td>
                                              </tr>,
                                          ]
                                        : []),
                                ];
                            })}
                        </tbody>
                    </table>
                </div>
            ) : sources.data ? (
                <div className="flex min-h-64 flex-col items-center justify-center rounded-md border border-dashed px-6 text-center">
                    <FileText className="size-8 text-muted-foreground" />
                    <h3 className="mt-4 font-medium">{t('EmptyTitle')}</h3>
                    <p className="mt-1 max-w-md text-sm text-muted-foreground">{t('EmptyDescription')}</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                        <Button onClick={() => setUploadOpen(true)}>
                            <Upload />
                            {t('UploadFile')}
                        </Button>
                        <Button variant="outline" onClick={connectKnowledgeBase}>
                            <LinkIcon />
                            {t('ConnectKnowledgeBase')}
                        </Button>
                    </div>
                </div>
            ) : null}
            <UploadSourcesDialog open={uploadOpen} onOpenChange={setUploadOpen} organization={organization} knowledgeModelId={knowledgeModelId} dataSources={dataSources} />
            <GitHubConnectorDialog
                open={connectorOpen}
                onOpenChange={setConnectorOpen}
                organization={organization}
                knowledgeModelId={knowledgeModelId}
                installationId={githubEntry.githubInstallationId}
                connectionState={githubEntry.githubConnectionState}
                onConnected={() => {
                    void setGitHubEntry({ githubInstallationId: null, githubConnectionState: null });
                    void Promise.all([
                        queryClient.invalidateQueries({ queryKey: knowledgeConnectorsKey(knowledgeModelId) }),
                        queryClient.invalidateQueries({ queryKey: knowledgeSourcesKey(knowledgeModelId) }),
                    ]);
                }}
            />
            <SourceEditorDialog
                source={editing}
                open={Boolean(editing)}
                onOpenChange={open => !open && setEditing(null)}
                organization={organization}
                knowledgeModelId={knowledgeModelId}
                dataSources={dataSources}
            />
            <ImportReviewDialog
                source={reviewing}
                suggestions={suggestions}
                verifiedQueries={querySuggestions}
                existingDefinitions={definitions}
                dataSources={dataSources}
                onOpenChange={open => {
                    if (!open) {
                        setReviewing(null);
                        setSuggestions([]);
                        setQuerySuggestions([]);
                    }
                }}
                onImport={(definitions, importedIds, sourceId, importedQueries) => {
                    void (async () => {
                        await onImportDefinitions(definitions, importedIds, sourceId);
                        await Promise.all(
                            importedQueries.map(query =>
                                executeActionClient(
                                    'knowledge.createVerifiedQuery',
                                    {
                                        knowledgeModelId,
                                        sourceConnectionId: query.sourceConnectionId,
                                        title: query.title,
                                        question: query.question,
                                        sql: query.sql,
                                        description: query.description,
                                        definitionIds: query.definitionIds,
                                        knowledgeSourceIds: [sourceId],
                                        sourceType: 'knowledge_source',
                                        sourceId,
                                    },
                                    { organizationId: organization },
                                ),
                            ),
                        );
                        await Promise.all([
                            queryClient.invalidateQueries({ queryKey: ['knowledge-model', knowledgeModelId, 'verified-queries'] }),
                            queryClient.invalidateQueries({ queryKey: ['knowledge-model', knowledgeModelId, 'graph'] }),
                            queryClient.invalidateQueries({ queryKey: ['knowledge-model', knowledgeModelId] }),
                        ]);
                    })().catch(error => toast.error(error instanceof Error ? error.message : t('ParseFailed')));
                }}
            />
            <AlertDialog open={Boolean(deleting)} onOpenChange={open => !open && !remove.isPending && setDeleting(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('DeleteTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('DeleteDescription', { name: deleting?.fileName ?? '' })}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={remove.isPending}>{t('Cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={remove.isPending}
                            onClick={() => deleting && remove.mutate(deleting)}
                        >
                            {remove.isPending ? t('Deleting') : t('Delete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <AlertDialog open={Boolean(disconnecting)} onOpenChange={open => !open && !disconnect.isPending && setDisconnecting(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('GitHubDisconnectTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>{t('GitHubDisconnectDescription', { repository: disconnecting?.repositoryFullName ?? '' })}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={disconnect.isPending}>{t('Cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={disconnect.isPending}
                            onClick={() => disconnecting && disconnect.mutate(disconnecting)}
                        >
                            {disconnect.isPending ? t('Deleting') : t('GitHubDisconnect')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

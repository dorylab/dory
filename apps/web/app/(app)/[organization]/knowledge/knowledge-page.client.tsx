'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { Fragment, useDeferredValue, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    ArrowDown,
    ArrowLeft,
    Bot,
    BrainCircuit,
    CheckCircle2,
    ChevronRight,
    Circle,
    CircleAlert,
    ExternalLink,
    FileCode2,
    FileText,
    MoreHorizontal,
    Pencil,
    Plus,
    Search,
    ShieldCheck,
    Sparkles,
    Trash2,
    Upload,
    UserRound,
    X,
} from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { toast } from 'sonner';

import type { ConnectionListItem } from '@dory/shared/types/connections';
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
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/registry/new-york-v4/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import { KnowledgeSourcesPanel } from './knowledge-sources-panel';

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
type ModelDataSource = { connectionId: string; name: string; type: string; engine: string };
export type KnowledgeModelView = {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    businessContextMd: string;
    modelYaml: string;
    model: { definitions: Definition[] };
    dataSources: ModelDataSource[];
    verifiedQueryCount: number;
    knowledgeSourceCount: number;
    readiness: {
        status: 'ready' | 'not_ready';
        requirements: { dataSource: boolean; verifiedDefinition: boolean };
    };
    agentUnderstands: Array<{ id: string; name: string; kind: Definition['kind'] }>;
    createdAt: string;
    updatedAt: string;
};
type VerifiedQuery = {
    id: string;
    knowledgeModelId: string;
    sourceConnectionId: string;
    title: string;
    question: string;
    sql: string;
    description: string | null;
    definitionIds: string[];
    sourceType: string;
    sourceId: string | null;
    createdBy: string | null;
    updatedBy: string | null;
    updatedByName: string | null;
    createdAt: string;
    updatedAt: string;
};
type KnowledgeSourceSummary = { id: string; fileName: string; format: 'markdown' | 'yaml' | 'text'; connectionId: string | null };
type KnowledgeGraph = {
    queryDefinitionEdges: Array<{ queryId: string; definitionId: string }>;
    sourceAssetEdges: Array<{
        sourceId: string;
        assetType: 'definition' | 'verified_query';
        assetId: string;
        relationType: 'provided' | 'generated';
    }>;
};

function AssetSourceEditor({
    organization,
    knowledgeModelId,
    assetType,
    assetId,
    sources,
    graph,
}: {
    organization: string;
    knowledgeModelId: string;
    assetType: 'definition' | 'verified_query';
    assetId: string;
    sources: KnowledgeSourceSummary[];
    graph: KnowledgeGraph;
}) {
    const t = useTranslations('Knowledge');
    const queryClient = useQueryClient();
    const relationBySourceId = new Map(
        graph.sourceAssetEdges.filter(edge => edge.assetType === assetType && edge.assetId === assetId).map(edge => [edge.sourceId, edge.relationType] as const),
    );
    const selectedSourceIds = [...relationBySourceId.keys()];
    const update = useMutation({
        mutationFn: (sourceIds: string[]) =>
            executeActionClient('knowledge.replaceAssetSources', { knowledgeModelId, assetType, assetId, sourceIds, relationType: 'provided' }, { organizationId: organization }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: [...modelKey(knowledgeModelId), 'graph'] }),
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.UpdateReferences')),
    });
    const displayedSourceIds = update.isPending && update.variables ? update.variables : selectedSourceIds;

    if (!sources.length) {
        return (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2.5">
                <p className="text-sm text-muted-foreground">{t('VerifiedQueryDetails.NoKnowledgeSources')}</p>
                <Button variant="outline" size="sm" asChild>
                    <Link href="?tab=sources">{t('VerifiedQueryDetails.AddKnowledgeSource')}</Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="max-h-48 divide-y overflow-y-auto rounded-md border">
            {sources.map(source => {
                const relationType = relationBySourceId.get(source.id);
                const checked = displayedSourceIds.includes(source.id);
                return (
                    <div key={source.id} className="flex min-h-10 items-center gap-3 px-3 py-2">
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={checked}
                                disabled={update.isPending}
                                onChange={() => update.mutate(checked ? displayedSourceIds.filter(id => id !== source.id) : [...displayedSourceIds, source.id])}
                            />
                            <span className="truncate">{source.fileName}</span>
                        </label>
                        {checked && relationType ? <Badge variant="outline">{t(`RelationTypes.${relationType}`)}</Badge> : null}
                        <Button variant="ghost" size="icon-sm" asChild>
                            <Link href={`?tab=sources&source=${encodeURIComponent(source.id)}`} aria-label={t('DefinitionSources.OpenNamed', { name: source.fileName })}>
                                <ExternalLink />
                            </Link>
                        </Button>
                    </div>
                );
            })}
        </div>
    );
}

function DefinitionSourceEditor({
    organization,
    knowledgeModelId,
    definitionId,
    sources,
    graph,
}: {
    organization: string;
    knowledgeModelId: string;
    definitionId: string;
    sources: KnowledgeSourceSummary[];
    graph: KnowledgeGraph;
}) {
    const t = useTranslations('Knowledge');
    const queryClient = useQueryClient();
    const relationBySourceId = new Map(
        graph.sourceAssetEdges.filter(edge => edge.assetType === 'definition' && edge.assetId === definitionId).map(edge => [edge.sourceId, edge.relationType] as const),
    );
    const selectedSourceIds = [...relationBySourceId.keys()];
    const update = useMutation({
        mutationFn: (sourceIds: string[]) =>
            executeActionClient(
                'knowledge.replaceAssetSources',
                { knowledgeModelId, assetType: 'definition', assetId: definitionId, sourceIds, relationType: 'provided' },
                { organizationId: organization },
            ),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: [...modelKey(knowledgeModelId), 'graph'] }),
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.UpdateReferences')),
    });
    const displayedSourceIds = update.isPending && update.variables ? update.variables : selectedSourceIds;

    if (!sources.length) {
        return (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2.5">
                <p className="text-sm text-muted-foreground">{t('DefinitionSources.EmptyTitle')}</p>
                <Button variant="outline" size="sm" asChild>
                    <Link href="?tab=sources">{t('DefinitionSources.AddAction')}</Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="max-h-48 divide-y overflow-y-auto rounded-md border">
            {sources.map(source => {
                const relationType = relationBySourceId.get(source.id);
                const checked = displayedSourceIds.includes(source.id);
                return (
                    <div key={source.id} className="flex min-h-10 items-center gap-3 px-3 py-2">
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={checked}
                                disabled={update.isPending}
                                onChange={() => update.mutate(checked ? displayedSourceIds.filter(id => id !== source.id) : [...displayedSourceIds, source.id])}
                            />
                            <span className="truncate">{source.fileName}</span>
                        </label>
                        {checked && relationType ? <Badge variant="outline">{t(`RelationTypes.${relationType}`)}</Badge> : null}
                        <Button variant="ghost" size="icon-sm" asChild>
                            <Link href={`?tab=sources&source=${encodeURIComponent(source.id)}`} aria-label={t('DefinitionSources.OpenNamed', { name: source.fileName })}>
                                <ExternalLink />
                            </Link>
                        </Button>
                    </div>
                );
            })}
        </div>
    );
}

function DefinitionReferenceEditor({
    organization,
    knowledgeModelId,
    query,
    definitions,
    graph,
}: {
    organization: string;
    knowledgeModelId: string;
    query: VerifiedQuery;
    definitions: Definition[];
    graph: KnowledgeGraph;
}) {
    const t = useTranslations('Knowledge');
    const queryClient = useQueryClient();
    const sourceIds = graph.sourceAssetEdges.filter(edge => edge.assetType === 'verified_query' && edge.assetId === query.id).map(edge => edge.sourceId);
    const update = useMutation({
        mutationFn: (definitionIds: string[]) =>
            executeActionClient(
                'knowledge.updateVerifiedQuery',
                {
                    knowledgeModelId,
                    id: query.id,
                    title: query.title,
                    question: query.question,
                    sql: query.sql,
                    description: query.description,
                    definitionIds,
                    knowledgeSourceIds: sourceIds,
                },
                { organizationId: organization },
            ),
        onSuccess: () =>
            Promise.all([
                queryClient.invalidateQueries({ queryKey: [...modelKey(knowledgeModelId), 'verified-queries'] }),
                queryClient.invalidateQueries({ queryKey: [...modelKey(knowledgeModelId), 'graph'] }),
            ]),
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.UpdateReferences')),
    });
    const displayedDefinitionIds = update.isPending && update.variables ? update.variables : query.definitionIds;

    if (!definitions.length) return <p className="text-sm text-muted-foreground">{t('VerifiedQueryDetails.NoDefinitions')}</p>;

    return (
        <div className="max-h-48 divide-y overflow-y-auto rounded-md border">
            {definitions.map(definition => {
                const checked = displayedDefinitionIds.includes(definition.id);
                return (
                    <label key={definition.id} className="flex min-h-10 cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                        <input
                            type="checkbox"
                            checked={checked}
                            disabled={update.isPending}
                            onChange={() => update.mutate(checked ? displayedDefinitionIds.filter(id => id !== definition.id) : [...displayedDefinitionIds, definition.id])}
                        />
                        {definition.name}
                    </label>
                );
            })}
        </div>
    );
}

const modelKey = (modelId: string) => ['knowledge-model', modelId] as const;
const connectionIdOf = (item: ConnectionListItem) => item.connection.id!;
const MonacoYamlEditor = dynamic(() => import('@/components/@dory/ui/monaco-editor'), {
    ssr: false,
    loading: () => <div className="h-full animate-pulse bg-muted" />,
});

function relativeTime(value: string) {
    const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    if (Math.abs(seconds) < 3600) return formatter.format(Math.round(seconds / 60), 'minute');
    if (Math.abs(seconds) < 86400) return formatter.format(Math.round(seconds / 3600), 'hour');
    return formatter.format(Math.round(seconds / 86400), 'day');
}

function formatFileSize(bytes: number) {
    if (bytes < 1_000) return `${bytes} B`;
    if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(bytes < 10_000 ? 1 : 0)} KB`;
    return `${(bytes / 1_000_000).toFixed(bytes < 10_000_000 ? 1 : 0)} MB`;
}

export function CreateKnowledgeModelDialog({
    connections,
    trigger,
    initialConnectionId,
    onCreated,
}: {
    connections: ConnectionListItem[];
    trigger?: React.ReactNode;
    initialConnectionId?: string;
    onCreated?: (model: KnowledgeModelView) => void;
}) {
    const t = useTranslations('Knowledge');
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [selected, setSelected] = useState<string[]>(initialConnectionId ? [initialConnectionId] : []);
    const create = useMutation({
        mutationFn: () => executeActionClient<KnowledgeModelView>('knowledge.create', { name, description, connectionIds: selected }),
        onSuccess: model => {
            setOpen(false);
            setName('');
            setDescription('');
            setSelected(initialConnectionId ? [initialConnectionId] : []);
            onCreated?.(model);
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.CreateModel')),
    });
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger ?? (
                    <Button>
                        <Plus />
                        {t('NewModel')}
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('NewModel')}</DialogTitle>
                    <DialogDescription>{t('CreateDescription')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">{t('Name')}</label>
                        <Input value={name} onChange={event => setName(event.target.value)} placeholder={t('NamePlaceholder')} />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">{t('Description')}</label>
                        <Textarea value={description} onChange={event => setDescription(event.target.value)} placeholder={t('DescriptionPlaceholder')} />
                    </div>
                    <fieldset className="space-y-2">
                        <legend className="mb-2 text-sm font-medium">{t('DataSources')}</legend>
                        {connections.map(item => {
                            const id = connectionIdOf(item);
                            return (
                                <label key={id} className="flex cursor-pointer items-center gap-3 rounded-md border p-3">
                                    <input
                                        type="checkbox"
                                        className="cursor-pointer"
                                        checked={selected.includes(id)}
                                        onChange={() => setSelected(current => (current.includes(id) ? current.filter(value => value !== id) : [...current, id]))}
                                    />
                                    <span className="text-sm">{item.connection.name}</span>
                                    <span className="ml-auto text-xs text-muted-foreground">{item.connection.engine}</span>
                                </label>
                            );
                        })}
                    </fieldset>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        {t('Cancel')}
                    </Button>
                    <Button onClick={() => create.mutate()} disabled={!name.trim() || selected.length === 0 || create.isPending}>
                        {t('CreateModel')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function EditKnowledgeModelDialog({
    model,
    organization,
    connections,
    onOpenChange,
    onUpdated,
}: {
    model: KnowledgeModelView | null;
    organization: string;
    connections: ConnectionListItem[];
    onOpenChange: (open: boolean) => void;
    onUpdated: (model: KnowledgeModelView) => void;
}) {
    const t = useTranslations('Knowledge');
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [connectionIds, setConnectionIds] = useState<string[]>([]);
    useEffect(() => {
        setName(model?.name ?? '');
        setDescription(model?.description ?? '');
        setConnectionIds(model?.dataSources.map(source => source.connectionId) ?? []);
    }, [model]);
    const update = useMutation({
        mutationFn: async () => {
            if (!model) throw new Error(t('Errors.SelectModel'));
            await executeActionClient<KnowledgeModelView>('knowledge.update', { knowledgeModelId: model.id, name, description }, { organizationId: organization });
            return executeActionClient<KnowledgeModelView>('knowledge.replaceDataSources', { knowledgeModelId: model.id, connectionIds }, { organizationId: organization });
        },
        onSuccess: updated => {
            onUpdated(updated);
            onOpenChange(false);
            toast.success(t('ModelUpdated'));
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.UpdateModel')),
    });

    return (
        <Dialog open={Boolean(model)} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('EditModel')}</DialogTitle>
                    <DialogDescription>{t('EditDescription')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">{t('Name')}</label>
                        <Input value={name} onChange={event => setName(event.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">{t('Description')}</label>
                        <Textarea value={description} onChange={event => setDescription(event.target.value)} />
                    </div>
                    <fieldset className="space-y-2">
                        <legend className="text-sm font-medium">{t('DataSources')}</legend>
                        <div className="max-h-52 space-y-2 overflow-y-auto rounded-md border p-2">
                            {connections.map(connection => {
                                const connectionId = connectionIdOf(connection);
                                return (
                                    <label key={connectionId} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50">
                                        <input
                                            type="checkbox"
                                            checked={connectionIds.includes(connectionId)}
                                            onChange={() =>
                                                setConnectionIds(current =>
                                                    current.includes(connectionId) ? current.filter(id => id !== connectionId) : [...current, connectionId],
                                                )
                                            }
                                        />
                                        <span className="text-sm">{connection.connection.name}</span>
                                        <span className="ml-auto text-xs text-muted-foreground">{connection.connection.engine}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </fieldset>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t('Cancel')}
                    </Button>
                    <Button onClick={() => update.mutate()} disabled={!name.trim() || connectionIds.length === 0 || update.isPending}>
                        {update.isPending ? t('Saving') : t('SaveChanges')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function KnowledgeModelList({ organization }: { organization: string }) {
    const t = useTranslations('Knowledge');
    const router = useRouter();
    const queryClient = useQueryClient();
    const [search, setSearch] = useQueryState('q', parseAsString.withDefault(''));
    const [editingModel, setEditingModel] = useState<KnowledgeModelView | null>(null);
    const [deletingModel, setDeletingModel] = useState<KnowledgeModelView | null>(null);
    const deferredSearch = useDeferredValue(search);
    const connections = useQuery({
        queryKey: ['connections', organization],
        queryFn: () => executeActionClient<{ connections: ConnectionListItem[] }>('connection.list', {}, { organizationId: organization }),
    });
    const models = useQuery({
        queryKey: ['knowledge-models', organization, deferredSearch],
        queryFn: () => executeActionClient<{ models: KnowledgeModelView[] }>('knowledge.list', { query: deferredSearch || undefined }, { organizationId: organization }),
    });
    const onCreated = (model: KnowledgeModelView) => {
        void queryClient.invalidateQueries({ queryKey: ['knowledge-models', organization] });
        router.push(`/${organization}/knowledge/${model.id}`);
    };
    const connectionItems = connections.data?.connections ?? [];
    const deleteModel = useMutation({
        mutationFn: () => {
            if (!deletingModel) throw new Error(t('Errors.SelectModel'));
            return executeActionClient('knowledge.delete', { knowledgeModelId: deletingModel.id }, { organizationId: organization, confirmationToken: 'knowledge.delete' });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['knowledge-models', organization] });
            setDeletingModel(null);
            toast.success(t('ModelDeleted'));
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.DeleteModel')),
    });
    const updateModel = (_model: KnowledgeModelView) => {
        void queryClient.invalidateQueries({ queryKey: ['knowledge-models', organization] });
        setEditingModel(null);
    };
    return (
        <div className="bg-n8 h-screen overflow-auto">
            <main className="container mx-auto flex flex-col gap-6 px-12 pt-4 pb-12 lg:px-12 lg:pb-12 xl:px-8 xl:pb-8 2xl:px-4 2xl:pb-4">
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold">{t('Title')}</h1>
                        <p className="mt-1 text-muted-foreground">{t('Subtitle')}</p>
                    </div>
                    <CreateKnowledgeModelDialog connections={connectionItems} onCreated={onCreated} />
                </header>
                {models.data?.models.length || search ? (
                    <div className="relative max-w-xl">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input className="pl-9" value={search} onChange={event => void setSearch(event.target.value || null)} placeholder={t('SearchModels')} />
                    </div>
                ) : null}
                {models.isLoading ? <p className="text-sm text-muted-foreground">{t('LoadingModels')}</p> : null}
                {models.data?.models.length ? (
                    <div className="overflow-hidden rounded-lg border bg-card">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 text-left text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 font-medium">{t('Model')}</th>
                                    <th className="px-4 py-3 font-medium">{t('Definitions')}</th>
                                    <th className="px-4 py-3 font-medium">{t('DataSources')}</th>
                                    <th className="px-4 py-3 font-medium">{t('Updated')}</th>
                                    <th className="w-24 px-4 py-3" />
                                </tr>
                            </thead>
                            <tbody>
                                {models.data.models.map(model => (
                                    <tr
                                        key={model.id}
                                        className="cursor-pointer border-t transition-colors hover:bg-muted/30"
                                        onClick={() => router.push(`/${organization}/knowledge/${model.id}`)}
                                    >
                                        <td className="px-4 py-4">
                                            <div className="font-medium">{model.name}</div>
                                            {model.description ? <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{model.description}</p> : null}
                                        </td>
                                        <td className="px-4 py-4 text-muted-foreground">
                                            {t('DefinitionQueryCount', {
                                                definitions: model.model.definitions.length,
                                                queries: model.verifiedQueryCount,
                                            })}
                                        </td>
                                        <td className="px-4 py-4 text-muted-foreground">
                                            <div>{t('DataSourceCount', { count: model.dataSources.length })}</div>
                                            <div className="mt-1 text-xs">{model.dataSources.map(source => source.name).join(' · ')}</div>
                                        </td>
                                        <td className="px-4 py-4 text-muted-foreground">{relativeTime(model.updatedAt)}</td>
                                        <td className="px-4 py-4 text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    aria-label={t('EditNamedModel', { name: model.name })}
                                                    onClick={event => {
                                                        event.stopPropagation();
                                                        setEditingModel(model);
                                                    }}
                                                >
                                                    <Pencil />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    aria-label={t('DeleteNamedModel', { name: model.name })}
                                                    onClick={event => {
                                                        event.stopPropagation();
                                                        setDeletingModel(model);
                                                    }}
                                                >
                                                    <Trash2 className="text-destructive" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : models.data && !search ? (
                    <Card className="border-dashed">
                        <CardContent className="flex min-h-80 flex-col items-center justify-center text-center">
                            <div className="mb-4 rounded-full bg-primary/10 p-4 text-primary">
                                <BrainCircuit className="h-8 w-8" />
                            </div>
                            <h2 className="text-lg font-semibold">{t('EmptyTitle')}</h2>
                            <p className="mt-2 max-w-md text-sm text-muted-foreground">{t('EmptyDescription')}</p>
                            <div className="mt-5 flex gap-2">
                                <CreateKnowledgeModelDialog connections={connectionItems} onCreated={onCreated} trigger={<Button>{t('CreateKnowledgeModel')}</Button>} />
                                <Button variant="outline" disabled>
                                    {t('GenerateFromDataSources')}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : null}
                <EditKnowledgeModelDialog
                    model={editingModel}
                    organization={organization}
                    connections={connectionItems}
                    onOpenChange={open => !open && setEditingModel(null)}
                    onUpdated={updateModel}
                />
                <AlertDialog open={Boolean(deletingModel)} onOpenChange={open => !open && setDeletingModel(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{t('DeleteModelTitle')}</AlertDialogTitle>
                            <AlertDialogDescription>{deletingModel ? t('DeleteModelDescription', { name: deletingModel.name }) : ''}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={deleteModel.isPending}>{t('Cancel')}</AlertDialogCancel>
                            <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={event => {
                                    event.preventDefault();
                                    deleteModel.mutate();
                                }}
                                disabled={deleteModel.isPending}
                            >
                                {deleteModel.isPending ? t('Deleting') : t('DeleteModel')}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </main>
        </div>
    );
}

function DefinitionExpandedRow({
    definition,
    organization,
    knowledgeModelId,
    queries,
    sources,
    graph,
    panelId,
    onEdit,
}: {
    definition: Definition;
    organization: string;
    knowledgeModelId: string;
    queries: VerifiedQuery[];
    sources: KnowledgeSourceSummary[];
    graph: KnowledgeGraph;
    panelId: string;
    onEdit: () => void;
}) {
    const t = useTranslations('Knowledge');
    const referencedQueryIds = new Set(graph.queryDefinitionEdges.filter(edge => edge.definitionId === definition.id).map(edge => edge.queryId));
    const referencedQueries = queries.filter(query => referencedQueryIds.has(query.id));
    const metadataFields = [
        [t('DefinitionFields.Aliases'), definition.aliases?.join(', ')],
        [t('DefinitionFields.SourceTable'), definition.source],
        [t('DefinitionFields.Filters'), definition.filters?.join('\n')],
        [t('DefinitionFields.TimeDimension'), definition.timeDimension],
        [t('DefinitionFields.AvailableDimensions'), definition.dimensions?.join(', ')],
        [t('FromDefinition'), definition.from],
        [t('ToDefinition'), definition.to],
    ].filter(([, value]) => value);
    const hasDefinitionDetails = Boolean(definition.description || definition.expression || metadataFields.length);

    return (
        <tr className="border-t bg-muted/10">
            <td colSpan={5} className="p-0">
                <div id={panelId} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <div className="text-base font-semibold">{definition.name}</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                                <Badge variant="outline">{t(`Kinds.${definition.kind}`)}</Badge>
                                {definition.status === 'verified' ? (
                                    <Badge variant="secondary">
                                        <CheckCircle2 />
                                        {t('Verified')}
                                    </Badge>
                                ) : (
                                    <Badge variant="outline">{t('Unverified')}</Badge>
                                )}
                            </div>
                        </div>
                        <Button variant="outline" size="sm" onClick={onEdit} aria-label={t('EditNamedDefinition', { name: definition.name })}>
                            <Pencil />
                            {t('EditDefinitionAction')}
                        </Button>
                    </div>

                    {hasDefinitionDetails ? (
                        <dl className="mt-5 grid gap-4 md:grid-cols-2">
                            {definition.description ? (
                                <div className="md:col-span-2">
                                    <dt className="text-sm font-medium text-muted-foreground">{t('DefinitionFields.Description')}</dt>
                                    <dd className="mt-1 whitespace-pre-wrap text-sm leading-6">{definition.description}</dd>
                                </div>
                            ) : null}
                            {definition.expression ? (
                                <div className="md:col-span-2">
                                    <dt className="text-sm font-medium text-muted-foreground">{t('DefinitionFields.Calculation')}</dt>
                                    <dd className="mt-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-sm">{definition.expression}</dd>
                                </div>
                            ) : null}
                            {metadataFields.map(([label, value]) => (
                                <div key={label}>
                                    <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
                                    <dd className="mt-1 whitespace-pre-wrap text-sm">{value}</dd>
                                </div>
                            ))}
                        </dl>
                    ) : (
                        <p className="mt-5 text-sm text-muted-foreground">{t('NoDefinitionDetails')}</p>
                    )}

                    <div className="mt-5 grid gap-4 border-t pt-5 md:grid-cols-2">
                        <section className="rounded-lg border bg-background/60 p-4">
                            <div className="flex items-start gap-3">
                                <FileCode2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                                <div>
                                    <h3 className="text-sm font-semibold">{t('DefinitionQueries.Title')}</h3>
                                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('DefinitionQueries.Description')}</p>
                                </div>
                            </div>
                            {referencedQueries.length ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {referencedQueries.map(query => (
                                        <Button key={query.id} variant="outline" size="sm" asChild>
                                            <Link href={`?tab=queries&query=${encodeURIComponent(query.id)}`}>{query.title}</Link>
                                        </Button>
                                    ))}
                                </div>
                            ) : (
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed px-3 py-2.5">
                                    <p className="text-sm text-muted-foreground">{t('DefinitionQueries.EmptyTitle')}</p>
                                    <Button variant="outline" size="sm" asChild>
                                        <Link href="?tab=queries">{t('DefinitionQueries.ViewAction')}</Link>
                                    </Button>
                                </div>
                            )}
                        </section>

                        <section className="rounded-lg border bg-background/60 p-4">
                            <div className="flex items-start gap-3">
                                <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                                <div>
                                    <h3 className="text-sm font-semibold">{t('DefinitionSources.Title')}</h3>
                                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('DefinitionSources.Description')}</p>
                                </div>
                            </div>
                            <div className="mt-3">
                                <DefinitionSourceEditor
                                    organization={organization}
                                    knowledgeModelId={knowledgeModelId}
                                    definitionId={definition.id}
                                    sources={sources}
                                    graph={graph}
                                />
                            </div>
                        </section>
                    </div>
                </div>
            </td>
        </tr>
    );
}

function EditDefinitionDialog({
    definition,
    model,
    onOpenChange,
    onSave,
}: {
    definition: Definition | null;
    model: KnowledgeModelView;
    onOpenChange: (open: boolean) => void;
    onSave: (definitionId: string, definition: Definition) => Promise<void>;
}) {
    const t = useTranslations('Knowledge');
    const [name, setName] = useState('');
    const [sourceConnectionId, setSourceConnectionId] = useState('');
    const [source, setSource] = useState('');
    const [expression, setExpression] = useState('');
    const [description, setDescription] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [status, setStatus] = useState<Definition['status']>('verified');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!definition) return;
        setName(definition.name);
        setSourceConnectionId(definition.sourceConnectionId);
        setSource(definition.source ?? '');
        setExpression(definition.expression ?? '');
        setDescription(definition.description ?? '');
        setFrom(definition.from ?? '');
        setTo(definition.to ?? '');
        setStatus(definition.status);
    }, [definition]);

    const relationshipOptions = model.model.definitions.filter(item => item.sourceConnectionId === sourceConnectionId && item.kind !== 'relationship');
    const kind = definition?.kind ?? 'metric';
    const save = async () => {
        if (!definition || !name.trim() || !sourceConnectionId || (kind === 'relationship' && (!from || !to))) return;
        setIsSaving(true);
        try {
            await onSave(definition.id, {
                ...definition,
                status,
                name: name.trim(),
                sourceConnectionId,
                description: description.trim() || undefined,
                source: kind === 'relationship' ? undefined : source.trim() || undefined,
                expression: kind === 'relationship' ? undefined : expression.trim() || undefined,
                from: kind === 'relationship' ? from : undefined,
                to: kind === 'relationship' ? to : undefined,
            });
            onOpenChange(false);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={Boolean(definition)} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[calc(100vh-4rem)] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t('EditDefinitionTitle')}</DialogTitle>
                    <DialogDescription>{t('EditDefinitionDescription')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <Input aria-label={t('Name')} value={name} onChange={event => setName(event.target.value)} placeholder={t('DefinitionNamePlaceholder')} />
                    <Select
                        value={sourceConnectionId}
                        onValueChange={value => {
                            setSourceConnectionId(value);
                            setFrom('');
                            setTo('');
                        }}
                    >
                        <SelectTrigger className="w-full" aria-label={t('DataSources')}>
                            <SelectValue placeholder={t('SelectDataSource')} />
                        </SelectTrigger>
                        <SelectContent>
                            {model.dataSources.map(item => (
                                <SelectItem key={item.connectionId} value={item.connectionId}>
                                    {item.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={status} onValueChange={value => setStatus(value as Definition['status'])}>
                        <SelectTrigger className="w-full" aria-label={t('VerificationStatus')}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="verified">{t('Verified')}</SelectItem>
                            <SelectItem value="unverified">{t('Unverified')}</SelectItem>
                        </SelectContent>
                    </Select>
                    {kind === 'relationship' ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">{t('FromDefinition')}</label>
                                <Select value={from} onValueChange={setFrom}>
                                    <SelectTrigger className="w-full" aria-label={t('FromDefinition')}>
                                        <SelectValue placeholder={t('FromDefinition')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {relationshipOptions.map(item => (
                                            <SelectItem key={item.id} value={item.id}>
                                                {item.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium">{t('ToDefinition')}</label>
                                <Select value={to} onValueChange={setTo}>
                                    <SelectTrigger className="w-full" aria-label={t('ToDefinition')}>
                                        <SelectValue placeholder={t('ToDefinition')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {relationshipOptions.map(item => (
                                            <SelectItem key={item.id} value={item.id}>
                                                {item.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    ) : (
                        <>
                            <Input
                                aria-label={t('DefinitionFields.SourceTable')}
                                value={source}
                                onChange={event => setSource(event.target.value)}
                                placeholder={t('SourceTablePlaceholder')}
                            />
                            <Input
                                aria-label={t('DefinitionFields.Calculation')}
                                value={expression}
                                onChange={event => setExpression(event.target.value)}
                                placeholder={t('CalculationPlaceholder')}
                            />
                        </>
                    )}
                    <Textarea
                        aria-label={t('DefinitionFields.Description')}
                        value={description}
                        onChange={event => setDescription(event.target.value)}
                        placeholder={t('BusinessDefinitionPlaceholder')}
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                        {t('Cancel')}
                    </Button>
                    <Button onClick={save} disabled={!name.trim() || !sourceConnectionId || (kind === 'relationship' && (!from || !to)) || isSaving}>
                        {isSaving ? t('Saving') : t('SaveDefinition')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function DefinitionPanel({
    organization,
    model,
    queries,
    graph,
    sources,
    onSave,
    onUpdate,
    onImport,
    onAskAi,
}: {
    organization: string;
    model: KnowledgeModelView;
    queries: VerifiedQuery[];
    graph: KnowledgeGraph;
    sources: KnowledgeSourceSummary[];
    onSave: (definitions: Definition[]) => void;
    onUpdate: (definitionId: string, definition: Definition) => Promise<void>;
    onImport: () => void;
    onAskAi: () => void;
}) {
    const t = useTranslations('Knowledge');
    const [selectedDefinitionId, setSelectedDefinitionId] = useQueryState('definition', parseAsString);
    const selected = model.model.definitions.find(definition => definition.id === selectedDefinitionId) ?? null;
    const [editingDefinition, setEditingDefinition] = useState<Definition | null>(null);
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [kind, setKind] = useState<Definition['kind']>('metric');
    const [sourceConnectionId, setSourceConnectionId] = useState(model.dataSources[0]?.connectionId ?? '');
    const [source, setSource] = useState('');
    const [expression, setExpression] = useState('');
    const [description, setDescription] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const create = () => {
        if (!name.trim() || !sourceConnectionId || (kind === 'relationship' && (!from || !to))) return;
        onSave([
            ...model.model.definitions,
            {
                id: `${kind}:${crypto.randomUUID()}`,
                name: name.trim(),
                kind,
                status: 'verified',
                sourceConnectionId,
                source: kind === 'relationship' ? undefined : source.trim() || undefined,
                expression: kind === 'relationship' ? undefined : expression.trim() || undefined,
                description: description.trim() || undefined,
                from: kind === 'relationship' ? from : undefined,
                to: kind === 'relationship' ? to : undefined,
            },
        ]);
        setOpen(false);
        setName('');
        setSource('');
        setExpression('');
        setDescription('');
        setFrom('');
        setTo('');
    };
    const sourceName = (id: string) => model.dataSources.find(item => item.connectionId === id)?.name ?? id;
    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button>
                            <Plus />
                            {t('AddDefinition')}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={onAskAi}>
                            <Sparkles />
                            {t('CreateWithAi')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={() => {
                                setKind('metric');
                                setOpen(true);
                            }}
                        >
                            {t('Kinds.metric')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={() => {
                                setKind('dimension');
                                setOpen(true);
                            }}
                        >
                            {t('Kinds.dimension')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={() => {
                                setKind('relationship');
                                setOpen(true);
                            }}
                        >
                            {t('Kinds.relationship')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={onImport}>{t('Import')}</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left">
                        <tr>
                            <th className="p-3">{t('Name')}</th>
                            <th className="p-3">{t('Type')}</th>
                            <th className="p-3">{t('Source')}</th>
                            <th className="p-3">{t('Status')}</th>
                            <th className="w-12" />
                        </tr>
                    </thead>
                    <tbody>
                        {model.model.definitions.map(definition => {
                            const expanded = selected?.id === definition.id;
                            const panelId = `definition-details-${definition.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

                            return (
                                <Fragment key={definition.id}>
                                    <tr className="border-t hover:bg-muted/30">
                                        <td className="p-0 font-medium">
                                            <button
                                                type="button"
                                                className="flex w-full items-center gap-2 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                                aria-expanded={expanded}
                                                aria-controls={panelId}
                                                aria-label={t(expanded ? 'CloseNamedDefinitionDetails' : 'OpenNamedDefinitionDetails', { name: definition.name })}
                                                onClick={() => void setSelectedDefinitionId(expanded ? null : definition.id)}
                                            >
                                                <ChevronRight
                                                    className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`}
                                                    aria-hidden="true"
                                                />
                                                <span>{definition.name}</span>
                                            </button>
                                        </td>
                                        <td className="p-3">{t(`Kinds.${definition.kind}`)}</td>
                                        <td className="p-3">{definition.source || sourceName(definition.sourceConnectionId)}</td>
                                        <td className="p-3">
                                            {definition.status === 'verified' ? (
                                                <Badge variant="secondary">
                                                    <CheckCircle2 />
                                                    {t('Verified')}
                                                </Badge>
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                        <td>
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                aria-label={t('DeleteNamedDefinition', { name: definition.name })}
                                                onClick={() => onSave(model.model.definitions.filter(item => item.id !== definition.id))}
                                            >
                                                <Trash2 />
                                            </Button>
                                        </td>
                                    </tr>
                                    {expanded ? (
                                        <DefinitionExpandedRow
                                            definition={definition}
                                            organization={organization}
                                            knowledgeModelId={model.id}
                                            queries={queries}
                                            sources={sources}
                                            graph={graph}
                                            panelId={panelId}
                                            onEdit={() => setEditingDefinition(definition)}
                                        />
                                    ) : null}
                                </Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('CreateDefinitionTitle', { type: t(`Kinds.${kind}`) })}</DialogTitle>
                        <DialogDescription>{t('CreateDefinitionDescription')}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Input value={name} onChange={event => setName(event.target.value)} placeholder={t('DefinitionNamePlaceholder')} />
                        <Select value={sourceConnectionId} onValueChange={setSourceConnectionId}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder={t('SelectDataSource')} />
                            </SelectTrigger>
                            <SelectContent>
                                {model.dataSources.map(item => (
                                    <SelectItem key={item.connectionId} value={item.connectionId}>
                                        {item.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {kind === 'relationship' ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <Select value={from} onValueChange={setFrom}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder={t('FromDefinition')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {model.model.definitions
                                            .filter(item => item.sourceConnectionId === sourceConnectionId && item.kind !== 'relationship')
                                            .map(item => (
                                                <SelectItem key={item.id} value={item.id}>
                                                    {item.name}
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                                <Select value={to} onValueChange={setTo}>
                                    <SelectTrigger className="w-full">
                                        <SelectValue placeholder={t('ToDefinition')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {model.model.definitions
                                            .filter(item => item.sourceConnectionId === sourceConnectionId && item.kind !== 'relationship')
                                            .map(item => (
                                                <SelectItem key={item.id} value={item.id}>
                                                    {item.name}
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : (
                            <>
                                <Input value={source} onChange={event => setSource(event.target.value)} placeholder={t('SourceTablePlaceholder')} />
                                <Input value={expression} onChange={event => setExpression(event.target.value)} placeholder={t('CalculationPlaceholder')} />
                            </>
                        )}
                        <Textarea value={description} onChange={event => setDescription(event.target.value)} placeholder={t('BusinessDefinitionPlaceholder')} />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>
                            {t('Cancel')}
                        </Button>
                        <Button onClick={create}>{t('AddDefinition')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <EditDefinitionDialog definition={editingDefinition} model={model} onOpenChange={open => !open && setEditingDefinition(null)} onSave={onUpdate} />
        </div>
    );
}

function AskAiDialog({
    open,
    onOpenChange,
    model,
    organization,
    onAccept,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    model: KnowledgeModelView;
    organization: string;
    onAccept: (definitions: Definition[], generatedIds: string[], sourceIds: string[]) => void;
}) {
    const t = useTranslations('Knowledge');
    const [operation, setOperation] = useState('generate_definitions');
    const [prompt, setPrompt] = useState('');
    const [suggestions, setSuggestions] = useState<Definition[]>([]);
    const [sourceIds, setSourceIds] = useState<string[]>([]);
    const sources = useQuery({
        queryKey: [...modelKey(model.id), 'knowledge-sources'],
        queryFn: () =>
            executeActionClient<{ sources: KnowledgeSourceSummary[] }>('knowledge.listKnowledgeSources', { knowledgeModelId: model.id }, { organizationId: organization }),
        enabled: open,
    });
    const generate = useMutation({
        mutationFn: () =>
            executeActionClient<{ suggestions: Definition[] }>('knowledge.generateSuggestions', { knowledgeModelId: model.id, operation, prompt, knowledgeSourceIds: sourceIds }),
        onSuccess: data => setSuggestions(data.suggestions),
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.GenerateSuggestions')),
    });
    const accept = () => {
        const existing = new Set(model.model.definitions.map(item => item.id));
        const generated = suggestions.map(item => ({ ...item, id: existing.has(item.id) ? `${item.id}:${crypto.randomUUID()}` : item.id, status: 'verified' as const }));
        onAccept(
            [...model.model.definitions, ...generated],
            generated.map(item => item.id),
            sourceIds,
        );
        onOpenChange(false);
        setSuggestions([]);
    };
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t('AskAi')}</DialogTitle>
                    <DialogDescription>{t('AskAiDescription')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <fieldset className="space-y-2 rounded-md border p-3">
                        <legend className="px-1 text-sm font-medium">{t('ReferenceSources')}</legend>
                        {sources.data?.sources.map(source => (
                            <label key={source.id} className="flex cursor-pointer items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={sourceIds.includes(source.id)}
                                    onChange={() => setSourceIds(current => (current.includes(source.id) ? current.filter(id => id !== source.id) : [...current, source.id]))}
                                />
                                {source.fileName}
                            </label>
                        ))}
                        {sources.data && !sources.data.sources.length ? <p className="text-sm text-muted-foreground">{t('ReferenceSourcesEmpty')}</p> : null}
                    </fieldset>
                    <Select value={operation} onValueChange={setOperation}>
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="generate_definitions">{t('AiOperations.GenerateDefinitions')}</SelectItem>
                            <SelectItem value="analyze_context">{t('AiOperations.AnalyzeContext')}</SelectItem>
                            <SelectItem value="analyze_schema">{t('AiOperations.AnalyzeSchema')}</SelectItem>
                            <SelectItem value="find_relationships">{t('AiOperations.FindRelationships')}</SelectItem>
                            <SelectItem value="suggest_metrics">{t('AiOperations.SuggestMetrics')}</SelectItem>
                        </SelectContent>
                    </Select>
                    <Textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={t('AiPromptPlaceholder')} />
                    {suggestions.length ? (
                        <div className="max-h-72 space-y-2 overflow-auto">
                            {suggestions.map(item => (
                                <div key={item.id} className="rounded-md border p-3">
                                    <div className="font-medium">
                                        {item.name} <span className="text-xs text-muted-foreground">{t(`Kinds.${item.kind}`)}</span>
                                    </div>
                                    <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t('Cancel')}
                    </Button>
                    {suggestions.length ? (
                        <Button onClick={accept}>{t('ReviewAndAdd', { count: suggestions.length })}</Button>
                    ) : (
                        <Button onClick={() => generate.mutate()} disabled={generate.isPending || sourceIds.length === 0}>
                            {generate.isPending ? t('Analyzing') : t('GenerateSuggestions')}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ImportYamlDialog({
    open,
    onOpenChange,
    model,
    onImported,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    model: KnowledgeModelView;
    onImported: (model: KnowledgeModelView) => void;
}) {
    const t = useTranslations('Knowledge');
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [yaml, setYaml] = useState('');
    const [fileName, setFileName] = useState('');
    const [fileSize, setFileSize] = useState(0);
    const [fallbackSourceConnectionId, setFallbackSourceConnectionId] = useState(model.dataSources[0]?.connectionId ?? '');
    const selectFile = async (file: File | undefined) => {
        if (!file) return;
        if (!/\.ya?ml$/i.test(file.name)) {
            toast.error(t('UnsupportedYamlFile'));
            return;
        }
        if (file.size > 10_000_000) {
            toast.error(t('YamlFileTooLarge'));
            return;
        }
        const content = await file.text();
        if (!content.trim()) {
            toast.error(t('EmptyYamlFile'));
            return;
        }
        setYaml(content);
        setFileName(file.name);
        setFileSize(file.size);
    };
    const clearFile = () => {
        setYaml('');
        setFileName('');
        setFileSize(0);
        if (inputRef.current) inputRef.current.value = '';
    };
    const importYaml = useMutation({
        mutationFn: () =>
            executeActionClient<KnowledgeModelView>('knowledge.importYaml', {
                knowledgeModelId: model.id,
                source: yaml,
                fallbackSourceConnectionId,
            }),
        onSuccess: imported => {
            onImported(imported);
            onOpenChange(false);
            clearFile();
            toast.success(t('YamlImported'));
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.ImportYaml')),
    });

    return (
        <Dialog
            open={open}
            onOpenChange={next => {
                onOpenChange(next);
                if (!next && !importYaml.isPending) clearFile();
            }}
        >
            <DialogContent className="flex h-[min(42rem,calc(100dvh-2rem))] flex-col sm:max-w-3xl">
                <DialogHeader className="shrink-0">
                    <DialogTitle>{t('ImportYamlTitle')}</DialogTitle>
                    <DialogDescription>{t('ImportYamlDescription')}</DialogDescription>
                </DialogHeader>
                <div className="flex min-h-0 flex-1 flex-col gap-3">
                    <Select value={fallbackSourceConnectionId} onValueChange={setFallbackSourceConnectionId}>
                        <SelectTrigger className="w-full shrink-0">
                            <SelectValue placeholder={t('SelectDataSource')} />
                        </SelectTrigger>
                        <SelectContent>
                            {model.dataSources.map(source => (
                                <SelectItem key={source.connectionId} value={source.connectionId}>
                                    {source.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <input
                        ref={inputRef}
                        type="file"
                        accept=".yaml,.yml,application/x-yaml,text/yaml"
                        className="sr-only"
                        onChange={event => void selectFile(event.target.files?.[0])}
                    />
                    {fileName ? (
                        <>
                            <div className="flex shrink-0 items-center gap-3 rounded-md border px-3 py-2">
                                <FileCode2 className="size-5 shrink-0 text-muted-foreground" />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">{fileName}</div>
                                    <div className="text-xs text-muted-foreground">{formatFileSize(fileSize)}</div>
                                </div>
                                <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                                    {t('ReplaceFile')}
                                </Button>
                                <Button variant="ghost" size="icon-sm" onClick={clearFile} aria-label={t('RemoveYamlFile')}>
                                    <X />
                                </Button>
                            </div>
                            <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
                                <div className="border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">{t('YamlPreview')}</div>
                                <div className="h-[calc(100%-2.0625rem)]">
                                    <MonacoYamlEditor
                                        height="100%"
                                        language="yaml"
                                        value={yaml}
                                        options={{
                                            automaticLayout: true,
                                            minimap: { enabled: false },
                                            fontSize: 13,
                                            lineNumbers: 'off',
                                            lineNumbersMinChars: 0,
                                            readOnly: true,
                                            scrollBeyondLastLine: false,
                                            tabSize: 2,
                                            wordWrap: 'on',
                                            padding: { top: 12, bottom: 12 },
                                        }}
                                    />
                                </div>
                            </div>
                        </>
                    ) : (
                        <button
                            type="button"
                            className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-md border border-dashed bg-muted/20 px-6 text-center transition-colors hover:bg-muted/35"
                            onClick={() => inputRef.current?.click()}
                            onDragOver={event => event.preventDefault()}
                            onDrop={event => {
                                event.preventDefault();
                                void selectFile(event.dataTransfer.files[0]);
                            }}
                        >
                            <span className="rounded-full bg-primary/10 p-3 text-primary">
                                <Upload className="size-5" />
                            </span>
                            <span className="mt-3 text-sm font-medium">{t('UploadYamlFile')}</span>
                            <span className="mt-1 text-xs text-muted-foreground">{t('UploadYamlHint')}</span>
                        </button>
                    )}
                </div>
                <DialogFooter className="shrink-0">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t('Cancel')}
                    </Button>
                    <Button onClick={() => importYaml.mutate()} disabled={!yaml.trim() || !fallbackSourceConnectionId || importYaml.isPending}>
                        {importYaml.isPending ? t('Importing') : t('Import')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function YamlEditorDialog({
    open,
    onOpenChange,
    model,
    onSaved,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    model: KnowledgeModelView;
    onSaved: (model: KnowledgeModelView) => void;
}) {
    const t = useTranslations('Knowledge');
    const [yaml, setYaml] = useState(model.modelYaml);
    useEffect(() => {
        if (open) setYaml(model.modelYaml);
    }, [open, model.modelYaml]);
    const save = useMutation({
        mutationFn: () =>
            executeActionClient<KnowledgeModelView>('knowledge.importYaml', {
                knowledgeModelId: model.id,
                source: yaml,
                fallbackSourceConnectionId: model.dataSources[0]?.connectionId,
                preserveStatus: true,
            }),
        onSuccess: saved => {
            onSaved(saved);
            onOpenChange(false);
            toast.success(t('YamlSaved'));
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.SaveYaml')),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[min(42rem,calc(100dvh-2rem))] flex-col sm:max-w-3xl">
                <DialogHeader className="shrink-0">
                    <DialogTitle>{t('ModelYaml')}</DialogTitle>
                    <DialogDescription>{t('ModelYamlDescription')}</DialogDescription>
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
                    <MonacoYamlEditor
                        height="100%"
                        language="yaml"
                        value={yaml}
                        onChange={value => setYaml(value ?? '')}
                        options={{
                            automaticLayout: true,
                            minimap: { enabled: false },
                            fontSize: 13,
                            lineNumbers: 'off',
                            lineNumbersMinChars: 0,
                            scrollBeyondLastLine: false,
                            tabSize: 2,
                            insertSpaces: true,
                            padding: { top: 12, bottom: 12 },
                        }}
                    />
                </div>
                <DialogFooter className="shrink-0">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t('Cancel')}
                    </Button>
                    <Button onClick={() => save.mutate()} disabled={!yaml.trim() || save.isPending}>
                        {save.isPending ? t('Saving') : t('SaveYaml')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function KnowledgeModelDetail({ organization, knowledgeModelId }: { organization: string; knowledgeModelId: string }) {
    const t = useTranslations('Knowledge');
    const router = useRouter();
    const queryClient = useQueryClient();
    const [markdown, setMarkdown] = useState('');
    const [yamlEditorOpen, setYamlEditorOpen] = useState(false);
    const [askAiOpen, setAskAiOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [editingModel, setEditingModel] = useState<KnowledgeModelView | null>(null);
    const [activeTab, setActiveTab] = useQueryState('tab', parseAsString.withDefault('overview'));
    const [selectedQueryId, setSelectedQueryId] = useQueryState('query', parseAsString);
    const modelQuery = useQuery({
        queryKey: modelKey(knowledgeModelId),
        queryFn: () => executeActionClient<KnowledgeModelView>('knowledge.get', { knowledgeModelId }, { organizationId: organization }),
    });
    const queries = useQuery({
        queryKey: [...modelKey(knowledgeModelId), 'verified-queries'],
        queryFn: () => executeActionClient<{ queries: VerifiedQuery[] }>('knowledge.listVerifiedQueries', { knowledgeModelId }, { organizationId: organization }),
    });
    const graph = useQuery({
        queryKey: [...modelKey(knowledgeModelId), 'graph'],
        queryFn: () => executeActionClient<KnowledgeGraph>('knowledge.getGraph', { knowledgeModelId }, { organizationId: organization }),
    });
    const sources = useQuery({
        queryKey: [...modelKey(knowledgeModelId), 'knowledge-sources'],
        queryFn: () => executeActionClient<{ sources: KnowledgeSourceSummary[] }>('knowledge.listKnowledgeSources', { knowledgeModelId }, { organizationId: organization }),
    });
    const connections = useQuery({
        queryKey: ['connections', organization],
        queryFn: () => executeActionClient<{ connections: ConnectionListItem[] }>('connection.list', {}, { organizationId: organization }),
    });
    useEffect(() => {
        if (modelQuery.data) setMarkdown(modelQuery.data.businessContextMd);
    }, [modelQuery.data]);
    const setModel = (model: KnowledgeModelView) => queryClient.setQueryData(modelKey(knowledgeModelId), model);
    const update = useMutation({
        mutationFn: (input: Record<string, unknown>) =>
            executeActionClient<KnowledgeModelView>('knowledge.update', { knowledgeModelId, ...input }, { organizationId: organization }),
        onSuccess: setModel,
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.Update')),
    });
    const saveDefinitions = useMutation({
        mutationFn: (definitions: Definition[]) =>
            executeActionClient<KnowledgeModelView>('knowledge.saveDefinitions', { knowledgeModelId, definitions }, { organizationId: organization }),
        onSuccess: setModel,
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.SaveDefinitions')),
    });
    const saveDefinitionsWithSources = useMutation({
        mutationFn: async ({
            definitions,
            assetIds,
            sourceIds,
            relationType,
        }: {
            definitions: Definition[];
            assetIds: string[];
            sourceIds: string[];
            relationType: 'provided' | 'generated';
        }) => {
            const saved = await executeActionClient<KnowledgeModelView>('knowledge.saveDefinitions', { knowledgeModelId, definitions }, { organizationId: organization });
            await Promise.all(
                assetIds.map(assetId =>
                    executeActionClient(
                        'knowledge.replaceAssetSources',
                        { knowledgeModelId, assetType: 'definition', assetId, sourceIds, relationType },
                        { organizationId: organization },
                    ),
                ),
            );
            return saved;
        },
        onSuccess: saved => {
            setModel(saved);
            void queryClient.invalidateQueries({ queryKey: [...modelKey(knowledgeModelId), 'graph'] });
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.SaveDefinitions')),
    });
    const updateDefinition = useMutation({
        mutationFn: ({ definitionId, definition }: { definitionId: string; definition: Definition }) =>
            executeActionClient<KnowledgeModelView>('knowledge.updateDefinition', { knowledgeModelId, definitionId, definition }, { organizationId: organization }),
        onSuccess: setModel,
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.UpdateDefinition')),
    });
    const deleteModel = useMutation({
        mutationFn: () => executeActionClient('knowledge.delete', { knowledgeModelId }, { organizationId: organization, confirmationToken: 'knowledge.delete' }),
        onSuccess: () => router.push(`/${organization}/knowledge`),
    });
    const deleteQuery = useMutation({
        mutationFn: (id: string) => executeActionClient('knowledge.deleteVerifiedQuery', { knowledgeModelId, id }, { organizationId: organization }),
        onSuccess: () =>
            void Promise.all([
                queryClient.invalidateQueries({ queryKey: modelKey(knowledgeModelId) }),
                queryClient.invalidateQueries({ queryKey: [...modelKey(knowledgeModelId), 'verified-queries'] }),
                queryClient.invalidateQueries({ queryKey: [...modelKey(knowledgeModelId), 'graph'] }),
            ]),
    });
    if (modelQuery.isLoading) return <div className="p-8 text-sm text-muted-foreground">{t('LoadingModel')}</div>;
    if (!modelQuery.data) return <div className="p-8 text-sm text-destructive">{t('ModelNotFound')}</div>;
    const model = modelQuery.data;
    let verifiedDefinitionCount = 0;
    for (const definition of model.model.definitions) {
        if (definition.status === 'verified' && definition.kind !== 'relationship') verifiedDefinitionCount += 1;
    }
    const knowledgeSourceCount = sources.data?.sources.length ?? model.knowledgeSourceCount;
    return (
        <div className="bg-n8 h-screen overflow-auto">
            <main className="container mx-auto flex flex-col gap-6 px-12 pt-4 pb-12 lg:px-12 lg:pb-12 xl:px-8 xl:pb-8 2xl:px-4 2xl:pb-4">
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <Button asChild variant="ghost" size="sm" className="-ml-2">
                            <Link href={`/${organization}/knowledge`}>
                                <ArrowLeft className="h-4 w-4" />
                                {t('Title')}
                            </Link>
                        </Button>
                        <h1 className="mt-2 text-2xl font-bold">{model.name}</h1>
                        {model.description ? <p className="mt-1 text-muted-foreground">{model.description}</p> : null}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setAskAiOpen(true)}>
                            {t('AskAi')}
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="icon" aria-label={t('ModelActions')}>
                                    <MoreHorizontal />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => setEditingModel(model)}>{t('EditModel')}</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => setYamlEditorOpen(true)}>{t('ViewYaml')}</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => setImportOpen(true)}>{t('ImportYaml')}</DropdownMenuItem>
                                <DropdownMenuItem variant="destructive" onSelect={() => deleteModel.mutate()}>
                                    {t('DeleteModel')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList variant="line">
                        <TabsTrigger value="overview">{t('Overview')}</TabsTrigger>
                        <TabsTrigger value="definitions">{t('Definitions')}</TabsTrigger>
                        <TabsTrigger value="queries">{t('VerifiedQueries')}</TabsTrigger>
                        <TabsTrigger value="sources">{t('KnowledgeSources.Tab')}</TabsTrigger>
                    </TabsList>
                    <TabsContent value="overview" className="space-y-5 pt-4">
                        <Card className={model.readiness.status === 'ready' ? 'border-primary/30' : 'border-amber-500/30'}>
                            <CardContent className="flex flex-wrap items-start justify-between gap-5 py-5">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 text-lg font-semibold">
                                        {model.readiness.status === 'ready' ? <CheckCircle2 className="text-primary" /> : <CircleAlert className="text-amber-500" />}
                                        {model.readiness.status === 'ready' ? t('Readiness.Ready') : t('Readiness.NotReady')}
                                    </div>
                                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                                        {model.readiness.status === 'ready' ? t('Readiness.ReadyDescription') : t('Readiness.NotReadyDescription')}
                                    </p>
                                    {model.agentUnderstands.length ? (
                                        <div className="mt-4">
                                            <div className="text-xs font-medium uppercase text-muted-foreground">{t('Readiness.Understands')}</div>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {model.agentUnderstands.map(item => (
                                                    <Badge key={item.id} variant="secondary">
                                                        {item.name}
                                                    </Badge>
                                                ))}
                                                {verifiedDefinitionCount > model.agentUnderstands.length ? (
                                                    <Badge variant="outline">+{verifiedDefinitionCount - model.agentUnderstands.length}</Badge>
                                                ) : null}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                                <div className="grid min-w-64 gap-2 text-sm">
                                    <button type="button" className="flex items-center gap-2 text-left hover:text-foreground" onClick={() => setEditingModel(model)}>
                                        {model.readiness.requirements.dataSource ? (
                                            <CheckCircle2 className="size-4 text-primary" />
                                        ) : (
                                            <CircleAlert className="size-4 text-amber-500" />
                                        )}
                                        <span>{t('Readiness.Requirements.DataSources', { count: model.dataSources.length })}</span>
                                    </button>
                                    <button type="button" className="flex items-center gap-2 text-left hover:text-foreground" onClick={() => void setActiveTab('definitions')}>
                                        {model.readiness.requirements.verifiedDefinition ? (
                                            <CheckCircle2 className="size-4 text-primary" />
                                        ) : (
                                            <CircleAlert className="size-4 text-amber-500" />
                                        )}
                                        <span>{t('Readiness.Requirements.Definitions', { count: verifiedDefinitionCount })}</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="flex items-center gap-2 text-left text-muted-foreground hover:text-foreground"
                                        onClick={() => void setActiveTab('queries')}
                                    >
                                        <Circle className="size-4" />
                                        <span>{t('Readiness.Requirements.VerifiedQueries', { count: model.verifiedQueryCount })}</span>
                                        {!model.verifiedQueryCount ? <Badge variant="outline">{t('Readiness.Suggested')}</Badge> : null}
                                    </button>
                                </div>
                            </CardContent>
                        </Card>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            {[
                                [model.dataSources.length, t('ConnectedDataSources')],
                                [model.model.definitions.length, t('Definitions')],
                                [model.verifiedQueryCount, t('VerifiedQueries')],
                                [knowledgeSourceCount, t('KnowledgeSources.Tab')],
                            ].map(([value, label]) => (
                                <Card key={label}>
                                    <CardContent className="py-5">
                                        <div className="text-2xl font-semibold">{value}</div>
                                        <div className="text-sm text-muted-foreground">{label}</div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                        <Card>
                            <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
                                <div className="flex min-w-0 items-start gap-3">
                                    <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                                    <div>
                                        <h2 className="font-semibold">{t('QueryCoverage.Title')}</h2>
                                        <p className="mt-1 text-sm font-medium">
                                            {model.verifiedQueryCount ? t('QueryCoverage.CoveredTitle', { count: model.verifiedQueryCount }) : t('QueryCoverage.EmptyTitle')}
                                        </p>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                            {model.verifiedQueryCount ? t('QueryCoverage.CoveredDescription') : t('QueryCoverage.EmptyDescription')}
                                        </p>
                                    </div>
                                </div>
                                <Button variant="outline" onClick={() => void setActiveTab('queries')}>
                                    {model.verifiedQueryCount ? t('QueryCoverage.View') : t('QueryCoverage.Add')}
                                </Button>
                            </CardContent>
                        </Card>
                        <section className="rounded-lg border bg-card p-5">
                            <h2 className="text-base font-semibold">{t('KnowledgeFlow.Title')}</h2>
                            <p className="mt-1 text-sm text-muted-foreground">{t('KnowledgeFlow.Description')}</p>
                            <div className="mt-5 grid items-center gap-3 text-center lg:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
                                <div className="grid gap-2">
                                    {[
                                        [FileText, t('KnowledgeFlow.Sources'), t('KnowledgeFlow.SourceDescription')],
                                        [BrainCircuit, t('KnowledgeFlow.Definitions'), t('KnowledgeFlow.DefinitionDescription')],
                                        [FileCode2, t('KnowledgeFlow.Queries'), t('KnowledgeFlow.QueryDescription')],
                                    ].map(([Icon, label, description]) => (
                                        <div key={String(label)} className="rounded-md border bg-muted/20 p-3 text-left">
                                            <div className="flex items-center gap-2">
                                                <Icon className="size-5 text-muted-foreground" />
                                                <span className="text-sm font-medium">{String(label)}</span>
                                            </div>
                                            <p className="mt-1 pl-7 text-xs text-muted-foreground">{String(description)}</p>
                                        </div>
                                    ))}
                                </div>
                                <ArrowDown className="mx-auto size-4 text-muted-foreground lg:-rotate-90" />
                                <div className="rounded-md border border-primary/20 bg-primary/5 p-4">
                                    <BrainCircuit className="mx-auto size-5 text-primary" />
                                    <div className="mt-2 text-sm font-medium">{t('KnowledgeFlow.AgentContext')}</div>
                                </div>
                                <ArrowDown className="mx-auto size-4 text-muted-foreground lg:-rotate-90" />
                                <div className="rounded-md border bg-muted/20 p-4">
                                    <Sparkles className="mx-auto size-5 text-muted-foreground" />
                                    <div className="mt-2 text-sm font-medium">{t('KnowledgeFlow.AskAi')}</div>
                                </div>
                                <ArrowDown className="mx-auto size-4 text-muted-foreground lg:-rotate-90" />
                                <div className="rounded-md border bg-muted/20 p-4">
                                    <Bot className="mx-auto size-5 text-muted-foreground" />
                                    <div className="mt-2 text-sm font-medium">{t('KnowledgeFlow.AgentRun')}</div>
                                </div>
                            </div>
                        </section>
                        <section className="space-y-3 pt-1">
                            <h2 className="text-base font-semibold">{t('BusinessContext')}</h2>
                            <Textarea
                                className="min-h-64 font-mono"
                                value={markdown}
                                onChange={event => setMarkdown(event.target.value)}
                                placeholder={t('BusinessContextPlaceholder')}
                            />
                            <Button onClick={() => update.mutate({ businessContextMd: markdown })}>{update.isPending ? t('Saving') : t('SaveContext')}</Button>
                        </section>
                    </TabsContent>
                    <TabsContent value="definitions" className="pt-4">
                        <DefinitionPanel
                            organization={organization}
                            model={model}
                            queries={queries.data?.queries ?? []}
                            graph={graph.data ?? { queryDefinitionEdges: [], sourceAssetEdges: [] }}
                            sources={sources.data?.sources ?? []}
                            onSave={definitions => saveDefinitions.mutate(definitions)}
                            onUpdate={async (definitionId, definition) => {
                                await updateDefinition.mutateAsync({ definitionId, definition });
                            }}
                            onImport={() => setImportOpen(true)}
                            onAskAi={() => setAskAiOpen(true)}
                        />
                    </TabsContent>
                    <TabsContent value="queries" className="space-y-3 pt-4">
                        {queries.data?.queries.length ? (
                            <div className="overflow-x-auto rounded-md border">
                                <table className="w-full min-w-[720px] text-sm">
                                    <thead className="bg-muted/50 text-left text-muted-foreground">
                                        <tr>
                                            <th className="p-3 font-medium">{t('VerifiedQueryDetails.Columns.Query')}</th>
                                            <th className="p-3 font-medium">{t('VerifiedQueryDetails.Columns.Question')}</th>
                                            <th className="p-3 font-medium">{t('VerifiedQueryDetails.Columns.Updated')}</th>
                                            <th className="w-12" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {queries.data.queries.map(item => {
                                            const expanded = selectedQueryId === item.id;
                                            const panelId = `verified-query-details-${item.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

                                            return (
                                                <Fragment key={item.id}>
                                                    <tr className={expanded ? 'border-t bg-muted/20' : 'border-t hover:bg-muted/30'}>
                                                        <td className="p-0 font-medium">
                                                            <button
                                                                type="button"
                                                                className="flex w-full items-center gap-2 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                                                aria-expanded={expanded}
                                                                aria-controls={panelId}
                                                                aria-label={item.title}
                                                                onClick={() => void setSelectedQueryId(expanded ? null : item.id)}
                                                            >
                                                                <ChevronRight
                                                                    className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`}
                                                                    aria-hidden="true"
                                                                />
                                                                <span className="truncate">{item.title}</span>
                                                            </button>
                                                        </td>
                                                        <td className="max-w-sm p-3 text-muted-foreground">
                                                            <span className="block truncate">{item.question}</span>
                                                        </td>
                                                        <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">
                                                            <span className="flex items-center gap-1.5">
                                                                <UserRound className="size-3.5" />
                                                                {t('VerifiedQueryDetails.UpdatedByTime', {
                                                                    user: item.updatedByName ?? t('VerifiedQueryDetails.UnknownUser'),
                                                                    time: relativeTime(item.updatedAt),
                                                                })}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon-sm"
                                                                aria-label={t('DeleteNamedQuery', { name: item.title })}
                                                                onClick={() => deleteQuery.mutate(item.id)}
                                                            >
                                                                <Trash2 />
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                    {expanded ? (
                                                        <tr className="border-t bg-muted/10">
                                                            <td colSpan={4} className="p-0">
                                                                <div id={panelId} className="p-5">
                                                                    <pre className="max-h-48 overflow-auto rounded-md bg-muted px-3 py-2.5 font-mono text-xs leading-5">
                                                                        {item.sql}
                                                                    </pre>
                                                                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                                                                        <section className="rounded-lg border bg-background/60 p-4">
                                                                            <h3 className="text-sm font-semibold">{t('VerifiedQueryDetails.ReferencedDefinitions')}</h3>
                                                                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                                                                {t('VerifiedQueryDetails.DefinitionsDescription')}
                                                                            </p>
                                                                            <div className="mt-3">
                                                                                <DefinitionReferenceEditor
                                                                                    organization={organization}
                                                                                    knowledgeModelId={knowledgeModelId}
                                                                                    query={item}
                                                                                    definitions={model.model.definitions}
                                                                                    graph={graph.data ?? { queryDefinitionEdges: [], sourceAssetEdges: [] }}
                                                                                />
                                                                            </div>
                                                                        </section>
                                                                        <section className="rounded-lg border bg-background/60 p-4">
                                                                            <h3 className="text-sm font-semibold">{t('VerifiedQueryDetails.RelatedSources')}</h3>
                                                                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                                                                {t('VerifiedQueryDetails.SourcesDescription')}
                                                                            </p>
                                                                            <div className="mt-3">
                                                                                <AssetSourceEditor
                                                                                    organization={organization}
                                                                                    knowledgeModelId={knowledgeModelId}
                                                                                    assetType="verified_query"
                                                                                    assetId={item.id}
                                                                                    sources={sources.data?.sources ?? []}
                                                                                    graph={graph.data ?? { queryDefinitionEdges: [], sourceAssetEdges: [] }}
                                                                                />
                                                                            </div>
                                                                        </section>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ) : null}
                                                </Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <Card className="border-dashed">
                                <CardContent className="py-12 text-center text-sm text-muted-foreground">{t('VerifiedQueriesEmpty')}</CardContent>
                            </Card>
                        )}
                    </TabsContent>
                    <TabsContent value="sources" className="pt-4">
                        <KnowledgeSourcesPanel
                            organization={organization}
                            knowledgeModelId={knowledgeModelId}
                            dataSources={model.dataSources}
                            definitions={model.model.definitions}
                            queries={queries.data?.queries ?? []}
                            graph={graph.data ?? { queryDefinitionEdges: [], sourceAssetEdges: [] }}
                            onImportDefinitions={async (definitions, importedIds, sourceId) => {
                                await saveDefinitionsWithSources.mutateAsync({ definitions, assetIds: importedIds, sourceIds: [sourceId], relationType: 'provided' });
                            }}
                        />
                    </TabsContent>
                </Tabs>
                <AskAiDialog
                    open={askAiOpen}
                    onOpenChange={setAskAiOpen}
                    model={model}
                    organization={organization}
                    onAccept={(definitions, generatedIds, sourceIds) =>
                        saveDefinitionsWithSources.mutate({ definitions, assetIds: generatedIds, sourceIds, relationType: 'generated' })
                    }
                />
                <ImportYamlDialog open={importOpen} onOpenChange={setImportOpen} model={model} onImported={setModel} />
                <YamlEditorDialog open={yamlEditorOpen} onOpenChange={setYamlEditorOpen} model={model} onSaved={setModel} />
                <EditKnowledgeModelDialog
                    model={editingModel}
                    organization={organization}
                    connections={connections.data?.connections ?? []}
                    onOpenChange={open => !open && setEditingModel(null)}
                    onUpdated={updated => {
                        setModel(updated);
                        void queryClient.invalidateQueries({ queryKey: ['knowledge-models', organization] });
                    }}
                />
            </main>
        </div>
    );
}

export function KnowledgePage() {
    const params = useParams<{ organization: string; knowledgeModelId?: string }>();
    return params.knowledgeModelId ? (
        <KnowledgeModelDetail organization={params.organization} knowledgeModelId={params.knowledgeModelId} />
    ) : (
        <KnowledgeModelList organization={params.organization} />
    );
}

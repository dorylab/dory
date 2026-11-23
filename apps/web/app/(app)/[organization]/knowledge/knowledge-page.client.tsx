'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
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
import { Checkbox } from '@/registry/new-york-v4/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/registry/new-york-v4/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { navigationKey, type NavigationIndex } from './knowledge-navigation';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import type { ConnectionListItem } from '@dory/shared/types/connections';
import { OSSIE_DIALECTS, OSSIE_VERSION, type OssieDataType, type OssieDialect, type OssieVersion } from '@dory/shared/types/ossie';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconFileTypeSql } from '@tabler/icons-react';
import { ArrowLeft, CheckCircle2, ChevronRight, ExternalLink, FileCode2, FileText, MoreHorizontal, Pencil, Plus, Sparkles, Trash2, Upload, UserRound, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import { DataTablePagination } from '@/components/@dory/ui/data-table-pagination';

import { useOrganizationId } from '../components/organization-context';
import { KnowledgeDataSourceAvatars } from './knowledge-data-source-avatars';
import { KnowledgeDocumentsPanel } from './knowledge-documents-panel';
import { BusinessRulesPanel, KnowledgeEvidenceWarning, MetricRulesPanel } from './knowledge-extraction-panel';
import { useKnowledgeListPagination } from './knowledge-list-pagination';
import { knowledgeSourceDisplayName } from './knowledge-source-display';
import { KnowledgeSourcesPanel } from './knowledge-connections-panel';
import type { KnowledgeSourceSummary } from './knowledge-sources-panel';

type Definition = {
    id: string;
    name: string;
    kind: 'entity' | 'metric' | 'measure' | 'dimension' | 'relationship';
    status: 'verified' | 'unverified' | 'auto_published';
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
    fromColumns?: string[];
    toColumns?: string[];
    dialect?: OssieDialect;
    datatype?: OssieDataType;
    aiContext?: string | { instructions?: string; synonyms?: string[]; examples?: string[]; specificConditions?: string[] };
};
type ModelDataSource = { connectionId: string; name: string; type: string; engine: string };
export type KnowledgeModelView = {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    businessContextMd: string;
    modelYaml: string;
    ossieVersion: OssieVersion;
    modelRevision: string;
    ossieDocument: Record<string, unknown> & { ai_context?: Definition['aiContext'] };
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
type KnowledgeGraph = {
    queryDefinitionEdges: Array<{ queryId: string; definitionId: string }>;
    sourceAssetEdges: Array<{
        sourceId: string;
        assetType: 'definition' | 'verified_query' | 'business_rule';
        assetId: string;
        relationType: 'provided' | 'generated';
    }>;
};

function AssetSourceEditor({
    organization,
    knowledgeModelId,
    assetType,
    canWrite = true,
    assetId,
    sources,
    graph,
}: {
    organization: string;
    knowledgeModelId: string;
    assetType: 'definition' | 'verified_query';
    canWrite?: boolean;
    assetId: string;
    sources: KnowledgeSourceSummary[];
    graph: KnowledgeGraph;
}) {
    const t = useTranslations('Knowledge');
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState(false);
    const [draftSourceIds, setDraftSourceIds] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const relationBySourceId = new Map(
        graph.sourceAssetEdges.filter(edge => edge.assetType === assetType && edge.assetId === assetId).map(edge => [edge.sourceId, edge.relationType] as const),
    );
    const selectedSourceIds = [...relationBySourceId.keys()];
    const linkedSources = sources.filter(source => relationBySourceId.has(source.id));
    const rulesAlias = t('Documents.RulesSearchAlias').toLocaleLowerCase();
    const needle = search.trim().toLocaleLowerCase();
    const matchingSources = sources.filter(
        source =>
            knowledgeSourceDisplayName(source).toLocaleLowerCase().includes(needle) ||
            source.fileName.toLocaleLowerCase().includes(needle) ||
            (source.systemRole === 'analysis_rules' && rulesAlias.includes(needle)),
    );
    const changed = draftSourceIds.length !== selectedSourceIds.length || draftSourceIds.some(id => !relationBySourceId.has(id));
    const update = useMutation({
        mutationFn: (sourceIds: string[]) =>
            executeActionClient('knowledge.replaceAssetSources', { knowledgeModelId, assetType, assetId, sourceIds, relationType: 'provided' }, { organizationId: organization }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: [...modelKey(knowledgeModelId), 'graph'] });
            setEditing(false);
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.UpdateReferences')),
    });
    const openEditor = () => {
        setDraftSourceIds(selectedSourceIds);
        setSearch('');
        setEditing(true);
    };
    return (
        <section className="min-w-0 rounded-lg border bg-background/60 p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div>
                        <h3 className="text-sm font-semibold">{t(assetType === 'definition' ? 'DefinitionSources.Title' : 'VerifiedQueryDetails.RelatedSources')}</h3>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {t(assetType === 'definition' ? 'DefinitionSources.Description' : 'VerifiedQueryDetails.SourcesDescription')}
                        </p>
                    </div>
                </div>
                <Button disabled={!canWrite} size="sm" variant="outline" aria-label={t('DefinitionSources.EditAction')} onClick={openEditor}>
                    {t('EditDefinitionAction')}
                </Button>
            </div>
            {linkedSources.length ? (
                <div className="mt-3 max-h-48 divide-y overflow-y-auto rounded-md border">
                    {linkedSources.map(source => {
                        const name = knowledgeSourceDisplayName(source);
                        return (
                            <div key={source.id} className="flex min-h-10 items-center gap-3 px-3 py-2">
                                <Link
                                    className="min-w-0 flex-1 truncate text-sm hover:underline"
                                    href={
                                        source.format === 'markdown'
                                            ? `?tab=documents&file=${encodeURIComponent(source.id)}`
                                            : `?tab=sources&source=${encodeURIComponent(source.id)}`
                                    }
                                >
                                    {name}
                                </Link>
                                <Badge variant="outline">{t(`RelationTypes.${relationBySourceId.get(source.id)}`)}</Badge>
                                <Button variant="ghost" size="icon-sm" asChild>
                                    <Link
                                        href={
                                            source.format === 'markdown'
                                                ? `?tab=documents&file=${encodeURIComponent(source.id)}`
                                                : `?tab=sources&source=${encodeURIComponent(source.id)}`
                                        }
                                        aria-label={t('DefinitionSources.OpenNamed', { name })}
                                        title={t('DefinitionSources.OpenNamed', { name })}
                                    >
                                        <ExternalLink />
                                    </Link>
                                </Button>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p className="mt-3 rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground">{t('DefinitionSources.EmptyTitle')}</p>
            )}
            <Dialog
                open={editing}
                onOpenChange={open => {
                    if (!update.isPending) setEditing(open);
                }}
            >
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>{t('DefinitionSources.EditAction')}</DialogTitle>
                        <DialogDescription>{t('DefinitionSources.EditDescription')}</DialogDescription>
                    </DialogHeader>
                    {sources.length ? (
                        <>
                            <Input
                                aria-label={t('DefinitionSources.Search')}
                                placeholder={t('DefinitionSources.Search')}
                                value={search}
                                onChange={event => setSearch(event.target.value)}
                            />
                            <div className="max-h-72 divide-y overflow-y-auto rounded-md border">
                                {matchingSources.length ? (
                                    matchingSources.map(source => {
                                        const name = knowledgeSourceDisplayName(source);
                                        return (
                                            <label key={source.id} className="flex min-h-10 cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                                                <Checkbox
                                                    checked={draftSourceIds.includes(source.id)}
                                                    disabled={update.isPending}
                                                    onCheckedChange={checked => setDraftSourceIds(ids => (checked ? [...ids, source.id] : ids.filter(id => id !== source.id)))}
                                                />
                                                <span className="min-w-0 flex-1 break-words">{name}</span>
                                            </label>
                                        );
                                    })
                                ) : (
                                    <p className="p-3 text-sm text-muted-foreground">{t('DefinitionSources.NoMatches')}</p>
                                )}
                            </div>
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground">{t('VerifiedQueryDetails.NoKnowledgeSources')}</p>
                    )}
                    <DialogFooter>
                        <Button variant="outline" disabled={update.isPending} onClick={() => setEditing(false)}>
                            {t('Cancel')}
                        </Button>
                        <Button disabled={!changed || update.isPending} onClick={() => update.mutate(draftSourceIds)}>
                            {t('SaveChanges')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </section>
    );
}

function DefinitionReferenceEditor({
    canWrite,
    organization,
    knowledgeModelId,
    query,
    definitions,
    graph,
}: {
    organization: string;
    knowledgeModelId: string;
    query: VerifiedQuery;
    canWrite: boolean;
    definitions: Definition[];
    graph: KnowledgeGraph;
}) {
    const t = useTranslations('Knowledge');
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const sourceIds = graph.sourceAssetEdges.filter(edge => edge.assetType === 'verified_query' && edge.assetId === query.id).map(edge => edge.sourceId);
    const linkedDefinitions = definitions.filter(definition => query.definitionIds.includes(definition.id));
    const matchingDefinitions = definitions.filter(definition => definition.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
    const changed = selectedIds.length !== query.definitionIds.length || selectedIds.some(id => !query.definitionIds.includes(id));
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
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: [...modelKey(knowledgeModelId), 'verified-queries'] }),
                queryClient.invalidateQueries({ queryKey: [...modelKey(knowledgeModelId), 'graph'] }),
            ]);
            setEditing(false);
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.UpdateReferences')),
    });
    return (
        <section className="min-w-0 rounded-lg border bg-background/60 p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-semibold">{t('VerifiedQueryDetails.ReferencedDefinitions')}</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('VerifiedQueryDetails.DefinitionsDescription')}</p>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    disabled={!canWrite}
                    aria-label={t('VerifiedQueryDetails.EditDefinitions')}
                    onClick={() => {
                        setSelectedIds(query.definitionIds);
                        setSearch('');
                        setEditing(true);
                    }}
                >
                    {t('EditDefinitionAction')}
                </Button>
            </div>
            {linkedDefinitions.length ? (
                <div className="mt-3 max-h-48 divide-y overflow-y-auto rounded-md border">
                    {linkedDefinitions.map(definition => (
                        <div key={definition.id} className="flex min-h-10 items-center px-3 py-2 text-sm">
                            <Link className="min-w-0 truncate hover:underline" href={`?tab=definitions&definition=${encodeURIComponent(definition.id)}`}>
                                {definition.name}
                            </Link>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="mt-3 rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground">{t('VerifiedQueryDetails.NoLinkedDefinitions')}</p>
            )}
            <Dialog
                open={editing}
                onOpenChange={open => {
                    if (!update.isPending) setEditing(open);
                }}
            >
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>{t('VerifiedQueryDetails.EditDefinitions')}</DialogTitle>
                        <DialogDescription>{t('VerifiedQueryDetails.EditDefinitionsDescription')}</DialogDescription>
                    </DialogHeader>
                    {definitions.length ? (
                        <>
                            <Input
                                aria-label={t('VerifiedQueryDetails.SearchDefinitions')}
                                placeholder={t('VerifiedQueryDetails.SearchDefinitions')}
                                value={search}
                                onChange={event => setSearch(event.target.value)}
                            />
                            <div className="max-h-72 divide-y overflow-y-auto rounded-md border">
                                {matchingDefinitions.length ? (
                                    matchingDefinitions.map(definition => (
                                        <label key={definition.id} className="flex min-h-10 cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                                            <Checkbox
                                                checked={selectedIds.includes(definition.id)}
                                                disabled={update.isPending}
                                                onCheckedChange={checked => setSelectedIds(ids => (checked ? [...ids, definition.id] : ids.filter(id => id !== definition.id)))}
                                            />
                                            <span className="min-w-0 break-words">{definition.name}</span>
                                        </label>
                                    ))
                                ) : (
                                    <p className="p-3 text-sm text-muted-foreground">{t('VerifiedQueryDetails.NoMatchingDefinitions')}</p>
                                )}
                            </div>
                        </>
                    ) : (
                        <p className="text-sm text-muted-foreground">{t('VerifiedQueryDetails.NoDefinitions')}</p>
                    )}
                    <DialogFooter>
                        <Button variant="outline" disabled={update.isPending} onClick={() => setEditing(false)}>
                            {t('Cancel')}
                        </Button>
                        <Button disabled={!changed || update.isPending} onClick={() => update.mutate(selectedIds)}>
                            {t('SaveChanges')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </section>
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
    controlledOpen,
    onOpenChange,
    onCreated,
}: {
    connections: ConnectionListItem[];
    trigger?: React.ReactNode;
    initialConnectionId?: string;
    controlledOpen?: boolean;
    onOpenChange?: (value: boolean) => void;
    onCreated?: (model: KnowledgeModelView) => void;
}) {
    const t = useTranslations('Knowledge');
    const [ownOpen, setOwnOpen] = useState(false);
    const open = controlledOpen ?? ownOpen;
    const setOpen = onOpenChange ?? setOwnOpen;
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
            {controlledOpen === undefined && (
                <DialogTrigger asChild>
                    {trigger ?? (
                        <Button>
                            <Plus />
                            {t('NewModel')}
                        </Button>
                    )}
                </DialogTrigger>
            )}
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

function DeleteKnowledgeModelDialog({
    modelName,
    isPending,
    onCancel,
    onConfirm,
    onCloseAutoFocus,
}: {
    modelName: string | null;
    isPending: boolean;
    onCancel: () => void;
    onConfirm: () => void;
    onCloseAutoFocus?: (event: Event) => void;
}) {
    const t = useTranslations('Knowledge');

    return (
        <AlertDialog open={modelName !== null} onOpenChange={open => !open && !isPending && onCancel()}>
            <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t('DeleteModelTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('DeleteModelDescription', { name: modelName ?? '' })}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isPending}>{t('Cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={event => {
                            event.preventDefault();
                            onConfirm();
                        }}
                        disabled={isPending}
                    >
                        {isPending ? t('Deleting') : t('DeleteModel')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function KnowledgeLanding({ organizationSlug, navigation }: { organizationSlug: string; navigation: NavigationIndex }) {
    const t = useTranslations('Knowledge');
    const organization = useOrganizationId();
    const router = useRouter();
    const client = useQueryClient();
    const models = navigation.models;
    useEffect(() => {
        if (!models.length) return;
        const last = localStorage.getItem('knowledge.last.' + organization + '.' + navigation.userId);
        const selected = models.find(model => model.id === last) ?? models[0]!;
        router.replace('/' + organizationSlug + '/knowledge/' + selected.id);
    }, [models, organization, organizationSlug, router, navigation.userId]);
    const connections = useQuery({
        queryKey: ['connections', organization],
        enabled: !models.length && navigation.canWrite,
        queryFn: () => executeActionClient<{ connections: ConnectionListItem[] }>('connection.list', {}, { organizationId: organization }),
    });
    if (models.length) return <p className="p-6 text-sm text-muted-foreground">{t('LoadingModel')}</p>;
    return (
        <main className="flex h-full min-h-72 flex-col md:flex-row">
            <aside className="border-b p-3 md:w-72 md:border-e">
                <div className="flex items-center justify-between">
                    <h1 className="font-semibold">{t('Title')}</h1>
                    {navigation.canWrite && (
                        <CreateKnowledgeModelDialog
                            connections={connections.data?.connections ?? []}
                            trigger={
                                <Button size="icon-sm" variant="ghost" aria-label={t('NewModel')}>
                                    <Plus />
                                </Button>
                            }
                            onCreated={model => {
                                void client.invalidateQueries({ queryKey: ['knowledge-models', organization] });
                                router.push('/' + organizationSlug + '/knowledge/' + model.id);
                            }}
                        />
                    )}
                </div>
            </aside>
            <section className="flex flex-1 items-center justify-center text-muted-foreground">{t('EmptyTitle')}</section>
        </main>
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
        [t('Extraction.SpecificConditions'), typeof definition.aiContext === 'object' ? definition.aiContext?.specificConditions?.join('\n') : undefined],
        [t('DefinitionFields.TimeDimension'), definition.timeDimension],
        [t('DefinitionFields.AvailableDimensions'), definition.dimensions?.join(', ')],
        [t('FromDefinition'), definition.from],
        [t('ToDefinition'), definition.to],
        [t('DefinitionFields.FromColumns'), definition.fromColumns?.join(', ')],
        [t('DefinitionFields.ToColumns'), definition.toColumns?.join(', ')],
        [t('DefinitionFields.Dialect'), definition.dialect],
        [
            t('DefinitionFields.AiContext'),
            typeof definition.aiContext === 'string'
                ? definition.aiContext
                : [definition.aiContext?.instructions, definition.aiContext?.synonyms?.join(', '), definition.aiContext?.examples?.join('\n')].filter(Boolean).join('\n'),
        ],
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
                                {definition.status === 'auto_published' ? (
                                    <Badge variant="outline">{t('Extraction.AutomaticPublished')}</Badge>
                                ) : definition.status === 'verified' ? (
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
                                    <dt className="text-sm font-medium text-muted-foreground">
                                        {t(definition.kind === 'metric' ? 'Extraction.SpecificConditions' : 'DefinitionFields.Description')}
                                    </dt>
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

                    {definition.kind === 'metric' ? <MetricRulesPanel organization={organization} knowledgeModelId={knowledgeModelId} metricId={definition.id} /> : null}
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

                        <AssetSourceEditor
                            organization={organization}
                            knowledgeModelId={knowledgeModelId}
                            assetType="definition"
                            assetId={definition.id}
                            sources={sources}
                            graph={graph}
                        />
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
    const [fromColumns, setFromColumns] = useState('');
    const [toColumns, setToColumns] = useState('');
    const [dialect, setDialect] = useState<NonNullable<Definition['dialect']>>('ANSI_SQL');
    const [aiInstructions, setAiInstructions] = useState('');
    const [aiSynonyms, setAiSynonyms] = useState('');
    const [aiExamples, setAiExamples] = useState('');
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
        setFromColumns(definition.fromColumns?.join(', ') ?? '');
        setToColumns(definition.toColumns?.join(', ') ?? '');
        setDialect(definition.dialect ?? 'ANSI_SQL');
        setAiInstructions(typeof definition.aiContext === 'string' ? definition.aiContext : (definition.aiContext?.instructions ?? ''));
        setAiSynonyms(typeof definition.aiContext === 'string' ? '' : (definition.aiContext?.synonyms?.join(', ') ?? ''));
        setAiExamples(typeof definition.aiContext === 'string' ? '' : (definition.aiContext?.examples?.join('\n') ?? ''));
        setStatus(definition.status === 'auto_published' ? 'verified' : definition.status);
    }, [definition]);

    const relationshipOptions = model.model.definitions.filter(item => item.sourceConnectionId === sourceConnectionId && item.kind === 'entity');
    const kind = definition?.kind ?? 'metric';
    const save = async () => {
        if (!definition || !name.trim() || !sourceConnectionId || (kind === 'relationship' && (!from || !to || !fromColumns.trim() || !toColumns.trim()))) return;
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
                fromColumns:
                    kind === 'relationship'
                        ? fromColumns
                              .split(',')
                              .map(value => value.trim())
                              .filter(Boolean)
                        : undefined,
                toColumns:
                    kind === 'relationship'
                        ? toColumns
                              .split(',')
                              .map(value => value.trim())
                              .filter(Boolean)
                        : undefined,
                dialect: kind === 'relationship' || kind === 'entity' ? undefined : dialect,
                aiContext: {
                    instructions: aiInstructions.trim() || undefined,
                    synonyms: aiSynonyms
                        .split(',')
                        .map(value => value.trim())
                        .filter(Boolean),
                    examples: aiExamples
                        .split('\n')
                        .map(value => value.trim())
                        .filter(Boolean),
                },
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
                                            <SelectItem key={item.id} value={item.name}>
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
                                            <SelectItem key={item.id} value={item.name}>
                                                {item.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <Input value={fromColumns} onChange={event => setFromColumns(event.target.value)} placeholder="customer_id, tenant_id" />
                            <Input value={toColumns} onChange={event => setToColumns(event.target.value)} placeholder="id, tenant_id" />
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
                            <Select value={dialect} onValueChange={value => setDialect(value as NonNullable<Definition['dialect']>)}>
                                <SelectTrigger className="w-full" aria-label={t('DefinitionFields.Dialect')}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {OSSIE_DIALECTS.map(value => (
                                        <SelectItem key={value} value={value}>
                                            {value}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </>
                    )}
                    <Textarea
                        aria-label={t('DefinitionFields.Description')}
                        value={description}
                        onChange={event => setDescription(event.target.value)}
                        placeholder={t('BusinessDefinitionPlaceholder')}
                    />
                    <Textarea value={aiInstructions} onChange={event => setAiInstructions(event.target.value)} placeholder={t('DefinitionFields.AiInstructions')} />
                    <Input value={aiSynonyms} onChange={event => setAiSynonyms(event.target.value)} placeholder={t('DefinitionFields.AiSynonyms')} />
                    <Textarea value={aiExamples} onChange={event => setAiExamples(event.target.value)} placeholder={t('DefinitionFields.AiExamples')} />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                        {t('Cancel')}
                    </Button>
                    <Button onClick={save} disabled={!name.trim() || !sourceConnectionId || (kind === 'relationship' && (!from || !to || !fromColumns || !toColumns)) || isSaving}>
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
    const pagination = useKnowledgeListPagination('definitions', model.model.definitions.length, {
        id: selectedDefinitionId,
        index: model.model.definitions.findIndex(definition => definition.id === selectedDefinitionId),
    });
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
    const [fromColumns, setFromColumns] = useState('');
    const [toColumns, setToColumns] = useState('');
    const [dialect, setDialect] = useState<NonNullable<Definition['dialect']>>('ANSI_SQL');
    const [aiInstructions, setAiInstructions] = useState('');
    const [aiSynonyms, setAiSynonyms] = useState('');
    const [aiExamples, setAiExamples] = useState('');
    const create = () => {
        if (!name.trim() || !sourceConnectionId || (kind === 'relationship' && (!from || !to || !fromColumns.trim() || !toColumns.trim()))) return;
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
                fromColumns:
                    kind === 'relationship'
                        ? fromColumns
                              .split(',')
                              .map(value => value.trim())
                              .filter(Boolean)
                        : undefined,
                toColumns:
                    kind === 'relationship'
                        ? toColumns
                              .split(',')
                              .map(value => value.trim())
                              .filter(Boolean)
                        : undefined,
                dialect: kind === 'relationship' || kind === 'entity' ? undefined : dialect,
                aiContext: {
                    instructions: aiInstructions.trim() || undefined,
                    synonyms: aiSynonyms
                        .split(',')
                        .map(value => value.trim())
                        .filter(Boolean),
                    examples: aiExamples
                        .split('\n')
                        .map(value => value.trim())
                        .filter(Boolean),
                },
            },
        ]);
        setOpen(false);
        setName('');
        setSource('');
        setExpression('');
        setDescription('');
        setFrom('');
        setTo('');
        setFromColumns('');
        setToColumns('');
        setDialect('ANSI_SQL');
        setAiInstructions('');
        setAiSynonyms('');
        setAiExamples('');
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
                        {model.model.definitions.slice(pagination.pageIndex * pagination.pageSize, (pagination.pageIndex + 1) * pagination.pageSize).map(definition => {
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
                                                <KnowledgeEvidenceWarning organization={organization} knowledgeModelId={model.id} assetId={definition.id} />
                                            </button>
                                        </td>
                                        <td className="p-3">{t(`Kinds.${definition.kind}`)}</td>
                                        <td className="p-3">{definition.source || sourceName(definition.sourceConnectionId)}</td>
                                        <td className="p-3">
                                            {definition.status === 'auto_published' ? (
                                                <Badge variant="outline">{t('Extraction.AutomaticPublished')}</Badge>
                                            ) : definition.status === 'verified' ? (
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
                {model.model.definitions.length ? (
                    <DataTablePagination
                        total={model.model.definitions.length}
                        {...pagination}
                        onPageChange={index => {
                            void setSelectedDefinitionId(null);
                            pagination.onPageChange(index);
                        }}
                        onPageSizeChange={size => {
                            void setSelectedDefinitionId(null);
                            pagination.onPageSizeChange(size);
                        }}
                    />
                ) : null}
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
                                            .filter(item => item.sourceConnectionId === sourceConnectionId && item.kind === 'entity')
                                            .map(item => (
                                                <SelectItem key={item.id} value={item.name}>
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
                                            .filter(item => item.sourceConnectionId === sourceConnectionId && item.kind === 'entity')
                                            .map(item => (
                                                <SelectItem key={item.id} value={item.name}>
                                                    {item.name}
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                                <Input value={fromColumns} onChange={event => setFromColumns(event.target.value)} placeholder={t('DefinitionFields.FromColumns')} />
                                <Input value={toColumns} onChange={event => setToColumns(event.target.value)} placeholder={t('DefinitionFields.ToColumns')} />
                            </div>
                        ) : (
                            <>
                                <Input value={source} onChange={event => setSource(event.target.value)} placeholder={t('SourceTablePlaceholder')} />
                                <Input value={expression} onChange={event => setExpression(event.target.value)} placeholder={t('CalculationPlaceholder')} />
                                <Select value={dialect} onValueChange={value => setDialect(value as NonNullable<Definition['dialect']>)}>
                                    <SelectTrigger className="w-full" aria-label={t('DefinitionFields.Dialect')}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {OSSIE_DIALECTS.map(value => (
                                            <SelectItem key={value} value={value}>
                                                {value}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </>
                        )}
                        <Textarea value={description} onChange={event => setDescription(event.target.value)} placeholder={t('BusinessDefinitionPlaceholder')} />
                        <Textarea value={aiInstructions} onChange={event => setAiInstructions(event.target.value)} placeholder={t('DefinitionFields.AiInstructions')} />
                        <Input value={aiSynonyms} onChange={event => setAiSynonyms(event.target.value)} placeholder={t('DefinitionFields.AiSynonyms')} />
                        <Textarea value={aiExamples} onChange={event => setAiExamples(event.target.value)} placeholder={t('DefinitionFields.AiExamples')} />
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
                                {knowledgeSourceDisplayName(source)}
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
                        <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
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
                    <DialogTitle>{t('ImportYamlTitle', { version: OSSIE_VERSION })}</DialogTitle>
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
                    <DialogTitle>{t('ModelYaml', { version: OSSIE_VERSION })}</DialogTitle>
                    <DialogDescription>{t('ModelYamlDescription', { version: OSSIE_VERSION })}</DialogDescription>
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

function KnowledgeModelDetail({ organizationSlug, knowledgeModelId, navigation }: { organizationSlug: string; knowledgeModelId: string; navigation: NavigationIndex }) {
    const organization = useOrganizationId();
    const t = useTranslations('Knowledge');
    const common = useTranslations('Common');
    const router = useRouter();
    const queryClient = useQueryClient();
    const modelActionsRef = useRef<HTMLButtonElement>(null);
    const [yamlEditorOpen, setYamlEditorOpen] = useState(false);
    const [askAiOpen, setAskAiOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    useEffect(() => {
        if (navigation.models.some(m => m.id === knowledgeModelId)) localStorage.setItem('knowledge.last.' + organization + '.' + navigation.userId, knowledgeModelId);
    }, [navigation.models, organization, knowledgeModelId, navigation.userId]);
    const [importOpen, setImportOpen] = useState(false);
    const [editingModel, setEditingModel] = useState<KnowledgeModelView | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [activeTab, setActiveTab] = useQueryState('tab', parseAsString.withDefault('documents'));
    const sourceDetail = activeTab === 'definitions' || activeTab === 'rules';
    let section = 'documents';
    if (sourceDetail || activeTab === 'sources') section = 'sources';
    if (activeTab === 'queries') section = 'queries';
    const [selectedQueryId, setSelectedQueryId] = useQueryState('query', parseAsString.withOptions({ history: 'push' }));
    const modelQuery = useQuery({
        queryKey: modelKey(knowledgeModelId),
        queryFn: () => executeActionClient<KnowledgeModelView>('knowledge.get', { knowledgeModelId }, { organizationId: organization }),
    });
    const needsReferenceData = ['queries', 'definitions'].includes(activeTab);
    const queries = useQuery({
        enabled: needsReferenceData,
        queryKey: [...modelKey(knowledgeModelId), 'verified-queries'],
        queryFn: () => executeActionClient<{ queries: VerifiedQuery[] }>('knowledge.listVerifiedQueries', { knowledgeModelId }, { organizationId: organization }),
    });
    const [search, setSearch] = useQueryState('querySearch', parseAsString.withDefault(''));
    const needle = search.trim().toLocaleLowerCase();
    const filteredQueries = queries.data?.queries.filter(item => !needle || [item.question, item.title].some(text => text.toLocaleLowerCase().includes(needle)));
    const queryPagination = useKnowledgeListPagination('queries', filteredQueries?.length, {
        id: selectedQueryId,
        index: filteredQueries?.findIndex(query => query.id === selectedQueryId) ?? -1,
    });
    const graph = useQuery({
        enabled: needsReferenceData,
        queryKey: [...modelKey(knowledgeModelId), 'graph'],
        queryFn: () => executeActionClient<KnowledgeGraph>('knowledge.getGraph', { knowledgeModelId }, { organizationId: organization }),
    });
    const sources = useQuery({
        queryKey: [...modelKey(knowledgeModelId), 'knowledge-sources'],
        refetchInterval: section === 'documents' ? 15_000 : false,
        queryFn: () => executeActionClient<{ sources: KnowledgeSourceSummary[] }>('knowledge.listKnowledgeSources', { knowledgeModelId }, { organizationId: organization }),
    });
    const connections = useQuery({
        queryKey: ['connections', organization],
        queryFn: () => executeActionClient<{ connections: ConnectionListItem[] }>('connection.list', {}, { organizationId: organization }),
    });
    const setModel = (model: KnowledgeModelView) => queryClient.setQueryData(modelKey(knowledgeModelId), model);
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
        onSuccess: () => {
            queryClient.setQueryData<NavigationIndex>(
                navigationKey(organization),
                previous => previous && { ...previous, models: previous.models.filter(entry => entry.id !== knowledgeModelId) },
            );
            void queryClient.invalidateQueries({ queryKey: ['knowledge-models', organization] });
            setDeleteDialogOpen(false);
            router.replace(`/${organizationSlug}/knowledge`);
            toast.success(t('ModelDeleted'));
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('Errors.DeleteModel')),
    });
    const deleteQuery = useMutation({
        mutationFn: (id: string) => executeActionClient('knowledge.deleteVerifiedQuery', { knowledgeModelId, id }, { organizationId: organization }),
        onSuccess: (_, id) => {
            if (selectedQueryId === id) void setSelectedQueryId(null);
            void queryClient.invalidateQueries({ queryKey: modelKey(knowledgeModelId) });
            void queryClient.invalidateQueries({ queryKey: ['knowledge-directory-search', organization] });
        },
        onError: error => toast.error(error.message),
    });
    const openQuery = useMutation({
        mutationFn: async (query: VerifiedQuery) => {
            // Finish updating the expanded row's URL before navigating to the console.
            await setSelectedQueryId(query.id);
            return executeActionClient<{ tabId: string }>(
                'tab.create',
                { connectionId: query.sourceConnectionId, tabName: query.title, tabType: 'sql', content: query.sql },
                { organizationId: organization, currentConnectionId: query.sourceConnectionId },
            );
        },
        onSuccess: (tab, query) =>
            router.push(`/${encodeURIComponent(organizationSlug)}/${encodeURIComponent(query.sourceConnectionId)}/sql-console?tabId=${encodeURIComponent(tab.tabId)}`),
    });
    if (modelQuery.isLoading) return <div className="p-8 text-sm text-muted-foreground">{t('LoadingModel')}</div>;
    if (!modelQuery.data) return <div className="p-8 text-sm text-destructive">{t('ModelNotFound')}</div>;
    const model = modelQuery.data;
    const selectedQuery = queries.data?.queries.find(item => item.id === selectedQueryId);
    function renderQueryDetail(item: VerifiedQuery) {
        const connection = connections.data?.connections.find(row => row.connection.id === item.sourceConnectionId);
        const accessible = connection?.identities.some(identity => identity.enabled !== false && identity.status !== 'disabled');
        const sourceName = model.dataSources.find(source => source.connectionId === item.sourceConnectionId)?.name ?? connection?.connection.name;
        const panelId = `verified-query-details-${item.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

        return (
            <div id={panelId} className="p-5">
                <h3 className="mb-2 font-semibold">{item.question}</h3>
                <div className="mb-3 space-y-1 text-sm text-muted-foreground">
                    <p>
                        {t('VerifiedQueryDetails.DataSource', {
                            name: sourceName ?? t('KnowledgeSources.UnavailableDataSource'),
                        })}
                    </p>
                    <p>{t('VerifiedQueryDetails.Origin', { origin: item.sourceType || '—' })}</p>
                    <p>
                        {t('VerifiedQueryDetails.UpdatedByTime', {
                            user: item.updatedByName ?? t('VerifiedQueryDetails.UnknownUser'),
                            time: new Date(item.updatedAt).toLocaleString(),
                        })}
                    </p>
                </div>
                <pre className="max-h-48 w-full max-w-full overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2.5 font-mono text-xs leading-5 [overflow-wrap:anywhere]">
                    {item.sql}
                </pre>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button disabled={!accessible || openQuery.isPending} onClick={() => openQuery.mutate(item)}>
                        {t('VerifiedQueryDetails.Open')}
                    </Button>
                    {!connections.isPending && !accessible ? <span className="text-sm text-muted-foreground">{t('VerifiedQueryDetails.Unavailable')}</span> : null}
                    {openQuery.isError && openQuery.variables.id === item.id ? (
                        <span role="alert" className="text-sm text-destructive">
                            {openQuery.error.message}
                        </span>
                    ) : null}
                </div>
                <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2">
                    <DefinitionReferenceEditor
                        canWrite={navigation.canWrite}
                        organization={organization}
                        knowledgeModelId={knowledgeModelId}
                        query={item}
                        definitions={model.model.definitions}
                        graph={graph.data ?? { queryDefinitionEdges: [], sourceAssetEdges: [] }}
                    />
                    <AssetSourceEditor
                        organization={organization}
                        knowledgeModelId={knowledgeModelId}
                        assetType="verified_query"
                        canWrite={navigation.canWrite}
                        assetId={item.id}
                        sources={sources.data?.sources ?? []}
                        graph={graph.data ?? { queryDefinitionEdges: [], sourceAssetEdges: [] }}
                    />
                </div>
            </div>
        );
    }
    return (
        <div className="bg-n8 h-screen overflow-auto">
            <main className="min-h-full">
                <KnowledgeDocumentsPanel
                    model={model}
                    organization={organization}
                    sources={sources.data?.sources ?? []}
                    sourcesPending={sources.isPending}
                    sourcesError={sources.error?.message}
                    workspace={{
                        navigation,
                        organizationSlug,
                        section: section === 'documents' ? 'documents' : activeTab,
                        createModel: () => setCreating(true),
                        openSettings: () => setEditingModel(model),
                        header: (
                            <div className="flex shrink-0 items-center gap-2">
                                <KnowledgeDataSourceAvatars sources={model.dataSources} />
                                <div className="flex gap-2">
                                    <Button variant="outline" onClick={() => setAskAiOpen(true)}>
                                        {t('AskAi')}
                                    </Button>
                                    {navigation.canWrite && (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button ref={modelActionsRef} variant="outline" size="icon" aria-label={t('ModelActions')}>
                                                    <MoreHorizontal />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onSelect={() => setEditingModel(model)}>{common('edit')}</DropdownMenuItem>
                                                <DropdownMenuItem variant="destructive" onSelect={() => setDeleteDialogOpen(true)}>
                                                    {common('delete')}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                </div>
                            </div>
                        ),
                    }}
                >
                    {section === 'sources' && (
                        <>
                            {sourceDetail ? (
                                <Button variant="ghost" onClick={() => void setActiveTab('sources')}>
                                    <ArrowLeft />
                                    {t('KnowledgeSources.Tab')}
                                </Button>
                            ) : null}
                            {activeTab === 'definitions' ? (
                                <>
                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className="mr-auto">
                                            <h2 className="font-semibold">{t('Definitions')}</h2>
                                            <p className="text-sm text-muted-foreground" title={model.modelRevision}>
                                                Apache Ossie {model.ossieVersion} · rev {model.modelRevision.slice(0, 8)}
                                            </p>
                                        </div>
                                        <Button variant="outline" onClick={() => setYamlEditorOpen(true)}>
                                            {t('ViewYaml')}
                                        </Button>
                                    </div>
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
                                </>
                            ) : activeTab === 'rules' ? (
                                <>
                                    <h2 className="font-semibold">{t('Extraction.BusinessRules')}</h2>
                                    <BusinessRulesPanel organization={organization} knowledgeModelId={knowledgeModelId} dataSources={model.dataSources} />
                                </>
                            ) : (
                                <KnowledgeSourcesPanel organization={organization} knowledgeModelId={knowledgeModelId} />
                            )}
                        </>
                    )}
                    {section === 'queries' && (
                        <div className="space-y-3">
                            {!selectedQueryId && (
                                <Input
                                    type="search"
                                    aria-label={t('VerifiedQueryDetails.Search')}
                                    placeholder={t('VerifiedQueryDetails.Search')}
                                    value={search}
                                    onChange={event => {
                                        void setSearch(event.target.value);
                                        void setSelectedQueryId(null);
                                        queryPagination.onPageChange(0);
                                    }}
                                />
                            )}
                            {queries.isError ? (
                                <p role="alert">{queries.error.message}</p>
                            ) : queries.isPending ? (
                                <p>{t('LoadingModel')}</p>
                            ) : selectedQueryId && selectedQuery ? (
                                renderQueryDetail(selectedQuery)
                            ) : filteredQueries?.length ? (
                                <div className="w-full rounded-md border">
                                    <table className="w-full table-fixed text-sm">
                                        <thead className="bg-muted/50 text-left text-muted-foreground">
                                            <tr>
                                                <th className="p-3 font-medium">{t('VerifiedQueryDetails.Columns.Question')}</th>
                                                <th className="p-3 font-medium">{t('VerifiedQueryDetails.Columns.Query')}</th>
                                                <th className="p-3 font-medium">{t('VerifiedQueryDetails.Columns.Updated')}</th>
                                                <th className="w-12" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredQueries
                                                .slice(queryPagination.pageIndex * queryPagination.pageSize, (queryPagination.pageIndex + 1) * queryPagination.pageSize)
                                                .map(item => {
                                                    return (
                                                        <tr key={item.id} className="border-t hover:bg-muted/30">
                                                            <td className="p-0 font-medium">
                                                                <button
                                                                    type="button"
                                                                    className="flex w-full items-center gap-2 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                                                                    aria-label={item.question || item.title}
                                                                    onClick={() => void setSelectedQueryId(item.id)}
                                                                >
                                                                    <IconFileTypeSql className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                                                    <span className="truncate">{item.question || item.title}</span>
                                                                </button>
                                                            </td>
                                                            <td className="max-w-sm p-3 text-muted-foreground">
                                                                <span className="block truncate">{item.title}</span>
                                                            </td>
                                                            <td className="break-words p-3 text-xs text-muted-foreground">
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
                                                                    disabled={!navigation.canWrite}
                                                                    aria-label={t('DeleteNamedQuery', { name: item.title })}
                                                                    onClick={() => deleteQuery.mutate(item.id)}
                                                                >
                                                                    <Trash2 />
                                                                </Button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                        </tbody>
                                    </table>
                                    <DataTablePagination
                                        total={filteredQueries.length}
                                        {...queryPagination}
                                        onPageChange={index => {
                                            void setSelectedQueryId(null);
                                            queryPagination.onPageChange(index);
                                        }}
                                        onPageSizeChange={size => {
                                            void setSelectedQueryId(null);
                                            queryPagination.onPageSizeChange(size);
                                        }}
                                    />
                                </div>
                            ) : (
                                <Card className="border-dashed">
                                    <CardContent className="py-12 text-center text-sm text-muted-foreground">
                                        {search.trim() ? t('VerifiedQueryDetails.NoMatches') : t('VerifiedQueriesEmpty')}
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    )}
                </KnowledgeDocumentsPanel>
                <CreateKnowledgeModelDialog
                    controlledOpen={creating}
                    onOpenChange={setCreating}
                    connections={connections.data?.connections ?? []}
                    onCreated={created => {
                        void queryClient.invalidateQueries({ queryKey: ['knowledge-models', organization] });
                        router.push('/' + organizationSlug + '/knowledge/' + created.id);
                    }}
                />
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
                <DeleteKnowledgeModelDialog
                    modelName={deleteDialogOpen ? model.name : null}
                    isPending={deleteModel.isPending}
                    onCancel={() => setDeleteDialogOpen(false)}
                    onConfirm={() => deleteModel.mutate()}
                    onCloseAutoFocus={event => {
                        event.preventDefault();
                        modelActionsRef.current?.focus();
                    }}
                />
            </main>
        </div>
    );
}

export function KnowledgePage() {
    const params = useParams<{ organization: string; knowledgeModelId?: string }>();
    const organization = useOrganizationId();
    const t = useTranslations('Knowledge');
    const navigation = useQuery({
        queryKey: navigationKey(organization),
        queryFn: () => executeActionClient<NavigationIndex>('knowledge.navigation', {}, { organizationId: organization }),
    });
    if (navigation.isError)
        return (
            <p role="alert" className="p-6">
                {navigation.error.message}
            </p>
        );
    if (!navigation.data) return <p className="p-6 text-sm">{t('LoadingModel')}</p>;
    return params.knowledgeModelId ? (
        <KnowledgeModelDetail key={params.knowledgeModelId} organizationSlug={params.organization} knowledgeModelId={params.knowledgeModelId} navigation={navigation.data} />
    ) : (
        <KnowledgeLanding organizationSlug={params.organization} navigation={navigation.data} />
    );
}

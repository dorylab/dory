'use client';
import { SmartCodeBlock } from '@/components/@dory/ui/code-block/code-block';
import { AddVerifiedQueryDialog } from '@/components/knowledge/add-verified-query-dialog';
import { EditSavedQueryDialog } from '@/components/knowledge/edit-saved-query-dialog';

import { useEffect, useRef, useState } from 'react';
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
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent } from '@/registry/new-york-v4/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/registry/new-york-v4/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { Input } from '@/registry/new-york-v4/ui/input';
import { navigationKey, type NavigationIndex } from './knowledge-navigation';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import type { ConnectionListItem } from '@dory/shared/types/connections';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IconFileTypeSql } from '@tabler/icons-react';
import { MoreHorizontal, Plus, Trash2, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import { DataTablePagination } from '@/components/@dory/ui/data-table-pagination';

import { useOrganizationId } from '../components/organization-context';
import { KnowledgeDataSourceAvatars } from './knowledge-data-source-avatars';
import { KnowledgeDocumentsPanel } from './knowledge-documents-panel';
import { useKnowledgeListPagination } from './knowledge-list-pagination';
import { KnowledgeSourcesPanel } from './knowledge-connections-panel';
import type { KnowledgeSourceSummary } from './knowledge-sources-panel';

type ModelDataSource = { connectionId: string; name: string; type: string; engine: string };
export type KnowledgeModelView = {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    businessContextMd: string;
    dataSources: ModelDataSource[];
    verifiedQueryCount: number;
    knowledgeSourceCount: number;
    createdAt: string;
    updatedAt: string;
};
type VerifiedQuery = {
    savedQueryId: string;
    revision: number;
    id: string;
    knowledgeModelId: string;
    sourceConnectionId: string;
    title: string;
    question: string;
    sql: string;
    description: string | null;
    sourceType: string;
    sourceId: string | null;
    createdBy: string | null;
    updatedBy: string | null;
    updatedByName: string | null;
    createdAt: string;
    updatedAt: string;
};

const modelKey = (modelId: string) => ['knowledge-model', modelId] as const;
const connectionIdOf = (item: ConnectionListItem) => item.connection.id!;
function relativeTime(value: string) {
    const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    if (Math.abs(seconds) < 3600) return formatter.format(Math.round(seconds / 60), 'minute');
    if (Math.abs(seconds) < 86400) return formatter.format(Math.round(seconds / 3600), 'hour');
    return formatter.format(Math.round(seconds / 86400), 'day');
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

function KnowledgeModelDetail({ organizationSlug, knowledgeModelId, navigation }: { organizationSlug: string; knowledgeModelId: string; navigation: NavigationIndex }) {
    const organization = useOrganizationId();
    const t = useTranslations('Knowledge');
    const tQueries = useTranslations('SqlConsole.SavedQueries');
    const common = useTranslations('Common');
    const sqlOverview = useTranslations('SqlConsole.Overview');
    const router = useRouter();
    const queryClient = useQueryClient();
    const modelActionsRef = useRef<HTMLButtonElement>(null);
    const [creating, setCreating] = useState(false);
    useEffect(() => {
        if (navigation.models.some(m => m.id === knowledgeModelId)) localStorage.setItem('knowledge.last.' + organization + '.' + navigation.userId, knowledgeModelId);
    }, [navigation.models, organization, knowledgeModelId, navigation.userId]);
    const [editingModel, setEditingModel] = useState<KnowledgeModelView | null>(null);
    const [addingQuery, setAddingQuery] = useState(false);
    const [editingQuery, setEditingQuery] = useState<VerifiedQuery | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [activeTab, setActiveTab] = useQueryState('tab', parseAsString.withDefault('documents'));
    useEffect(() => {
        if (activeTab === 'definitions' || activeTab === 'rules') void setActiveTab('documents');
    }, [activeTab, setActiveTab]);
    let section = 'documents';
    if (activeTab === 'sources') section = 'sources';
    if (activeTab === 'queries') section = 'queries';
    const [selectedQueryId, setSelectedQueryId] = useQueryState('query', parseAsString.withOptions({ history: 'push' }));
    const modelQuery = useQuery({
        queryKey: modelKey(knowledgeModelId),
        queryFn: () => executeActionClient<KnowledgeModelView>('knowledge.get', { knowledgeModelId }, { organizationId: organization }),
    });
    const needsReferenceData = activeTab === 'queries';
    const queries = useQuery({
        enabled: needsReferenceData,
        queryKey: [...modelKey(knowledgeModelId), 'verified-queries'],
        queryFn: () => executeActionClient<{ queries: VerifiedQuery[] }>('knowledge.listVerifiedQueries', { knowledgeModelId }, { organizationId: organization }),
    });
    const [search, setSearch] = useQueryState('querySearch', parseAsString.withDefault(''));
    const needle = search.trim().toLocaleLowerCase();
    const filteredQueries = queries.data?.queries.filter(
        item => !needle || [item.description ?? item.question, item.title].some(text => text.toLocaleLowerCase().includes(needle)),
    );
    const queryPagination = useKnowledgeListPagination('queries', filteredQueries?.length, {
        id: selectedQueryId,
        index: filteredQueries?.findIndex(query => query.id === selectedQueryId) ?? -1,
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
                <h3 className="mb-2 font-semibold">{item.title}</h3>
                {(item.description ?? item.question) && <p className="mb-3 whitespace-pre-wrap text-sm">{item.description ?? item.question}</p>}
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
                <SmartCodeBlock value={item.sql} type="sql" variant="soft" maxHeightClassName="max-h-48" copyLabel={sqlOverview('CopySql')} />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button disabled={!accessible || openQuery.isPending} onClick={() => openQuery.mutate(item)}>
                        {t('VerifiedQueryDetails.Open')}
                    </Button>
                    {navigation.canWrite && (
                        <Button variant="outline" onClick={() => setEditingQuery(item)}>
                            {tQueries('EditSql')}
                        </Button>
                    )}
                    {!connections.isPending && !accessible ? <span className="text-sm text-muted-foreground">{t('VerifiedQueryDetails.Unavailable')}</span> : null}
                    {openQuery.isError && openQuery.variables.id === item.id ? (
                        <span role="alert" className="text-sm text-destructive">
                            {openQuery.error.message}
                        </span>
                    ) : null}
                </div>
            </div>
        );
    }
    return (
        <div className="bg-n8 h-full min-h-0">
            <main className="h-full">
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
                        header: addContent => (
                            <div className="flex shrink-0 items-center gap-2">
                                <KnowledgeDataSourceAvatars sources={model.dataSources} />
                                <div className="flex gap-2">
                                    {addContent}
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
                    {section === 'sources' && <KnowledgeSourcesPanel organization={organization} knowledgeModelId={knowledgeModelId} />}
                    {section === 'queries' && (
                        <div className="space-y-3">
                            {!selectedQueryId && navigation.canWrite && model && (
                                <Button size="sm" variant="outline" onClick={() => setAddingQuery(true)}>
                                    {t('AddVerifiedQuery')}
                                </Button>
                            )}
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
                                                <th className="p-3 font-medium">{t('VerifiedQueryDetails.Columns.Query')}</th>
                                                <th className="p-3 font-medium">{t('VerifiedQueryDescription')}</th>
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
                                                                    aria-label={item.title}
                                                                    onClick={() => void setSelectedQueryId(item.id)}
                                                                >
                                                                    <IconFileTypeSql className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                                                    <span className="truncate">{item.title}</span>
                                                                </button>
                                                            </td>
                                                            <td className="max-w-sm p-3 text-muted-foreground">
                                                                <span className="block truncate">{item.description ?? item.question}</span>
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
                {addingQuery && model && <AddVerifiedQueryDialog open onOpenChange={setAddingQuery} model={model} sourceType="manual" />}
                {editingQuery && (
                    <EditSavedQueryDialog
                        query={{
                            id: editingQuery.savedQueryId,
                            queryId: editingQuery.id,
                            knowledgeModelId: editingQuery.knowledgeModelId,
                            title: editingQuery.title,
                            description: editingQuery.description ?? editingQuery.question,
                            sqlText: editingQuery.sql,
                            revision: editingQuery.revision,
                        }}
                        connectionId={editingQuery.sourceConnectionId}
                        organizationId={organization}
                        onSaved={async removedModelIds => {
                            if (selectedQueryId === editingQuery.id && removedModelIds.includes(knowledgeModelId)) await setSelectedQueryId(null);
                        }}
                        onClose={() => setEditingQuery(null)}
                    />
                )}
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

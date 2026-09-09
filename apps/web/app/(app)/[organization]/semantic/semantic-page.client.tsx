'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useDeferredValue, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BrainCircuit, CheckCircle2, MoreHorizontal, Pencil, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
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
export type SemanticModelView = {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    businessContextMd: string;
    modelYaml: string;
    model: { definitions: Definition[] };
    dataSources: ModelDataSource[];
    verifiedQueryCount: number;
    createdAt: string;
    updatedAt: string;
};
type VerifiedQuery = {
    id: string;
    semanticModelId: string;
    sourceConnectionId: string;
    title: string;
    question: string;
    sql: string;
    description: string | null;
    definitionIds: string[];
    sourceType: string;
    sourceId: string | null;
    updatedAt: string;
};

const modelKey = (modelId: string) => ['semantic-model', modelId] as const;
const connectionIdOf = (item: ConnectionListItem) => item.connection.id!;
const MonacoYamlEditor = dynamic(() => import('@/components/@dory/ui/monaco-editor'), {
    ssr: false,
    loading: () => <div className="h-full animate-pulse bg-muted" aria-label="Loading YAML editor" />,
});

function relativeTime(value: string) {
    const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    if (Math.abs(seconds) < 3600) return formatter.format(Math.round(seconds / 60), 'minute');
    if (Math.abs(seconds) < 86400) return formatter.format(Math.round(seconds / 3600), 'hour');
    return formatter.format(Math.round(seconds / 86400), 'day');
}

export function CreateSemanticModelDialog({
    connections,
    trigger,
    initialConnectionId,
    onCreated,
}: {
    connections: ConnectionListItem[];
    trigger?: React.ReactNode;
    initialConnectionId?: string;
    onCreated?: (model: SemanticModelView) => void;
}) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [selected, setSelected] = useState<string[]>(initialConnectionId ? [initialConnectionId] : []);
    const create = useMutation({
        mutationFn: () => executeActionClient<SemanticModelView>('semantic.create', { name, description, connectionIds: selected }),
        onSuccess: model => {
            setOpen(false);
            setName('');
            setDescription('');
            setSelected(initialConnectionId ? [initialConnectionId] : []);
            onCreated?.(model);
        },
        onError: error => toast.error(error instanceof Error ? error.message : 'Could not create semantic model.'),
    });
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger ?? (
                    <Button>
                        <Plus />
                        New semantic model
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>New semantic model</DialogTitle>
                    <DialogDescription>Group business meaning across one or more data sources.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Name</label>
                        <Input value={name} onChange={event => setName(event.target.value)} placeholder="Commerce" />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Description</label>
                        <Textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="Business semantics for orders, customers and revenue." />
                    </div>
                    <fieldset className="space-y-2">
                        <legend className="mb-2 text-sm font-medium">Data sources</legend>
                        {connections.map(item => {
                            const id = connectionIdOf(item);
                            return (
                                <label key={id} className="flex cursor-pointer items-center gap-3 rounded-md border p-3">
                                    <input
                                        type="checkbox"
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
                        Cancel
                    </Button>
                    <Button onClick={() => create.mutate()} disabled={!name.trim() || selected.length === 0 || create.isPending}>
                        Create model
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function EditSemanticModelDialog({
    model,
    organization,
    connections,
    onOpenChange,
    onUpdated,
}: {
    model: SemanticModelView | null;
    organization: string;
    connections: ConnectionListItem[];
    onOpenChange: (open: boolean) => void;
    onUpdated: (model: SemanticModelView) => void;
}) {
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
            if (!model) throw new Error('Select a semantic model first.');
            await executeActionClient<SemanticModelView>('semantic.update', { semanticModelId: model.id, name, description }, { organizationId: organization });
            return executeActionClient<SemanticModelView>('semantic.replaceDataSources', { semanticModelId: model.id, connectionIds }, { organizationId: organization });
        },
        onSuccess: updated => {
            onUpdated(updated);
            onOpenChange(false);
            toast.success('Semantic model updated.');
        },
        onError: error => toast.error(error instanceof Error ? error.message : 'Could not update semantic model.'),
    });

    return (
        <Dialog open={Boolean(model)} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit semantic model</DialogTitle>
                    <DialogDescription>Update the model name and business description.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Name</label>
                        <Input value={name} onChange={event => setName(event.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Description</label>
                        <Textarea value={description} onChange={event => setDescription(event.target.value)} />
                    </div>
                    <fieldset className="space-y-2">
                        <legend className="text-sm font-medium">Data sources</legend>
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
                        Cancel
                    </Button>
                    <Button onClick={() => update.mutate()} disabled={!name.trim() || connectionIds.length === 0 || update.isPending}>
                        Save changes
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function SemanticModelList({ organization }: { organization: string }) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [search, setSearch] = useQueryState('q', parseAsString.withDefault(''));
    const [editingModel, setEditingModel] = useState<SemanticModelView | null>(null);
    const [deletingModel, setDeletingModel] = useState<SemanticModelView | null>(null);
    const deferredSearch = useDeferredValue(search);
    const connections = useQuery({
        queryKey: ['connections', organization],
        queryFn: () => executeActionClient<{ connections: ConnectionListItem[] }>('connection.list', {}, { organizationId: organization }),
    });
    const models = useQuery({
        queryKey: ['semantic-models', organization, deferredSearch],
        queryFn: () => executeActionClient<{ models: SemanticModelView[] }>('semantic.list', { query: deferredSearch || undefined }, { organizationId: organization }),
    });
    const onCreated = (model: SemanticModelView) => {
        void queryClient.invalidateQueries({ queryKey: ['semantic-models', organization] });
        router.push(`/${organization}/semantic/${model.id}`);
    };
    const connectionItems = connections.data?.connections ?? [];
    const deleteModel = useMutation({
        mutationFn: () => {
            if (!deletingModel) throw new Error('Select a semantic model first.');
            return executeActionClient('semantic.delete', { semanticModelId: deletingModel.id }, { organizationId: organization, confirmationToken: 'semantic.delete' });
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['semantic-models', organization] });
            setDeletingModel(null);
            toast.success('Semantic model deleted.');
        },
        onError: error => toast.error(error instanceof Error ? error.message : 'Could not delete semantic model.'),
    });
    const updateModel = (_model: SemanticModelView) => {
        void queryClient.invalidateQueries({ queryKey: ['semantic-models', organization] });
        setEditingModel(null);
    };
    return (
        <div className="bg-n8 h-screen overflow-auto">
            <main className="container mx-auto flex flex-col gap-6 px-12 pt-4 pb-12 lg:px-12 lg:pb-12 xl:px-8 xl:pb-8 2xl:px-4 2xl:pb-4">
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold">Semantic Context</h1>
                        <p className="mt-1 text-muted-foreground">Give agents consistent business meaning across your data.</p>
                    </div>
                    <CreateSemanticModelDialog connections={connectionItems} onCreated={onCreated} />
                </header>
                {models.data?.models.length || search ? (
                    <div className="relative max-w-xl">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input className="pl-9" value={search} onChange={event => void setSearch(event.target.value || null)} placeholder="Search semantic models" />
                    </div>
                ) : null}
                {models.isLoading ? <p className="text-sm text-muted-foreground">Loading semantic models…</p> : null}
                {models.data?.models.length ? (
                    <div className="overflow-hidden rounded-lg border bg-card">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 text-left text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Model</th>
                                    <th className="px-4 py-3 font-medium">Definitions</th>
                                    <th className="px-4 py-3 font-medium">Data sources</th>
                                    <th className="px-4 py-3 font-medium">Updated</th>
                                    <th className="w-24 px-4 py-3" />
                                </tr>
                            </thead>
                            <tbody>
                                {models.data.models.map(model => (
                                    <tr
                                        key={model.id}
                                        className="cursor-pointer border-t transition-colors hover:bg-muted/30"
                                        onClick={() => router.push(`/${organization}/semantic/${model.id}`)}
                                    >
                                        <td className="px-4 py-4">
                                            <div className="font-medium">{model.name}</div>
                                            {model.description ? <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{model.description}</p> : null}
                                        </td>
                                        <td className="px-4 py-4 text-muted-foreground">
                                            {model.model.definitions.length} definitions · {model.verifiedQueryCount} verified queries
                                        </td>
                                        <td className="px-4 py-4 text-muted-foreground">
                                            <div>
                                                {model.dataSources.length} {model.dataSources.length === 1 ? 'source' : 'sources'}
                                            </div>
                                            <div className="mt-1 text-xs">{model.dataSources.map(source => source.name).join(' · ')}</div>
                                        </td>
                                        <td className="px-4 py-4 text-muted-foreground">{relativeTime(model.updatedAt)}</td>
                                        <td className="px-4 py-4 text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon-sm"
                                                    aria-label={`Edit ${model.name}`}
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
                                                    aria-label={`Delete ${model.name}`}
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
                            <h2 className="text-lg font-semibold">Create your first semantic model</h2>
                            <p className="mt-2 max-w-md text-sm text-muted-foreground">
                                Define metrics, relationships, business rules and verified queries so agents understand your data consistently.
                            </p>
                            <div className="mt-5 flex gap-2">
                                <CreateSemanticModelDialog connections={connectionItems} onCreated={onCreated} trigger={<Button>Create semantic model</Button>} />
                                <Button variant="outline" disabled>
                                    Generate from data sources
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : null}
                <EditSemanticModelDialog
                    model={editingModel}
                    organization={organization}
                    connections={connectionItems}
                    onOpenChange={open => !open && setEditingModel(null)}
                    onUpdated={updateModel}
                />
                <AlertDialog open={Boolean(deletingModel)} onOpenChange={open => !open && setDeletingModel(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete semantic model?</AlertDialogTitle>
                            <AlertDialogDescription>
                                {deletingModel ? `This permanently deletes “${deletingModel.name}”, its definitions, and verified queries.` : ''}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={deleteModel.isPending}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={event => {
                                    event.preventDefault();
                                    deleteModel.mutate();
                                }}
                                disabled={deleteModel.isPending}
                            >
                                Delete model
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </main>
        </div>
    );
}

function DefinitionExpandedRow({ definition, onClose }: { definition: Definition; onClose: () => void }) {
    const fields = [
        ['Description', definition.description],
        ['Aliases', definition.aliases?.join(', ')],
        ['Calculation', definition.expression],
        ['Filters', definition.filters?.join('\n')],
        ['Time dimension', definition.timeDimension],
        ['Available dimensions', definition.dimensions?.join(', ')],
    ].filter(([, value]) => value);

    return (
        <tr className="border-t bg-muted/20">
            <td colSpan={5} className="p-0">
                <div className="relative p-5">
                    <Button variant="ghost" size="icon-sm" className="absolute right-3 top-3" onClick={onClose} aria-label="Close definition details">
                        <X />
                    </Button>
                    <div className="pr-10">
                        <div className="text-base font-semibold">{definition.name}</div>
                        <div className="mt-2 flex gap-2">
                            <Badge>{definition.kind}</Badge>
                            {definition.status === 'verified' ? <Badge variant="secondary">Verified</Badge> : null}
                        </div>
                    </div>
                    {fields.length ? (
                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                            {fields.map(([label, value]) => (
                                <div key={label}>
                                    <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
                                    <div className="mt-1 whitespace-pre-wrap text-sm">{value}</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="mt-5 text-sm text-muted-foreground">No additional details have been documented for this definition.</p>
                    )}
                </div>
            </td>
        </tr>
    );
}

function DefinitionPanel({
    model,
    onSave,
    onImport,
    onAskAi,
}: {
    model: SemanticModelView;
    onSave: (definitions: Definition[]) => void;
    onImport: () => void;
    onAskAi: () => void;
}) {
    const [selected, setSelected] = useState<Definition | null>(null);
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
                            Add definition
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={onAskAi}>
                            <Sparkles />
                            Create with AI
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={() => {
                                setKind('metric');
                                setOpen(true);
                            }}
                        >
                            Metric
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={() => {
                                setKind('dimension');
                                setOpen(true);
                            }}
                        >
                            Dimension
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onSelect={() => {
                                setKind('relationship');
                                setOpen(true);
                            }}
                        >
                            Relationship
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={onImport}>Import</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
            <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left">
                        <tr>
                            <th className="p-3">Name</th>
                            <th className="p-3">Type</th>
                            <th className="p-3">Source</th>
                            <th className="p-3">Status</th>
                            <th className="w-12" />
                        </tr>
                    </thead>
                    <tbody>
                        {model.model.definitions.flatMap(definition => [
                            <tr
                                key={definition.id}
                                className="cursor-pointer border-t hover:bg-muted/30"
                                onClick={() => setSelected(current => (current?.id === definition.id ? null : definition))}
                            >
                                <td className="p-3 font-medium">{definition.name}</td>
                                <td className="p-3 capitalize">{definition.kind}</td>
                                <td className="p-3">{definition.source || sourceName(definition.sourceConnectionId)}</td>
                                <td className="p-3">
                                    {definition.status === 'verified' ? (
                                        <Badge variant="secondary">
                                            <CheckCircle2 />
                                            Verified
                                        </Badge>
                                    ) : (
                                        '—'
                                    )}
                                </td>
                                <td>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={event => {
                                            event.stopPropagation();
                                            onSave(model.model.definitions.filter(item => item.id !== definition.id));
                                        }}
                                    >
                                        <Trash2 />
                                    </Button>
                                </td>
                            </tr>,
                            ...(selected?.id === definition.id
                                ? [<DefinitionExpandedRow key={`${definition.id}:detail`} definition={definition} onClose={() => setSelected(null)} />]
                                : []),
                        ])}
                    </tbody>
                </table>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{kind === 'metric' ? 'Create definition' : `Create ${kind}`}</DialogTitle>
                        <DialogDescription>Add a verified definition to this semantic model.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Input value={name} onChange={event => setName(event.target.value)} placeholder="Revenue" />
                        <select
                            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                            value={sourceConnectionId}
                            onChange={event => setSourceConnectionId(event.target.value)}
                        >
                            {model.dataSources.map(item => (
                                <option key={item.connectionId} value={item.connectionId}>
                                    {item.name}
                                </option>
                            ))}
                        </select>
                        {kind === 'relationship' ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <select className="h-9 rounded-md border bg-background px-3 text-sm" value={from} onChange={event => setFrom(event.target.value)}>
                                    <option value="">From definition</option>
                                    {model.model.definitions
                                        .filter(item => item.sourceConnectionId === sourceConnectionId && item.kind !== 'relationship')
                                        .map(item => (
                                            <option key={item.id} value={item.id}>
                                                {item.name}
                                            </option>
                                        ))}
                                </select>
                                <select className="h-9 rounded-md border bg-background px-3 text-sm" value={to} onChange={event => setTo(event.target.value)}>
                                    <option value="">To definition</option>
                                    {model.model.definitions
                                        .filter(item => item.sourceConnectionId === sourceConnectionId && item.kind !== 'relationship')
                                        .map(item => (
                                            <option key={item.id} value={item.id}>
                                                {item.name}
                                            </option>
                                        ))}
                                </select>
                            </div>
                        ) : (
                            <>
                                <Input value={source} onChange={event => setSource(event.target.value)} placeholder="Source table, e.g. orders" />
                                <Input value={expression} onChange={event => setExpression(event.target.value)} placeholder="Calculation, e.g. SUM(amount)" />
                            </>
                        )}
                        <Textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="Business definition" />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={create}>Add definition</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function AskAiDialog({
    open,
    onOpenChange,
    model,
    onAccept,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    model: SemanticModelView;
    onAccept: (definitions: Definition[]) => void;
}) {
    const [operation, setOperation] = useState('generate_definitions');
    const [prompt, setPrompt] = useState('');
    const [suggestions, setSuggestions] = useState<Definition[]>([]);
    const generate = useMutation({
        mutationFn: () => executeActionClient<{ suggestions: Definition[] }>('semantic.generateSuggestions', { semanticModelId: model.id, operation, prompt }),
        onSuccess: data => setSuggestions(data.suggestions),
        onError: error => toast.error(error instanceof Error ? error.message : 'Could not generate suggestions.'),
    });
    const accept = () => {
        const existing = new Set(model.model.definitions.map(item => item.id));
        onAccept([
            ...model.model.definitions,
            ...suggestions.map(item => ({ ...item, id: existing.has(item.id) ? `${item.id}:${crypto.randomUUID()}` : item.id, status: 'verified' as const })),
        ]);
        onOpenChange(false);
        setSuggestions([]);
    };
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Ask AI</DialogTitle>
                    <DialogDescription>AI suggestions are temporary until you review and add them.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={operation} onChange={event => setOperation(event.target.value)}>
                        <option value="generate_definitions">Generate semantic definitions</option>
                        <option value="analyze_context">Analyze business context</option>
                        <option value="analyze_schema">Analyze schema</option>
                        <option value="find_relationships">Find missing relationships</option>
                        <option value="suggest_metrics">Suggest metrics</option>
                    </select>
                    <Textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder="Help me analyze orders and customers and suggest common metrics." />
                    {suggestions.length ? (
                        <div className="max-h-72 space-y-2 overflow-auto">
                            {suggestions.map(item => (
                                <div key={item.id} className="rounded-md border p-3">
                                    <div className="font-medium">
                                        {item.name} <span className="text-xs capitalize text-muted-foreground">{item.kind}</span>
                                    </div>
                                    <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    {suggestions.length ? (
                        <Button onClick={accept}>Review and add {suggestions.length}</Button>
                    ) : (
                        <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
                            {generate.isPending ? 'Analyzing…' : 'Generate suggestions'}
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
    model: SemanticModelView;
    onImported: (model: SemanticModelView) => void;
}) {
    const [yaml, setYaml] = useState('');
    const [fallbackSourceConnectionId, setFallbackSourceConnectionId] = useState(model.dataSources[0]?.connectionId ?? '');
    const importYaml = useMutation({
        mutationFn: () =>
            executeActionClient<SemanticModelView>('semantic.importYaml', {
                semanticModelId: model.id,
                source: yaml,
                fallbackSourceConnectionId,
            }),
        onSuccess: imported => {
            onImported(imported);
            onOpenChange(false);
            setYaml('');
            toast.success('YAML imported. Imported definitions are unverified.');
        },
        onError: error => toast.error(error instanceof Error ? error.message : 'Could not import YAML.'),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Import Cube-compatible YAML</DialogTitle>
                    <DialogDescription>Definitions without meta.dory.sourceConnectionId will use the selected data source and remain unverified until reviewed.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <select
                        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                        value={fallbackSourceConnectionId}
                        onChange={event => setFallbackSourceConnectionId(event.target.value)}
                    >
                        {model.dataSources.map(source => (
                            <option key={source.connectionId} value={source.connectionId}>
                                {source.name}
                            </option>
                        ))}
                    </select>
                    <Textarea
                        className="min-h-72 font-mono"
                        value={yaml}
                        onChange={event => setYaml(event.target.value)}
                        placeholder={'cubes:\n  - name: orders\n    measures:\n      - name: revenue'}
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={() => importYaml.mutate()} disabled={!yaml.trim() || !fallbackSourceConnectionId || importYaml.isPending}>
                        Import
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
    model: SemanticModelView;
    onSaved: (model: SemanticModelView) => void;
}) {
    const [yaml, setYaml] = useState(model.modelYaml);
    useEffect(() => {
        if (open) setYaml(model.modelYaml);
    }, [open, model.modelYaml]);
    const save = useMutation({
        mutationFn: () =>
            executeActionClient<SemanticModelView>('semantic.importYaml', {
                semanticModelId: model.id,
                source: yaml,
                fallbackSourceConnectionId: model.dataSources[0]?.connectionId,
                preserveStatus: true,
            }),
        onSuccess: saved => {
            onSaved(saved);
            onOpenChange(false);
            toast.success('YAML saved.');
        },
        onError: error => toast.error(error instanceof Error ? error.message : 'Could not save YAML.'),
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[min(42rem,calc(100dvh-2rem))] flex-col sm:max-w-3xl">
                <DialogHeader className="shrink-0">
                    <DialogTitle>Model YAML</DialogTitle>
                    <DialogDescription>Changes are validated before they update the semantic model.</DialogDescription>
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
                        Cancel
                    </Button>
                    <Button onClick={() => save.mutate()} disabled={!yaml.trim() || save.isPending}>
                        {save.isPending ? 'Saving…' : 'Save YAML'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function SemanticModelDetail({ organization, semanticModelId }: { organization: string; semanticModelId: string }) {
    const sourcesText = useTranslations('SemanticContext.KnowledgeSources');
    const router = useRouter();
    const queryClient = useQueryClient();
    const [markdown, setMarkdown] = useState('');
    const [yamlEditorOpen, setYamlEditorOpen] = useState(false);
    const [askAiOpen, setAskAiOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const modelQuery = useQuery({
        queryKey: modelKey(semanticModelId),
        queryFn: () => executeActionClient<SemanticModelView>('semantic.get', { semanticModelId }, { organizationId: organization }),
    });
    const queries = useQuery({
        queryKey: [...modelKey(semanticModelId), 'verified-queries'],
        queryFn: () => executeActionClient<{ queries: VerifiedQuery[] }>('semantic.listVerifiedQueries', { semanticModelId }, { organizationId: organization }),
    });
    useEffect(() => {
        if (modelQuery.data) setMarkdown(modelQuery.data.businessContextMd);
    }, [modelQuery.data]);
    const setModel = (model: SemanticModelView) => queryClient.setQueryData(modelKey(semanticModelId), model);
    const update = useMutation({
        mutationFn: (input: Record<string, unknown>) => executeActionClient<SemanticModelView>('semantic.update', { semanticModelId, ...input }, { organizationId: organization }),
        onSuccess: setModel,
        onError: error => toast.error(error instanceof Error ? error.message : 'Update failed.'),
    });
    const saveDefinitions = useMutation({
        mutationFn: (definitions: Definition[]) =>
            executeActionClient<SemanticModelView>('semantic.saveDefinitions', { semanticModelId, definitions }, { organizationId: organization }),
        onSuccess: setModel,
        onError: error => toast.error(error instanceof Error ? error.message : 'Could not save definitions.'),
    });
    const deleteModel = useMutation({
        mutationFn: () => executeActionClient('semantic.delete', { semanticModelId }, { organizationId: organization, confirmationToken: 'semantic.delete' }),
        onSuccess: () => router.push(`/${organization}/semantic`),
    });
    const deleteQuery = useMutation({
        mutationFn: (id: string) => executeActionClient('semantic.deleteVerifiedQuery', { semanticModelId, id }, { organizationId: organization }),
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: [...modelKey(semanticModelId), 'verified-queries'] }),
    });
    if (modelQuery.isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading semantic model…</div>;
    if (!modelQuery.data) return <div className="p-8 text-sm text-destructive">Semantic model not found.</div>;
    const model = modelQuery.data;
    return (
        <div className="bg-n8 h-screen overflow-auto">
            <main className="container mx-auto flex flex-col gap-6 px-12 pt-4 pb-12 lg:px-12 lg:pb-12 xl:px-8 xl:pb-8 2xl:px-4 2xl:pb-4">
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <Link className="text-sm text-muted-foreground hover:text-foreground" href={`/${organization}/semantic`}>
                            Semantic Context
                        </Link>
                        <h1 className="mt-2 text-2xl font-bold">{model.name}</h1>
                        {model.description ? <p className="mt-1 text-muted-foreground">{model.description}</p> : null}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setAskAiOpen(true)}>
                            Ask AI
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="icon">
                                    <MoreHorizontal />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => setYamlEditorOpen(true)}>View YAML</DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => setImportOpen(true)}>Import YAML</DropdownMenuItem>
                                <DropdownMenuItem variant="destructive" onSelect={() => deleteModel.mutate()}>
                                    Delete model
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>
                <Tabs defaultValue="overview">
                    <TabsList variant="line">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="definitions">Definitions</TabsTrigger>
                        <TabsTrigger value="queries">Verified Queries</TabsTrigger>
                        <TabsTrigger value="sources">{sourcesText('Tab')}</TabsTrigger>
                    </TabsList>
                    <TabsContent value="overview" className="space-y-5 pt-4">
                        <div className="grid gap-3 sm:grid-cols-3">
                            {[
                                [model.model.definitions.length, 'Definitions'],
                                [model.verifiedQueryCount, 'Verified Queries'],
                                [model.dataSources.length, 'Data Sources'],
                            ].map(([value, label]) => (
                                <Card key={label}>
                                    <CardContent className="py-5">
                                        <div className="text-2xl font-semibold">{value}</div>
                                        <div className="text-sm text-muted-foreground">{label}</div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                        <section className="space-y-3 pt-1">
                            <h2 className="text-base font-semibold">Business Context</h2>
                            <Textarea
                                className="min-h-64 font-mono"
                                value={markdown}
                                onChange={event => setMarkdown(event.target.value)}
                                placeholder="Document business rules, vocabulary and agent instructions in Markdown."
                            />
                            <Button onClick={() => update.mutate({ businessContextMd: markdown })}>Save context</Button>
                        </section>
                    </TabsContent>
                    <TabsContent value="definitions" className="pt-4">
                        <DefinitionPanel
                            model={model}
                            onSave={definitions => saveDefinitions.mutate(definitions)}
                            onImport={() => setImportOpen(true)}
                            onAskAi={() => setAskAiOpen(true)}
                        />
                    </TabsContent>
                    <TabsContent value="queries" className="space-y-3 pt-4">
                        {queries.data?.queries.length ? (
                            queries.data.queries.map(item => (
                                <Card key={item.id}>
                                    <CardContent className="flex items-start justify-between gap-4 py-4">
                                        <div className="min-w-0">
                                            <div className="font-medium">{item.title}</div>
                                            <p className="mt-1 text-sm text-muted-foreground">{item.question}</p>
                                            <div className="mt-2 text-xs text-muted-foreground">
                                                {item.sourceType} · Updated {relativeTime(item.updatedAt)}
                                            </div>
                                            <pre className="mt-3 max-h-48 overflow-auto rounded bg-muted p-3 text-xs">{item.sql}</pre>
                                        </div>
                                        <Button variant="ghost" size="icon-sm" onClick={() => deleteQuery.mutate(item.id)}>
                                            <Trash2 />
                                        </Button>
                                    </CardContent>
                                </Card>
                            ))
                        ) : (
                            <Card className="border-dashed">
                                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                                    Verified queries added from Workspace, Agent Runs, or Artifacts will appear here.
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>
                    <TabsContent value="sources" className="pt-4">
                        <KnowledgeSourcesPanel
                            organization={organization}
                            semanticModelId={semanticModelId}
                            dataSources={model.dataSources}
                            definitions={model.model.definitions}
                            onImportDefinitions={definitions => saveDefinitions.mutate(definitions)}
                        />
                    </TabsContent>
                </Tabs>
                <AskAiDialog open={askAiOpen} onOpenChange={setAskAiOpen} model={model} onAccept={definitions => saveDefinitions.mutate(definitions)} />
                <ImportYamlDialog open={importOpen} onOpenChange={setImportOpen} model={model} onImported={setModel} />
                <YamlEditorDialog open={yamlEditorOpen} onOpenChange={setYamlEditorOpen} model={model} onSaved={setModel} />
            </main>
        </div>
    );
}

export function SemanticPage() {
    const params = useParams<{ organization: string; semanticModelId?: string }>();
    return params.semanticModelId ? (
        <SemanticModelDetail organization={params.organization} semanticModelId={params.semanticModelId} />
    ) : (
        <SemanticModelList organization={params.organization} />
    );
}

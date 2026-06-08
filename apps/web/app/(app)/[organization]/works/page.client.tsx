'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BriefcaseBusiness, ChevronDown, Loader2, Pencil, Search, Trash2 } from 'lucide-react';
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
import { Checkbox } from '@/registry/new-york-v4/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/registry/new-york-v4/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Label } from '@/registry/new-york-v4/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import { useConnections } from '../connections/hooks/use-connections';
import type { Work, WorkType } from './types';
import { formatRelativeTime, statusClassName, statusLabel } from './utils';
import { buildScope as buildWorkScope, buildSuggestedGoals, fetchSchemaPreview, safetyConstraintOptions, serializeList, timeRangeOptions, workTypeOptions } from './work-form';

type WorkPageClientProps = {
    organization: string;
};

export function WorkPageClient({ organization }: WorkPageClientProps) {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [editingWork, setEditingWork] = useState<Work | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editConnectionId, setEditConnectionId] = useState('');
    const [editWorkType, setEditWorkType] = useState<WorkType>('investigation');
    const [editGoal, setEditGoal] = useState('');
    const [editAdvancedOpen, setEditAdvancedOpen] = useState(false);
    const [editTimeRange, setEditTimeRange] = useState('Last 7 days');
    const [editTablesMode, setEditTablesMode] = useState<'auto' | 'selected'>('auto');
    const [editSelectedTablesText, setEditSelectedTablesText] = useState('');
    const [editMetricsText, setEditMetricsText] = useState('');
    const [editConstraints, setEditConstraints] = useState<string[]>(safetyConstraintOptions);
    const [editInitialContext, setEditInitialContext] = useState('');
    const [deletingWork, setDeletingWork] = useState<Work | null>(null);
    const connectionsQuery = useConnections();
    const worksQuery = useQuery({
        queryKey: ['works'],
        queryFn: async () => {
            const result = await executeActionClient<{ works: Work[] }>('work.list', { limit: 100 });
            return result.works ?? [];
        },
    });
    const invalidateWorks = () => queryClient.invalidateQueries({ queryKey: ['works'] });

    const editSchemaPreviewQuery = useQuery({
        queryKey: ['work-edit-schema-preview', editConnectionId],
        queryFn: () => fetchSchemaPreview(editConnectionId),
        enabled: Boolean(editingWork && editConnectionId),
        staleTime: 60_000,
    });

    const updateWorkMutation = useMutation({
        mutationFn: (input: {
            id: string;
            title: string;
            connectionId: string;
            goal: string;
            workType: WorkType;
            scope: ReturnType<typeof buildWorkScope>;
            initialContext: string | null;
        }) => executeActionClient<Work>('work.update', input),
        onSuccess: updatedWork => {
            toast.success('Work updated');
            closeEditDialog();
            queryClient.setQueryData<Work[]>(['works'], current => (current ?? []).map(work => (work.id === updatedWork.id ? updatedWork : work)));
            void queryClient.invalidateQueries({ queryKey: ['work', updatedWork.id] });
            void invalidateWorks();
        },
        onError: error => toast.error(error instanceof Error ? error.message : 'Failed to update Work'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => executeActionClient<{ ok: boolean }>('work.delete', { id }),
        onSuccess: (_result, deletedId) => {
            toast.success('Work deleted');
            setDeletingWork(null);
            queryClient.setQueryData<Work[]>(['works'], current => (current ?? []).filter(work => work.id !== deletedId));
            void invalidateWorks();
        },
        onError: error => toast.error(error instanceof Error ? error.message : 'Failed to delete Work'),
    });

    const connectionById = useMemo(() => new Map((connectionsQuery.data ?? []).map(item => [item.connection.id, item.connection])), [connectionsQuery.data]);
    const filteredWorks = useMemo(() => {
        const query = search.trim().toLowerCase();
        const works = worksQuery.data ?? [];
        if (!query) return works;
        return works.filter(work => {
            const connectionName = connectionById.get(work.connectionId)?.name ?? '';
            return `${work.title} ${work.goal} ${connectionName}`.toLowerCase().includes(query);
        });
    }, [connectionById, search, worksQuery.data]);

    const openEditDialog = (work: Work) => {
        setEditingWork(work);
        setEditTitle(work.title);
        setEditConnectionId(work.connectionId);
        setEditWorkType(work.workType);
        setEditGoal(work.goal);
        setEditTimeRange(work.scope?.timeRange || 'Last 7 days');
        setEditTablesMode(work.scope?.tablesMode === 'selected' ? 'selected' : 'auto');
        setEditSelectedTablesText(serializeList(work.scope?.selectedTables));
        setEditMetricsText(serializeList(work.scope?.metrics));
        setEditConstraints(work.scope?.constraints ?? safetyConstraintOptions);
        setEditInitialContext(work.initialContext ?? '');
        setEditAdvancedOpen(Boolean(work.scope || work.initialContext));
    };

    const closeEditDialog = () => {
        setEditingWork(null);
        setEditTitle('');
        setEditConnectionId('');
        setEditWorkType('investigation');
        setEditGoal('');
        setEditAdvancedOpen(false);
        setEditTimeRange('Last 7 days');
        setEditTablesMode('auto');
        setEditSelectedTablesText('');
        setEditMetricsText('');
        setEditConstraints(safetyConstraintOptions);
        setEditInitialContext('');
    };

    const toggleEditConstraint = (constraint: string, checked: boolean) => {
        setEditConstraints(current => (checked ? Array.from(new Set([...current, constraint])) : current.filter(item => item !== constraint)));
    };

    const editSuggestedGoals = useMemo(() => buildSuggestedGoals(editSchemaPreviewQuery.data?.tableNames ?? []), [editSchemaPreviewQuery.data?.tableNames]);
    const selectedEditWorkType = workTypeOptions.find(item => item.value === editWorkType) ?? workTypeOptions[0];
    const canSaveEdit = Boolean(editingWork && editTitle.trim() && editConnectionId && editGoal.trim() && !updateWorkMutation.isPending);

    const saveWork = () => {
        if (!canSaveEdit || !editingWork) return;
        updateWorkMutation.mutate({
            id: editingWork.id,
            title: editTitle.trim(),
            connectionId: editConnectionId,
            goal: editGoal.trim(),
            workType: editWorkType,
            scope: buildWorkScope({
                timeRange: editTimeRange,
                tablesMode: editTablesMode,
                selectedTablesText: editSelectedTablesText,
                metricsText: editMetricsText,
                constraints: editConstraints,
            }),
            initialContext: editInitialContext.trim() || null,
        });
    };

    return (
        <div className="bg-n8 h-screen overflow-auto">
            <div className="container mx-auto mt-6 max-w-6xl px-4 py-6 sm:mt-8 sm:px-6 lg:px-8 2xl:px-4">
                <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className="mb-2 text-2xl font-bold">Work</h1>
                        <p className="text-sm text-muted-foreground">Track goals, investigations, and conclusions for shared human and Agent work.</p>
                    </div>
                    <Button asChild className="w-fit cursor-pointer">
                        <Link href={`/${organization}/works/new`}>
                            <BriefcaseBusiness />
                            New Work
                        </Link>
                    </Button>
                </header>

                <div className="relative mb-6 max-w-xl">
                    <Input value={search} onChange={event => setSearch(event.target.value)} className="peer ps-9" placeholder="Search Work" type="text" />
                    <div className="text-muted-foreground/80 pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 peer-disabled:opacity-50">
                        <Search size={16} />
                    </div>
                </div>

                {worksQuery.isLoading ? (
                    <div className="grid gap-3">
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-24 w-full" />
                    </div>
                ) : filteredWorks.length ? (
                    <div className="grid gap-3">
                        {filteredWorks.map(work => {
                            const connection = connectionById.get(work.connectionId);
                            return (
                                <div key={work.id} className="group rounded-lg border bg-card p-5 text-card-foreground transition-colors hover:bg-accent/40">
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                        <Link href={`/${organization}/works/${work.id}`} className="min-w-0 flex-1 space-y-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h2 className="truncate text-base font-semibold">{work.title}</h2>
                                                <Badge variant="outline" className={statusClassName(work.status)}>
                                                    {statusLabel(work.status)}
                                                </Badge>
                                            </div>
                                            <p className="line-clamp-2 text-sm text-muted-foreground">{work.goal}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {connection?.name ?? 'Unknown data source'} · Updated {formatRelativeTime(work.updatedAt)}
                                            </p>
                                        </Link>
                                        <div className="flex shrink-0 items-center gap-1 sm:mt-0.5">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="size-8"
                                                onClick={() => openEditDialog(work)}
                                                aria-label={`Edit ${work.title}`}
                                            >
                                                <Pencil className="size-4" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="size-8 text-destructive hover:text-destructive"
                                                onClick={() => setDeletingWork(work)}
                                                aria-label={`Delete ${work.title}`}
                                            >
                                                <Trash2 className="size-4" />
                                            </Button>
                                            <Link
                                                href={`/${organization}/works/${work.id}`}
                                                className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-transform group-hover:translate-x-0.5"
                                            >
                                                <ArrowRight className="size-4" />
                                                <span className="sr-only">Open {work.title}</span>
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="rounded-lg border border-dashed bg-card p-10 text-center">
                        <h2 className="text-base font-semibold">No Work yet</h2>
                        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                            Create a Work item when you want a durable goal, investigations, and final conclusion around a data question.
                        </p>
                        <Button asChild className="mt-5">
                            <Link href={`/${organization}/works/new`}>New Work</Link>
                        </Button>
                    </div>
                )}
            </div>

            <Dialog open={Boolean(editingWork)} onOpenChange={open => !open && closeEditDialog()}>
                <DialogContent className="max-h-[min(90vh,760px)] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Edit Work</DialogTitle>
                        <DialogDescription>Update the data source, goal, and Agent context for this Work.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="work-title">Title</Label>
                            <Input id="work-title" value={editTitle} onChange={event => setEditTitle(event.target.value)} disabled={updateWorkMutation.isPending} />
                        </div>

                        <div className="space-y-2">
                            <Label>Data Source</Label>
                            <Select value={editConnectionId} onValueChange={setEditConnectionId} disabled={connectionsQuery.isLoading || updateWorkMutation.isPending}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder={connectionsQuery.isLoading ? 'Loading data sources...' : 'Select a data source'} />
                                </SelectTrigger>
                                <SelectContent>
                                    {(connectionsQuery.data ?? []).map(item => (
                                        <SelectItem key={item.connection.id} value={item.connection.id}>
                                            {item.connection.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Work Type</Label>
                            <Select value={editWorkType} onValueChange={value => setEditWorkType(value as WorkType)} disabled={updateWorkMutation.isPending}>
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {workTypeOptions.map(item => (
                                        <SelectItem key={item.value} value={item.value}>
                                            {item.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">{selectedEditWorkType.description}</p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="work-goal">Goal</Label>
                            <Textarea
                                id="work-goal"
                                value={editGoal}
                                onChange={event => setEditGoal(event.target.value)}
                                placeholder="What do you want to work on?"
                                className="min-h-28 resize-none text-sm"
                                disabled={updateWorkMutation.isPending}
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="text-xs font-medium uppercase text-muted-foreground">Suggested goals based on this data source</div>
                            <div className="flex flex-wrap gap-2">
                                {editSuggestedGoals.map(item => (
                                    <Button
                                        key={item}
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        className="h-auto max-w-full justify-start whitespace-normal text-left"
                                        onClick={() => setEditGoal(item)}
                                        disabled={updateWorkMutation.isPending}
                                    >
                                        {item}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        <Collapsible open={editAdvancedOpen} onOpenChange={setEditAdvancedOpen} className="rounded-lg border bg-background">
                            <CollapsibleTrigger asChild>
                                <Button type="button" variant="ghost" className="flex w-full justify-between px-4 py-3" disabled={updateWorkMutation.isPending}>
                                    <span className="text-sm font-medium">Advanced context</span>
                                    <ChevronDown className={editAdvancedOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                                </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                                <div className="grid gap-5 border-t p-4">
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label>Time range</Label>
                                            <Select value={editTimeRange} onValueChange={setEditTimeRange} disabled={updateWorkMutation.isPending}>
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {timeRangeOptions.map(item => (
                                                        <SelectItem key={item} value={item}>
                                                            {item}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Tables</Label>
                                            <Select
                                                value={editTablesMode}
                                                onValueChange={value => setEditTablesMode(value as 'auto' | 'selected')}
                                                disabled={updateWorkMutation.isPending}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="auto">Auto</SelectItem>
                                                    <SelectItem value="selected">Selected tables</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    {editTablesMode === 'selected' ? (
                                        <div className="space-y-2">
                                            <Label htmlFor="edit-selected-tables">Selected tables</Label>
                                            <Input
                                                id="edit-selected-tables"
                                                value={editSelectedTablesText}
                                                onChange={event => setEditSelectedTablesText(event.target.value)}
                                                placeholder="orders, users, payments"
                                                disabled={updateWorkMutation.isPending}
                                            />
                                        </div>
                                    ) : null}

                                    <div className="space-y-2">
                                        <Label htmlFor="edit-work-metrics">Metrics</Label>
                                        <Input
                                            id="edit-work-metrics"
                                            value={editMetricsText}
                                            onChange={event => setEditMetricsText(event.target.value)}
                                            placeholder="query failures, error rate, latency"
                                            disabled={updateWorkMutation.isPending}
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <Label>Safety / permissions</Label>
                                        <div className="grid gap-2">
                                            {safetyConstraintOptions.map(item => (
                                                <label key={item} className="flex items-center gap-2 text-sm">
                                                    <Checkbox
                                                        checked={editConstraints.includes(item)}
                                                        onCheckedChange={checked => toggleEditConstraint(item, checked === true)}
                                                        disabled={updateWorkMutation.isPending}
                                                    />
                                                    <span>{item}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="edit-initial-context">Additional context</Label>
                                        <Textarea
                                            id="edit-initial-context"
                                            value={editInitialContext}
                                            onChange={event => setEditInitialContext(event.target.value)}
                                            placeholder="Anything the Agent should know before starting?"
                                            className="min-h-24 resize-none text-sm"
                                            disabled={updateWorkMutation.isPending}
                                        />
                                    </div>
                                </div>
                            </CollapsibleContent>
                        </Collapsible>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={closeEditDialog} disabled={updateWorkMutation.isPending}>
                            Cancel
                        </Button>
                        <Button onClick={saveWork} disabled={!canSaveEdit}>
                            {updateWorkMutation.isPending && <Loader2 className="animate-spin" />}
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={Boolean(deletingWork)} onOpenChange={open => !open && setDeletingWork(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Work?</AlertDialogTitle>
                        <AlertDialogDescription>This will delete the Work, its Agent runs, analyses, findings, and linked Work SQL tabs.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={deleteMutation.isPending}
                            onClick={() => deletingWork && deleteMutation.mutate(deletingWork.id)}
                        >
                            {deleteMutation.isPending && <Loader2 className="animate-spin" />}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, ChevronDown, Database, Loader2, Play, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Checkbox } from '@/registry/new-york-v4/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/registry/new-york-v4/ui/collapsible';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Label } from '@/registry/new-york-v4/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import { useConnections } from '../../connections/hooks/use-connections';
import type { Work, WorkType } from '../types';
import {
    buildScope as buildWorkScope,
    buildSuggestedGoals,
    fetchSchemaPreview,
    safetyConstraintOptions,
    timeRangeOptions,
    workTypeOptions,
    type SchemaPreview,
} from '../work-form';

type NewWorkPageClientProps = {
    organization: string;
};

type CreateMode = 'draft' | 'run';

export function NewWorkPageClient({ organization }: NewWorkPageClientProps) {
    const router = useRouter();
    const connectionsQuery = useConnections();
    const [connectionId, setConnectionId] = useState('');
    const [workType, setWorkType] = useState<WorkType>('investigation');
    const [goal, setGoal] = useState('');
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [timeRange, setTimeRange] = useState('Last 7 days');
    const [tablesMode, setTablesMode] = useState<'auto' | 'selected'>('auto');
    const [selectedTablesText, setSelectedTablesText] = useState('');
    const [metricsText, setMetricsText] = useState('');
    const [constraints, setConstraints] = useState<string[]>(safetyConstraintOptions);
    const [initialContext, setInitialContext] = useState('');
    const [createMode, setCreateMode] = useState<CreateMode | null>(null);
    const selectedConnection = useMemo(() => connectionsQuery.data?.find(item => item.connection.id === connectionId) ?? null, [connectionId, connectionsQuery.data]);

    const schemaPreviewQuery = useQuery({
        queryKey: ['new-work-schema-preview', connectionId],
        queryFn: () => fetchSchemaPreview(connectionId),
        enabled: Boolean(connectionId),
        staleTime: 60_000,
    });

    const suggestedGoals = useMemo(() => buildSuggestedGoals(schemaPreviewQuery.data?.tableNames ?? []), [schemaPreviewQuery.data?.tableNames]);
    const selectedWorkType = workTypeOptions.find(item => item.value === workType) ?? workTypeOptions[0];
    const isCreating = createMode !== null;
    const canCreate = Boolean(connectionId && goal.trim() && !isCreating);

    const toggleConstraint = (constraint: string, checked: boolean) => {
        setConstraints(current => (checked ? Array.from(new Set([...current, constraint])) : current.filter(item => item !== constraint)));
    };

    const handleCreate = async (mode: CreateMode) => {
        if (!canCreate) return;
        setCreateMode(mode);
        try {
            const work = await executeActionClient<Work>('work.create', {
                connectionId,
                goal: goal.trim(),
                workType,
                scope: buildWorkScope({
                    timeRange,
                    tablesMode,
                    selectedTablesText,
                    metricsText,
                    constraints,
                }),
                initialContext: initialContext.trim() || undefined,
            });

            if (mode === 'run') {
                const response = await fetch(`/api/works/${encodeURIComponent(work.id)}/run`, {
                    method: 'POST',
                });

                if (!response.ok) {
                    const text = await response.text().catch(() => '');
                    let message = text;
                    try {
                        const parsed = JSON.parse(text) as { error?: string };
                        message = parsed.error ?? text;
                    } catch {
                        // keep text response
                    }
                    throw new Error(message || 'Failed to start Work run');
                }

                void response.text().catch(() => {});
            }

            router.push(`/${organization}/works/${work.id}`);
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : mode === 'run' ? 'Failed to create and run Work' : 'Failed to create Work');
        } finally {
            setCreateMode(null);
        }
    };

    return (
        <div className="bg-n8 h-screen overflow-auto">
            <div className="container mx-auto mt-6 max-w-6xl px-4 py-6 sm:mt-8 sm:px-6 lg:px-8 2xl:px-4">
                <Button variant="ghost" className="mb-5 w-fit" onClick={() => router.push(`/${organization}/works`)}>
                    <ArrowLeft />
                    Work
                </Button>

                <div className="mb-8">
                    <h1 className="text-2xl font-semibold tracking-tight">New Work</h1>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Choose a data source, define a goal, and create a shared workspace for you and the Agent.</p>
                </div>

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <section className="min-w-0 rounded-lg border bg-card p-4 text-card-foreground sm:p-6">
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label>Data Source</Label>
                                <Select value={connectionId} onValueChange={setConnectionId} disabled={connectionsQuery.isLoading || isCreating}>
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
                                <Select value={workType} onValueChange={value => setWorkType(value as WorkType)} disabled={isCreating}>
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
                                <p className="text-xs text-muted-foreground">{selectedWorkType.description}</p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="work-goal">Goal</Label>
                                <Textarea
                                    id="work-goal"
                                    value={goal}
                                    onChange={event => setGoal(event.target.value)}
                                    placeholder="What do you want to work on?"
                                    className="min-h-32 resize-none text-sm"
                                    disabled={isCreating}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Dory will keep the work editable. You can review SQL, correct findings, add notes, and update the final conclusion.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <div className="text-xs font-medium uppercase text-muted-foreground">Suggested goals based on this data source</div>
                                <div className="flex flex-wrap gap-2">
                                    {suggestedGoals.map(item => (
                                        <Button
                                            key={item}
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            className="h-auto max-w-full justify-start whitespace-normal text-left"
                                            onClick={() => setGoal(item)}
                                            disabled={isCreating}
                                        >
                                            {item}
                                        </Button>
                                    ))}
                                </div>
                            </div>

                            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="rounded-lg border bg-background">
                                <CollapsibleTrigger asChild>
                                    <Button type="button" variant="ghost" className="flex w-full justify-between px-4 py-3" disabled={isCreating}>
                                        <span className="text-sm font-medium">Advanced context</span>
                                        <ChevronDown className={advancedOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                                    </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                    <div className="grid gap-5 border-t p-4">
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label>Time range</Label>
                                                <Select value={timeRange} onValueChange={setTimeRange} disabled={isCreating}>
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
                                                <Select value={tablesMode} onValueChange={value => setTablesMode(value as 'auto' | 'selected')} disabled={isCreating}>
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

                                        {tablesMode === 'selected' ? (
                                            <div className="space-y-2">
                                                <Label htmlFor="selected-tables">Selected tables</Label>
                                                <Input
                                                    id="selected-tables"
                                                    value={selectedTablesText}
                                                    onChange={event => setSelectedTablesText(event.target.value)}
                                                    placeholder="orders, users, payments"
                                                    disabled={isCreating}
                                                />
                                            </div>
                                        ) : null}

                                        <div className="space-y-2">
                                            <Label htmlFor="work-metrics">Metrics</Label>
                                            <Input
                                                id="work-metrics"
                                                value={metricsText}
                                                onChange={event => setMetricsText(event.target.value)}
                                                placeholder="query failures, error rate, latency"
                                                disabled={isCreating}
                                            />
                                        </div>

                                        <div className="space-y-3">
                                            <Label>Safety / permissions</Label>
                                            <div className="grid gap-2">
                                                {safetyConstraintOptions.map(item => (
                                                    <label key={item} className="flex items-center gap-2 text-sm">
                                                        <Checkbox
                                                            checked={constraints.includes(item)}
                                                            onCheckedChange={checked => toggleConstraint(item, checked === true)}
                                                            disabled={isCreating}
                                                        />
                                                        <span>{item}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="initial-context">Additional context</Label>
                                            <Textarea
                                                id="initial-context"
                                                value={initialContext}
                                                onChange={event => setInitialContext(event.target.value)}
                                                placeholder="Anything the Agent should know before starting?"
                                                className="min-h-24 resize-none text-sm"
                                                disabled={isCreating}
                                            />
                                        </div>
                                    </div>
                                </CollapsibleContent>
                            </Collapsible>

                            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                <Button variant="secondary" onClick={() => handleCreate('draft')} disabled={!canCreate}>
                                    {createMode === 'draft' && <Loader2 className="animate-spin" />}
                                    Create Draft
                                </Button>
                                <Button onClick={() => handleCreate('run')} disabled={!canCreate}>
                                    {createMode === 'run' ? <Loader2 className="animate-spin" /> : <Play />}
                                    Create & Run
                                </Button>
                            </div>
                        </div>
                    </section>

                    <aside className="min-w-0 rounded-lg border bg-card p-4 text-card-foreground sm:p-5">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="text-sm font-semibold">Work Preview</h2>
                            <Badge variant="secondary">{createMode === 'run' ? 'Running' : 'Draft'}</Badge>
                        </div>

                        <div className="mt-5 space-y-6 text-sm">
                            <div>
                                <p className="text-xs font-medium uppercase text-muted-foreground">Data source</p>
                                <div className="mt-2 flex items-center gap-2">
                                    <Database className="size-4 text-muted-foreground" />
                                    <span>{selectedConnection?.connection.name ?? 'Not selected'}</span>
                                </div>
                            </div>

                            <div>
                                <p className="text-xs font-medium uppercase text-muted-foreground">Schema context</p>
                                <SchemaPreviewContent
                                    isLoading={schemaPreviewQuery.isLoading}
                                    isError={schemaPreviewQuery.isError}
                                    preview={schemaPreviewQuery.data ?? null}
                                    hasConnection={Boolean(connectionId)}
                                />
                            </div>

                            <CapabilityList title="Agent can" items={['Inspect schema', 'Run read-only SQL', 'Create investigations', 'Update conclusion']} />

                            <CapabilityList title="You can" items={['Review every SQL', 'Correct findings', 'Add notes', 'Accept or reject conclusion']} />

                            <div className="rounded-lg border bg-background p-4">
                                <div className="flex gap-3">
                                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                                    <p className="text-sm leading-6 text-muted-foreground">
                                        This creates a shared workspace for you and the Agent. Agent runs are recorded. SQL, findings, and conclusions stay reviewable.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}

function SchemaPreviewContent({ hasConnection, isError, isLoading, preview }: { hasConnection: boolean; isError: boolean; isLoading: boolean; preview: SchemaPreview | null }) {
    if (!hasConnection) {
        return <p className="mt-2 text-muted-foreground">Select a data source to preview schema context.</p>;
    }

    if (isLoading) {
        return (
            <div className="mt-2 flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading schema preview...
            </div>
        );
    }

    if (isError || !preview) {
        return <p className="mt-2 text-muted-foreground">Schema will be inspected after Work is created.</p>;
    }

    return (
        <div className="mt-2 space-y-2">
            <p>
                {preview.databaseCount} database{preview.databaseCount === 1 ? '' : 's'} · {preview.tableCount} table{preview.tableCount === 1 ? '' : 's'} scanned
            </p>
            {preview.tableNames.length ? (
                <div className="flex flex-wrap gap-1.5">
                    {preview.tableNames.map(table => (
                        <Badge key={table} variant="outline" className="max-w-full truncate">
                            {table}
                        </Badge>
                    ))}
                </div>
            ) : (
                <p className="text-muted-foreground">Schema will be inspected after Work is created.</p>
            )}
        </div>
    );
}

function CapabilityList({ items, title }: { items: string[]; title: string }) {
    return (
        <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">{title}</p>
            <ul className="mt-2 space-y-2 text-muted-foreground">
                {items.map(item => (
                    <li key={item} className="flex items-center gap-2">
                        <Check className="size-4 shrink-0" />
                        <span>{item}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

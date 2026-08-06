'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Download, FileDown, GripVertical, Loader2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import type { ExportFormat, TableExportPlanV1 } from '@dory/export';
import type { TablePreviewFilter, TablePreviewSort } from '@dory/drivers/types';
import { executeActionClient } from '@/lib/actions/client';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Checkbox } from '@/registry/new-york-v4/ui/checkbox';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/registry/new-york-v4/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/registry/new-york-v4/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/registry/new-york-v4/ui/tabs';

type ExportRunView = {
    id: string;
    status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
    phase: 'queued' | 'reading' | 'converting' | 'uploading' | 'completed' | 'failed' | 'canceled';
    plan: TableExportPlanV1;
    processedRows: number;
    batchCount: number;
    byteSize: number | null;
    fileName: string | null;
    downloadUrl: string | null;
    errorMessage: string | null;
    artifactExpiresAt: string | null;
    createdAt: string;
};

type ExportListView = { rows: ExportRunView[]; nextCursor: string | null };

type DataPreviewExportPanelProps = {
    connectionId: string;
    database: string;
    table: string;
    columns: string[];
    filters: TablePreviewFilter[];
    search: string;
    searchColumns: string[];
    sort: TablePreviewSort | null;
    pendingChanges: number;
};

function formatBytes(value: number | null) {
    if (value == null) return null;
    if (value < 1024) return `${value} B`;
    if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
    return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

function SortableColumn({ name, checked, onCheckedChange }: { name: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: name, disabled: !checked });
    return (
        <div
            ref={setNodeRef}
            data-export-column={name}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${isDragging ? 'z-10 bg-card shadow-md' : 'hover:bg-muted/60'}`}
        >
            <button type="button" className="cursor-grab text-muted-foreground disabled:cursor-default disabled:opacity-30" disabled={!checked} {...attributes} {...listeners}>
                <GripVertical className="size-3.5" />
            </button>
            <Checkbox checked={checked} onCheckedChange={value => onCheckedChange(value === true)} />
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{name}</span>
        </div>
    );
}

export function DataPreviewExportPanel({ connectionId, database, table, columns, filters, search, searchColumns, sort, pendingChanges }: DataPreviewExportPanelProps) {
    const t = useTranslations('TableBrowser.Export');
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState('new');
    const [format, setFormat] = useState<ExportFormat>('csv');
    const [columnQuery, setColumnQuery] = useState('');
    const [orderedColumns, setOrderedColumns] = useState<string[]>(columns);
    const [selectedColumns, setSelectedColumns] = useState<string[]>(columns);
    const selectionScopeRef = useRef(`${connectionId}\u0000${database}\u0000${table}`);
    const autoDownloadRunIdsRef = useRef(new Set<string>());
    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

    useEffect(() => {
        const nextScope = `${connectionId}\u0000${database}\u0000${table}`;
        const scopeChanged = selectionScopeRef.current !== nextScope;
        if (scopeChanged) selectionScopeRef.current = nextScope;
        setOrderedColumns(current => {
            if (scopeChanged) return columns;
            const retained = current.filter(column => columns.includes(column));
            return [...retained, ...columns.filter(column => !retained.includes(column))];
        });
        setSelectedColumns(current => {
            if (scopeChanged) return columns;
            const retained = current.filter(column => columns.includes(column));
            return retained.length > 0 ? retained : columns;
        });
    }, [columns, connectionId, database, table]);

    const queryKey = ['table-export-runs', connectionId, database, table] as const;
    const runsQuery = useQuery<ExportListView>({
        queryKey,
        enabled: Boolean(connectionId && database && table),
        queryFn: () => executeActionClient<ExportListView>('table.export.list', { connectionId, database, table, limit: 20 }, { currentConnectionId: connectionId }),
        refetchInterval: query => (query.state.data?.rows.some(run => run.status === 'queued' || run.status === 'running') ? 2_000 : false),
    });
    const runs = useMemo(() => (runsQuery.data?.rows ?? []).slice(0, 20), [runsQuery.data?.rows]);
    const activeCount = runs.filter(run => run.status === 'queued' || run.status === 'running').length;
    const exportColumns = useMemo(() => orderedColumns.filter(column => selectedColumns.includes(column)), [orderedColumns, selectedColumns]);

    useEffect(() => {
        for (const run of runs) {
            if (!autoDownloadRunIdsRef.current.has(run.id)) continue;
            if (run.status === 'completed' && run.downloadUrl) {
                autoDownloadRunIdsRef.current.delete(run.id);
                const anchor = document.createElement('a');
                anchor.href = run.downloadUrl;
                anchor.download = run.fileName ?? '';
                anchor.hidden = true;
                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
            } else if (run.status === 'failed' || run.status === 'canceled') {
                autoDownloadRunIdsRef.current.delete(run.id);
            }
        }
    }, [runs]);

    const createMutation = useMutation({
        mutationFn: () => {
            const plan: TableExportPlanV1 = {
                version: 1,
                source: { kind: 'table', connectionId, database, table },
                columns: exportColumns,
                operations: { filters, search: search.trim() || null, searchColumns, sort },
                output: { format },
            };
            return executeActionClient<ExportRunView>('table.export.create', { plan }, { currentConnectionId: connectionId });
        },
        onSuccess: run => {
            autoDownloadRunIdsRef.current.add(run.id);
            queryClient.setQueryData<ExportListView>(queryKey, current => ({
                rows: [run, ...(current?.rows ?? []).filter(item => item.id !== run.id)].slice(0, 20),
                nextCursor: current?.nextCursor ?? null,
            }));
            setTab('recent');
            toast.success(t('Queued'));
            void queryClient.invalidateQueries({ queryKey });
        },
        onError: error => toast.error(error instanceof Error ? error.message : t('Failed')),
    });

    const cancelMutation = useMutation({
        mutationFn: (exportId: string) => executeActionClient('table.export.cancel', { connectionId, exportId }, { currentConnectionId: connectionId }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey }),
        onError: error => toast.error(error instanceof Error ? error.message : t('CancelFailed')),
    });

    const visibleColumns = useMemo(() => {
        const query = columnQuery.trim().toLowerCase();
        return query ? orderedColumns.filter(column => column.toLowerCase().includes(query)) : orderedColumns;
    }, [columnQuery, orderedColumns]);

    const handleDragEnd = (event: DragEndEvent) => {
        if (!event.over || event.active.id === event.over.id) return;
        setOrderedColumns(current => {
            const from = current.indexOf(String(event.active.id));
            const to = current.indexOf(String(event.over!.id));
            return from >= 0 && to >= 0 ? arrayMove(current, from, to) : current;
        });
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 shrink-0 gap-1.5 px-2 text-xs" data-testid="data-preview-export-trigger">
                    {activeCount > 0 ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
                    {t('Title')}
                    {activeCount > 0 ? <span className="rounded-full bg-primary/15 px-1.5 text-[10px] text-primary">{activeCount}</span> : null}
                </Button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                side="top"
                className="w-[420px] overflow-hidden p-0"
                style={{ height: 'min(560px, calc(100vh - 32px))' }}
                data-testid="data-preview-export-panel"
            >
                <Tabs value={tab} onValueChange={setTab} className="h-full min-h-0 gap-0">
                    <div className="shrink-0 border-b px-3 pt-3">
                        <TabsList variant="line" className="h-8">
                            <TabsTrigger value="new" className="text-xs">
                                {t('New')}
                            </TabsTrigger>
                            <TabsTrigger value="recent" className="text-xs">
                                {t('Recent')}
                            </TabsTrigger>
                        </TabsList>
                    </div>
                    <TabsContent value="new" className="min-h-0 space-y-3 overflow-y-auto p-3">
                        <div className="grid grid-cols-[96px_1fr] items-center gap-2 text-xs">
                            <span className="text-muted-foreground">{t('Format')}</span>
                            <Select value={format} onValueChange={value => setFormat(value as ExportFormat)}>
                                <SelectTrigger size="control" className="h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="csv">CSV</SelectItem>
                                    <SelectItem value="parquet">Parquet</SelectItem>
                                    <SelectItem value="arrow">Arrow IPC</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
                            {t('ScopeSummary', { filters: filters.length, sort: sort ? `${sort.column} ${sort.direction.toUpperCase()}` : t('NoSort') })}
                            {search.trim() ? <div className="mt-1 truncate">{t('SearchSummary', { search })}</div> : null}
                        </div>
                        {pendingChanges > 0 ? (
                            <div className="rounded-md border border-orange-500/40 bg-orange-500/10 p-2 text-xs text-orange-700 dark:text-orange-300">{t('PendingWarning')}</div>
                        ) : null}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium">{t('Columns', { selected: selectedColumns.length, total: columns.length })}</span>
                                <div className="flex gap-1">
                                    <Button variant="ghost" size="xs" onClick={() => setSelectedColumns(orderedColumns)}>
                                        {t('SelectAll')}
                                    </Button>
                                    <Button variant="ghost" size="xs" onClick={() => setSelectedColumns([])}>
                                        {t('Clear')}
                                    </Button>
                                </div>
                            </div>
                            <Input value={columnQuery} onChange={event => setColumnQuery(event.target.value)} placeholder={t('SearchColumns')} className="h-8 text-xs" />
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <SortableContext items={visibleColumns} strategy={verticalListSortingStrategy}>
                                    <div className="max-h-52 overflow-y-auto rounded-md border p-1">
                                        {visibleColumns.map(column => (
                                            <SortableColumn
                                                key={column}
                                                name={column}
                                                checked={selectedColumns.includes(column)}
                                                onCheckedChange={checked =>
                                                    setSelectedColumns(current =>
                                                        checked ? (current.includes(column) ? current : [...current, column]) : current.filter(item => item !== column),
                                                    )
                                                }
                                            />
                                        ))}
                                    </div>
                                </SortableContext>
                            </DndContext>
                        </div>
                        <Button className="w-full" disabled={selectedColumns.length === 0 || createMutation.isPending} onClick={() => createMutation.mutate()}>
                            {createMutation.isPending ? <Loader2 className="animate-spin" /> : <FileDown />}
                            {t('Start')}
                        </Button>
                    </TabsContent>
                    <TabsContent value="recent" className="min-h-0 overflow-y-auto p-3">
                        {runsQuery.isLoading ? (
                            <div className="flex h-24 items-center justify-center text-muted-foreground">
                                <Loader2 className="animate-spin" />
                            </div>
                        ) : runs.length === 0 ? (
                            <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">{t('NoRuns')}</div>
                        ) : (
                            <div className="divide-y overflow-hidden rounded-md border">
                                {runs.map(run => {
                                    const active = run.status === 'queued' || run.status === 'running';
                                    return (
                                        <div key={run.id} className="px-2 py-1.5 text-xs" data-export-run>
                                            <div className="flex min-w-0 items-center gap-2">
                                                {active ? <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" /> : null}
                                                <div className="min-w-0 flex-1 truncate font-medium">
                                                    {run.fileName ?? `${run.plan.output.format.toUpperCase()} · ${run.plan.columns.length} ${t('ColumnsLabel')}`}
                                                </div>
                                                <div className="flex shrink-0 items-center gap-1">
                                                    {active ? (
                                                        <Button
                                                            variant="ghost"
                                                            size="xs"
                                                            className="h-5 px-1.5"
                                                            disabled={cancelMutation.isPending}
                                                            onClick={() => cancelMutation.mutate(run.id)}
                                                        >
                                                            <X /> {t('Cancel')}
                                                        </Button>
                                                    ) : null}
                                                    {run.downloadUrl ? (
                                                        <Button variant="ghost" size="xs" className="h-5 px-1.5" asChild>
                                                            <a href={run.downloadUrl}>
                                                                <Download /> {t('Download')}
                                                            </a>
                                                        </Button>
                                                    ) : null}
                                                </div>
                                            </div>
                                            <div
                                                className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground"
                                                title={
                                                    run.errorMessage ??
                                                    (run.status === 'completed' && run.artifactExpiresAt
                                                        ? t('Expires', { date: new Date(run.artifactExpiresAt).toLocaleString() })
                                                        : undefined)
                                                }
                                            >
                                                {t(`Status.${run.status}`)} · {run.processedRows.toLocaleString()} {t('Rows')}
                                                {formatBytes(run.byteSize) ? ` · ${formatBytes(run.byteSize)}` : ''}
                                                {active ? <> · {t('Progress', { phase: t(`Phase.${run.phase}`), batches: run.batchCount.toLocaleString() })}</> : null}
                                                {run.errorMessage ? <span className="text-destructive"> · {run.errorMessage}</span> : null}
                                                {run.status === 'completed' && run.artifactExpiresAt ? (
                                                    <> · {t('Expires', { date: new Date(run.artifactExpiresAt).toLocaleString() })}</>
                                                ) : null}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </PopoverContent>
        </Popover>
    );
}

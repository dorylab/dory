'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { Provider } from 'jotai';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Info, Play, Square, Eye, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type {
    ReportAnalysisContext,
    ReportEvidenceReference,
    ReportQueryTab,
    ReportWorkingDraft,
    ReportWorkspaceResult,
    ReportWorkspaceSourceInfo,
} from '@dory/shared/types/report-workspace';
import type { WorkDocumentView, WorkVisual } from '@dory/shared/types/work-document';
import type { UITabPayload } from '@dory/shared/types/tabs';
import type { SQLEditorHandle } from '@/app/(app)/[organization]/[connectionId]/sql-console/components/sql-editor';
import { SQLTabs } from '@/app/(app)/[organization]/[connectionId]/sql-console/components/tabs';
import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { WorkspacePanels } from '@/components/agent-runs/workspace-panels';
import { AgentWorkspaceDrawer } from '@/components/agent-runs/agent-workspace-drawer';
import { executeActionClient } from '@/lib/actions/client';
import { reportWorkspaceReturnPath } from '@/lib/work-documents/workspace-url';
import { parseReport, reportEmbeds, reportTagSource } from '@/lib/work-documents/report-core';
import { Button } from '@/registry/new-york-v4/ui/button';
import { ReportSelect } from './report-select';
import { SelectItem } from '@/registry/new-york-v4/ui/select';
import { Input } from '@/registry/new-york-v4/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/registry/new-york-v4/ui/dialog';
import { ResizablePanelGroup as Group, ResizablePanel as Panel, ResizableHandle as Handle } from '@/registry/new-york-v4/ui/resizable';
import { ReportBody } from './report-body';
import { SourceDetails } from './report-source-details';
import { useReportWorkingDraft } from './use-report-working-draft';
import type { ReportEditorHandle } from './report-editor';

const SQLEditor = dynamic(() => import('@/app/(app)/[organization]/[connectionId]/sql-console/components/sql-editor'), { ssr: false });
const VTable = dynamic(() => import('@/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/vtable'), { ssr: false });
const ReportEditor = dynamic(() => import('./report-editor'), { ssr: false });
const ComponentDialog = dynamic(() => import('./report-component-dialog'), { ssr: false });
const NOOP = () => undefined;

export function ReportAnalysisWorkspace({ organization, reference, intercepted = false }: { organization: string; reference: ReportEvidenceReference; intercepted?: boolean }) {
    const organizationId = useOrganizationId();
    const t = useTranslations('WorkDocuments.Workspace');
    const context = useQuery({
        queryKey: ['report-analysis', organizationId, reference],
        refetchOnMount: 'always',
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: false,
        queryFn: ({ signal }) => executeActionClient<ReportAnalysisContext>('report.workspace.analysis', reference, { organizationId, signal }),
    });
    if (!context.data || context.isFetching || context.error)
        return (
            <AgentWorkspaceDrawer
                preferBack={intercepted}
                closeHref={reportWorkspaceReturnPath(organization, reference)}
                title={t('Title')}
                backLabel={t('Back')}
                closeLabel={t('Close')}
                description={t('Description')}
            >
                <p className="p-6" role={context.error ? 'alert' : 'status'}>
                    {context.error?.message ?? t('Loading')}
                </p>
            </AgentWorkspaceDrawer>
        );
    return (
        <Provider>
            <Analysis
                key={`${reference.documentId}:${reference.revision}`}
                initial={context.data}
                organization={organization}
                organizationId={organizationId}
                reference={reference}
                intercepted={intercepted}
            />
        </Provider>
    );
}

function Analysis({
    initial,
    organization,
    organizationId,
    reference,
    intercepted,
}: {
    initial: ReportAnalysisContext;
    organization: string;
    organizationId: string;
    reference: ReportEvidenceReference;
    intercepted: boolean;
}) {
    const t = useTranslations('WorkDocuments.Workspace');
    const a = useTranslations('WorkDocuments.Analysis');
    const router = useRouter();
    const search = useSearchParams();
    const client = useQueryClient();
    const working = useReportWorkingDraft(initial.draft, organizationId);
    const { state, draft, change, flush, accept } = working;
    const [details, setDetails] = useState(false);
    const [preview, setPreview] = useState(true);
    const [bodyEditing, setBodyEditing] = useState(search.get('view') === 'report');
    const [resultView, setResultView] = useState<Record<string, string>>({});
    const [runs, setRuns] = useState<Record<string, ReportWorkspaceResult>>({});
    const [error, setError] = useState<string | null>(null);
    const [confirmation, setConfirmation] = useState<'apply' | 'save' | null>(null);
    const [component, setComponent] = useState<{ visual: WorkVisual; insert?: boolean; candidate?: boolean } | null>(null);
    const [busy, setBusy] = useState(false);
    const [focusedComponent, setFocusedComponent] = useState<string | null>(null);
    const previewHost = useRef<HTMLElement>(null);
    const editor = useRef<SQLEditorHandle>(null);
    const reportEditor = useRef<ReportEditorHandle>(null);
    const abort = useRef<AbortController | null>(null);
    const [runningId, setRunningId] = useState<string | null>(null);
    const request = useRef<{ revision: number; id: string } | null>(null);
    const active = state.tabs.find(tab => tab.id === state.activeTabId && !tab.hidden) ?? state.tabs.find(tab => !tab.hidden) ?? state.tabs[0];
    const context = initial.sources.find(source => source.reference.artifactId === active?.sourceArtifactId) ?? initial.sources[0];
    const sourceInfo = useQuery({
        queryKey: ['report-workspace-source', organizationId, context?.reference],
        enabled: Boolean(context),
        retry: false,
        queryFn: ({ signal }) => executeActionClient<ReportWorkspaceSourceInfo>('report.workspace.source', context!.reference, { organizationId, signal }),
    });
    const updateTab = (id: string, patch: Partial<ReportQueryTab>) =>
        change(previous => ({ ...previous, tabs: previous.tabs.map(tab => (tab.id === id ? { ...tab, ...patch } : tab)) }));
    const selectTab = (id: string) => {
        editor.current?.flushSave();
        change(previous => ({ ...previous, activeTabId: id, tabs: previous.tabs.map(tab => (tab.id === id ? { ...tab, hidden: false } : tab)) }));
    };
    const focusedReference = useRef<string | null>(null);
    useEffect(() => {
        if (focusedReference.current === reference.artifactId) return;
        focusedReference.current = reference.artifactId;
        const selected = initial.draft.state.tabs.find(tab => tab.sourceArtifactId === reference.artifactId);
        if (selected) change(previous => ({ ...previous, activeTabId: selected.id, tabs: previous.tabs.map(tab => (tab.id === selected.id ? { ...tab, hidden: false } : tab)) }));
    }, [reference.artifactId, initial.draft.state.tabs, change]);
    useEffect(() => () => abort.current?.abort(), []);
    useEffect(() => {
        if (focusedComponent && preview)
            requestAnimationFrame(() =>
                previewHost.current?.querySelector(`[data-visual="${CSS.escape(focusedComponent)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
            );
    }, [focusedComponent, preview]);
    const uiTabs = useMemo<UITabPayload[]>(
        () =>
            state.tabs.map(tab => ({
                tabId: tab.id,
                tabName: tab.title,
                tabType: 'sql',
                content: tab.sql,
                userId: draft.userId,
                connectionId: initial.sources.find(source => source.reference.artifactId === tab.sourceArtifactId)?.evidence.connectionId ?? '',
            })),
        [state.tabs, initial.sources, draft.userId],
    );
    const uiActive = uiTabs.find(tab => tab.tabId === active?.id);
    const snapshot = initial.sources.find(source => source.reference.artifactId === active?.snapshotArtifactId)?.evidence;
    const view = resultView[active?.id ?? ''] ?? 'snapshot';
    const candidate = active?.candidateId ? draft.results[active.candidateId]?.evidence : undefined;
    const applied = active?.appliedId ? draft.results[active.appliedId]?.evidence : undefined;
    const selectedRun = view.startsWith('run-') ? runs[active?.id ?? '']?.sets[Number(view.slice(4))] : undefined;
    const selected = view === 'applied' ? applied : view === 'candidate' ? candidate : snapshot;
    const resultRows = useMemo(() => (selectedRun?.rows ?? selected?.rows ?? []).map(rowData => ({ rowData })), [selectedRun, selected]);
    const resultColumns = selectedRun?.columns ?? selected?.columnTypes ?? selected?.columns.map(name => ({ name, type: '' })) ?? [];
    const currentResultId = selectedRun?.resultSetId ?? (view === 'candidate' ? active?.candidateId : undefined);
    const linked = state.content.visuals.filter(visual => active?.componentIds.includes(visual.id));
    const operation = async (fn: () => Promise<void>) => {
        setBusy(true);
        setError(null);
        try {
            await fn();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };
    const execution = useMutation({
        mutationFn: async ({ tab, sql, controller }: { tab: ReportQueryTab; sql: string; controller: AbortController }) => {
            const source = initial.sources.find(item => item.reference.artifactId === tab.sourceArtifactId)!;
            await flush();
            const result = await executeActionClient<ReportWorkspaceResult>(
                'report.workspace.execute',
                { ...source.reference, sql, requestId: crypto.randomUUID(), workingDraft: true },
                { organizationId, signal: controller.signal },
            );
            controller.signal.throwIfAborted();
            return { result, tab };
        },
        onSuccess: ({ result, tab }) => {
            setRuns(previous => ({ ...previous, [tab.id]: result }));
            setResultView(previous => ({ ...previous, [tab.id]: 'run-0' }));
            const set = result.sets.find(item => item.resultSetId && !item.error);
            if (set?.resultSetId) updateTab(tab.id, { candidateId: set.resultSetId });
        },
        onError: err => setError(abort.current?.signal.aborted ? t('Cancelled') : err.message),
        onSettled: () => {
            setRunningId(null);
            abort.current = null;
        },
    });
    const run = () => {
        if (!active || runningId || !sourceInfo.data?.available) return;
        const sql = editor.current?.getValue() ?? active.sql;
        updateTab(active.id, { sql });
        const controller = new AbortController();
        abort.current = controller;
        setRunningId(active.id);
        setError(null);
        execution.mutate({ tab: active, sql, controller });
    };
    const add = (duplicate = false) => {
        if (!active) return;
        const sql = editor.current?.getValue() ?? active.sql;
        editor.current?.flushSave();
        const id = `query_${crypto.randomUUID()}`;
        const tab: ReportQueryTab = {
            id,
            title: duplicate ? `${active.title} (${a('Copy')})` : a('NewQuery'),
            sourceArtifactId: active.sourceArtifactId,
            ...(duplicate ? { copiedFromId: active.id, candidateId: active.candidateId, appliedId: active.appliedId } : {}),
            snapshotArtifactId: duplicate ? active.snapshotArtifactId : undefined,
            sql: duplicate ? sql : '',
            hidden: false,
            componentIds: [],
        };
        change(previous => ({ ...previous, tabs: [...previous.tabs, tab], activeTabId: id }));
    };
    const apply = () =>
        operation(async () => {
            if (!active || !currentResultId) return;
            const saved = await flush();
            const next = await executeActionClient<ReportWorkingDraft>(
                'report.workspace.apply',
                { documentId: draft.documentId, baseRevision: draft.baseRevision, expectedDraftRevision: saved.revision, tabId: active.id, resultId: currentResultId },
                { organizationId },
            );
            accept(next);
            setConfirmation(null);
            setResultView(previous => ({ ...previous, [active.id]: 'applied' }));
        });
    const saveVersion = () =>
        operation(async () => {
            const saved = await flush();
            if (request.current?.revision !== saved.revision) request.current = { revision: saved.revision, id: crypto.randomUUID() };
            const next = await executeActionClient<WorkDocumentView>(
                'report.workspace.saveVersion',
                { documentId: draft.documentId, baseRevision: draft.baseRevision, expectedDraftRevision: saved.revision, requestId: request.current.id },
                { organizationId },
            );
            await client.invalidateQueries({ queryKey: ['work-document'] });
            router.push(reportWorkspaceReturnPath(organization, { ...reference, revision: next.revision, publicationId: next.publication?.id, snapshotId: undefined }));
        });
    const locate = (artifactId: string, componentId?: string) => {
        const tab = state.tabs.find(tab =>
            componentId
                ? tab.componentIds.includes(componentId)
                : tab.componentIds.some(id => state.content.visuals.some(visual => visual.id === id && visual.evidenceId === artifactId)) || tab.snapshotArtifactId === artifactId,
        );
        if (tab) selectTab(tab.id);
        if (componentId) setFocusedComponent(componentId);
    };
    const editVisual = (visual: WorkVisual) => {
        change(previous => {
            const visuals = component?.insert ? [...previous.content.visuals, visual] : previous.content.visuals.map(item => (item.id === visual.id ? visual : item));
            return {
                ...previous,
                tabs: previous.tabs.map(tab => (tab.id === active.id && component?.insert ? { ...tab, componentIds: [...tab.componentIds, visual.id] } : tab)),
                content: {
                    ...previous.content,
                    body: previous.content.body + (component?.insert ? `\n\n${reportTagSource(visual)}` : ''),
                    visuals,
                    embeds: reportEmbeds(visuals, previous.content.evidence),
                },
            };
        });
        setComponent(null);
    };
    const pending = Object.entries(draft.results)
        .filter(([id]) => !state.tabs.some(tab => tab.appliedId === id))
        .map(([id, result]) => ({ id, title: result.evidence.sql ?? result.evidence.title }));
    return (
        <AgentWorkspaceDrawer
            preferBack={intercepted}
            closeHref={reportWorkspaceReturnPath(organization, reference)}
            title={a('Title')}
            description={t('Description')}
            backLabel={state.title}
            closeLabel={t('Close')}
            onBeforeClose={async () => {
                if (!((await reportEditor.current?.requestLeave()) ?? true)) return false;
                try {
                    editor.current?.flushSave();
                    await flush();
                    return true;
                } catch {
                    return false;
                }
            }}
            headerActions={
                <>
                    <Button variant="ghost" size="sm" onClick={() => setPreview(!preview)}>
                        <Eye className="size-4" />
                        {a('Preview')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDetails(true)}>
                        <Info className="size-4" />
                        {t('Details')}
                    </Button>
                    <Button
                        size="sm"
                        disabled={busy || state.proseNeedsReview}
                        onClick={() =>
                            void operation(async () => {
                                editor.current?.flushSave();
                                await flush();
                                setConfirmation('save');
                            })
                        }
                    >
                        {a('SaveVersion')}
                    </Button>
                </>
            }
        >
            <div className="relative flex h-full min-h-0 flex-col bg-background" data-testid="report-workspace">
                {busy && <div className="absolute inset-0 z-50 cursor-wait bg-background/40" aria-label={t('Loading')} />}
                <div className="flex flex-wrap items-center gap-3 border-b px-3 py-1 text-xs text-muted-foreground">
                    <span>{a('BasedOn', { version: draft.baseRevision })}</span>
                    <span role="status">{working.saving ? a('Saving') : working.dirty ? a('Unsaved') : a('Saved')}</span>
                    {state.proseNeedsReview && (
                        <>
                            <span>{a('ReviewNeeded')}</span>
                            <Button variant="link" size="sm" onClick={() => change(previous => ({ ...previous, proseNeedsReview: false }))}>
                                {a('Reviewed')}
                            </Button>
                        </>
                    )}
                </div>
                {(error || working.error) && (
                    <div role="alert" className="flex gap-2 border-b p-2 text-sm text-destructive">
                        {error || working.error}
                        <Button size="sm" variant="outline" onClick={() => void flush().catch(() => undefined)}>
                            {a('Retry')}
                        </Button>
                    </div>
                )}
                <WorkspacePanels mode="report" orientation="horizontal">
                    <Panel defaultSize="18%" minSize="10%" className="hidden md:block">
                        <aside className="h-full overflow-auto p-3 text-sm" aria-label={t('Source')}>
                            <h3 className="mb-3 font-medium">{t('Source')}</h3>
                            <p>{context?.evidence.connectionName ?? context?.evidence.title}</p>
                            {context?.source.kind === 'attachment' && <p className="my-2 text-xs text-muted-foreground">DuckDB · {t('AttachmentLimit')}</p>}
                            {sourceInfo.data?.tables.map(table => (
                                <details key={table.name} className="my-3" open={context?.source.kind === 'attachment'}>
                                    <summary className="break-all">{table.name}</summary>
                                    {context?.source.kind === 'database' && (
                                        <DatabaseColumns
                                            organizationId={organizationId}
                                            connectionId={context.source.connectionId}
                                            database={context.source.database ?? 'main'}
                                            table={table.name}
                                        />
                                    )}
                                    {table.columns.map(column => (
                                        <div key={column.name} className="flex justify-between gap-2 py-1 pl-2 text-xs">
                                            <span>{column.name}</span>
                                            <span className="text-muted-foreground">{column.type}</span>
                                        </div>
                                    ))}
                                </details>
                            ))}
                            <p className="my-3 text-xs text-muted-foreground">{sourceInfo.data?.reason ?? sourceInfo.error?.message}</p>
                            <h3 className="mt-6 font-medium">{a('MoveComponent')}</h3>
                            <ReportSelect
                                aria-label={a('MoveComponent')}
                                className="my-2 w-full rounded border bg-background p-2"
                                value=""
                                onValueChange={id => {
                                    if (!id) return;
                                    change(previous => ({
                                        ...previous,
                                        tabs: previous.tabs.map(tab => ({
                                            ...tab,
                                            componentIds: tab.id === active.id ? [...tab.componentIds.filter(x => x !== id), id] : tab.componentIds.filter(x => x !== id),
                                        })),
                                    }));
                                }}
                            >
                                <SelectItem value="__none">{a('MoveComponent')}</SelectItem>
                                {state.content.visuals
                                    .filter(
                                        visual =>
                                            !active.componentIds.includes(visual.id) &&
                                            state.tabs.some(tab => tab.componentIds.includes(visual.id) && tab.sourceArtifactId === active.sourceArtifactId) &&
                                            (active.snapshotArtifactId || active.appliedId),
                                    )
                                    .map(visual => (
                                        <SelectItem key={visual.id} value={visual.id}>
                                            {visual.title}
                                        </SelectItem>
                                    ))}
                            </ReportSelect>
                            <h3 className="mt-6 font-medium">{a('Queries')}</h3>
                            {state.tabs.map(tab => (
                                <Button key={tab.id} variant="ghost" className="w-full justify-start truncate" onClick={() => selectTab(tab.id)}>
                                    {tab.title}
                                    {tab.hidden ? ` · ${a('Hidden')}` : ''}
                                </Button>
                            ))}
                        </aside>
                    </Panel>
                    <Handle withHandle />
                    <Panel minSize="30%">
                        <div className="flex h-full min-h-0 flex-col">
                            <SQLTabs
                                tabs={uiTabs.filter(tab => !state.tabs.find(item => item.id === tab.tabId)?.hidden)}
                                activeTabId={active?.id ?? null}
                                setActiveTabId={selectTab}
                                addTab={() => add()}
                                closeTab={id => updateTab(id, { hidden: true })}
                                closeOtherTabs={id => change(previous => ({ ...previous, tabs: previous.tabs.map(tab => ({ ...tab, hidden: tab.id !== id })), activeTabId: id }))}
                                updateTab={(id, patch) => updateTab(id, { title: patch.tabName ?? active.title })}
                                reorderTabs={(sourceId, targetId) =>
                                    change(previous => {
                                        const tabs = [...previous.tabs];
                                        const index = tabs.findIndex(tab => tab.id === sourceId);
                                        const target = tabs.findIndex(tab => tab.id === targetId);
                                        if (index >= 0 && target >= 0) tabs.splice(target, 0, tabs.splice(index, 1)[0]);
                                        return { ...previous, tabs };
                                    })
                                }
                            />
                            <div className="flex flex-wrap items-center gap-2 border-b p-2">
                                <Button size="sm" onClick={run} disabled={Boolean(runningId) || !sourceInfo.data?.available}>
                                    <Play className="size-4" />
                                    {t('Run')}
                                </Button>
                                {runningId && (
                                    <Button size="sm" variant="outline" onClick={() => abort.current?.abort()}>
                                        <Square className="size-4" />
                                        {t('Cancel')}
                                    </Button>
                                )}
                                <Button size="sm" variant="ghost" onClick={() => add(true)}>
                                    <Copy className="size-4" />
                                    {a('Duplicate')}
                                </Button>
                                <Button size="sm" variant="outline" disabled={!currentResultId || Boolean(selectedRun?.error)} onClick={() => setConfirmation('apply')}>
                                    {a('Apply')}
                                </Button>
                                {linked.map(visual => (
                                    <Button
                                        key={visual.id}
                                        size="sm"
                                        variant="link"
                                        onClick={() => {
                                            setPreview(true);
                                            setFocusedComponent(visual.id);
                                            setComponent({ visual });
                                        }}
                                    >
                                        {visual.title}
                                    </Button>
                                ))}
                            </div>
                            <Group orientation="vertical">
                                <Panel defaultSize="40%" minSize="15%">
                                    <div className="flex h-full min-h-0 flex-col">
                                        {uiActive && context && (
                                            <SQLEditor
                                                ref={editor}
                                                tabs={uiTabs}
                                                activeTab={uiActive}
                                                workspaceActive
                                                updateTab={(id, patch) => {
                                                    if ('content' in patch) updateTab(id, { sql: patch.content });
                                                }}
                                                onRunQuery={run}
                                                onNewTab={() => add()}
                                                sourceContext={{
                                                    connectionId: context.source.kind === 'database' ? context.source.connectionId : undefined,
                                                    dialect: context.source.kind === 'unavailable' ? 'duckdb' : context.source.dialect,
                                                }}
                                            />
                                        )}
                                    </div>
                                </Panel>
                                <Handle withHandle />
                                <Panel minSize="20%">
                                    <div className="flex h-full min-h-0 flex-col">
                                        <div className="flex flex-wrap gap-1 border-b p-2" role="tablist">
                                            {[
                                                { id: 'snapshot', label: t('Snapshot'), show: Boolean(snapshot) },
                                                { id: 'candidate', label: t('CurrentRun'), show: Boolean(candidate) && !runs[active?.id] },
                                                ...(runs[active?.id]?.sets ?? []).map((_, index) => ({
                                                    id: `run-${index}`,
                                                    label: `${t('CurrentRun')}${runs[active.id]?.sets.length > 1 ? ` ${index + 1}` : ''}`,
                                                    show: true,
                                                })),
                                                { id: 'applied', label: a('Applied'), show: Boolean(applied) },
                                            ]
                                                .filter(item => item.show)
                                                .map(item => (
                                                    <Button
                                                        key={item.id}
                                                        role="tab"
                                                        aria-selected={view === item.id}
                                                        data-state={view === item.id ? 'active' : 'inactive'}
                                                        size="sm"
                                                        variant={view === item.id ? 'secondary' : 'ghost'}
                                                        onClick={() => {
                                                            setResultView(previous => ({ ...previous, [active.id]: item.id }));
                                                            if (item.id.startsWith('run-')) {
                                                                const set = runs[active.id]?.sets[Number(item.id.slice(4))];
                                                                if (set?.resultSetId && !set.error) updateTab(active.id, { candidateId: set.resultSetId });
                                                            }
                                                        }}
                                                    >
                                                        {item.label}
                                                    </Button>
                                                ))}
                                        </div>
                                        <div className="flex flex-wrap gap-2 border-b p-2 text-xs text-muted-foreground">
                                            <span>{selected?.capturedAt ? `${t('CapturedAt')} ${new Date(selected.capturedAt).toLocaleString()}` : t('CurrentRun')}</span>
                                            <span>{t('Rows', { count: selectedRun?.rowCount ?? selected?.rows.length ?? 0 })}</span>
                                            <span>{(selectedRun?.limited ?? selected?.truncated) ? t('Subset') : t('Complete')}</span>
                                        </div>
                                        {selectedRun?.error ? (
                                            <p role="alert" className="p-3 text-destructive">
                                                {selectedRun.error}
                                            </p>
                                        ) : (
                                            <div className="min-h-0 flex-1" data-testid="report-workspace-result">
                                                <VTable
                                                    key={`${active?.id}:${view}`}
                                                    results={resultRows}
                                                    columnMetas={resultColumns}
                                                    storageKey={`report:${draft.documentId}:${active?.id}:${view}`}
                                                    onStatsChange={NOOP}
                                                    showSearchBar
                                                    editable={false}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </Panel>
                            </Group>
                        </div>
                    </Panel>
                    {preview && (
                        <>
                            <Handle withHandle />
                            <Panel defaultSize="35%" minSize="20%">
                                <section ref={previewHost} className="h-full overflow-auto p-4" aria-label={a('Preview')}>
                                    <div className="mb-3 flex flex-wrap gap-2">
                                        <Input
                                            aria-label={a('ReportTitle')}
                                            value={state.title}
                                            onChange={event => change(previous => ({ ...previous, title: event.target.value }))}
                                        />
                                        <Button size="sm" variant="outline" onClick={() => setBodyEditing(!bodyEditing)}>
                                            <FileText className="size-4" />
                                            {bodyEditing ? a('Preview') : a('EditText')}
                                        </Button>
                                        {applied &&
                                            (['table', 'chart', 'metric'] as const).map(type => (
                                                <Button
                                                    key={type}
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() =>
                                                        setComponent({
                                                            insert: true,
                                                            visual: {
                                                                id: `embed_${crypto.randomUUID().replaceAll('-', '')}`,
                                                                title: active.title,
                                                                type,
                                                                evidenceId: applied.artifactId,
                                                                ...(type === 'chart'
                                                                    ? { chart: { type: 'bar', xKey: applied.columns[0] ?? '', yKey: applied.columns[1] ?? '' } }
                                                                    : type === 'metric'
                                                                      ? { metric: { column: applied.columns[0] ?? '', rowIndex: 0 } }
                                                                      : {}),
                                                            },
                                                        })
                                                    }
                                                >
                                                    {a(type === 'table' ? 'AddTable' : type === 'chart' ? 'AddChart' : 'AddMetric')}
                                                </Button>
                                            ))}
                                    </div>
                                    {focusedComponent && (
                                        <div className="mb-3 text-xs text-muted-foreground">
                                            {a('SelectedComponent', { name: state.content.visuals.find(v => v.id === focusedComponent)?.title ?? focusedComponent })}
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => {
                                                    const visual = state.content.visuals.find(v => v.id === focusedComponent);
                                                    if (!visual) return;
                                                    change(previous => {
                                                        const visuals = previous.content.visuals.filter(v => v.id !== visual.id);
                                                        let body = previous.content.body ?? '';
                                                        for (const block of parseReport(body, previous.content.visuals)
                                                            .components.filter(block => block.visualId === visual.id)
                                                            .reverse())
                                                            body = body.slice(0, block.start) + body.slice(block.end);
                                                        return {
                                                            ...previous,
                                                            tabs: previous.tabs.map(tab => ({ ...tab, componentIds: tab.componentIds.filter(id => id !== visual.id) })),
                                                            content: {
                                                                ...previous.content,
                                                                visuals,
                                                                embeds: reportEmbeds(visuals, previous.content.evidence),
                                                                body,
                                                            },
                                                        };
                                                    });
                                                    setFocusedComponent(null);
                                                }}
                                            >
                                                {a('RemoveComponent')}
                                            </Button>
                                        </div>
                                    )}
                                    <div className="work-prose">
                                        {bodyEditing ? (
                                            <ReportEditor
                                                restrictSources
                                                ref={reportEditor}
                                                content={state.content}
                                                title={state.title}
                                                onChange={content =>
                                                    change(previous => ({
                                                        ...previous,
                                                        content,
                                                        proseNeedsReview: content.body !== previous.content.body ? false : previous.proseNeedsReview,
                                                    }))
                                                }
                                                onEvidence={id => locate(id)}
                                            />
                                        ) : (
                                            <ReportBody
                                                content={state.content}
                                                title={state.title}
                                                onEvidence={id => locate(id)}
                                                onEditComponent={id => {
                                                    const visual = state.content.visuals.find(v => v.id === id);
                                                    if (visual) {
                                                        locate(visual.evidenceId, id);
                                                        setComponent({ visual });
                                                    }
                                                }}
                                            />
                                        )}
                                    </div>
                                </section>
                            </Panel>
                        </>
                    )}
                </WorkspacePanels>
            </div>
            {context && (
                <SourceDetails
                    onBeforeNavigate={async () => {
                        editor.current?.flushSave();
                        try {
                            await flush();
                            return true;
                        } catch {
                            return false;
                        }
                    }}
                    open={details}
                    onOpenChange={setDetails}
                    context={context}
                    organization={organization}
                    organizationId={organizationId}
                />
            )}
            {component && (
                <ComponentDialog
                    initial={component.visual}
                    content={
                        component.candidate && (selectedRun || candidate)
                            ? {
                                  ...state.content,
                                  evidence: state.content.evidence.map(e =>
                                      e.artifactId === component.visual.evidenceId
                                          ? {
                                                ...e,
                                                columns: selectedRun?.columns.map(c => c.name) ?? candidate!.columns,
                                                rows: selectedRun?.rows ?? candidate!.rows,
                                                truncated: selectedRun?.limited ?? candidate!.truncated,
                                            }
                                          : e,
                                  ),
                              }
                            : state.content
                    }
                    restrictSources
                    onApply={editVisual}
                    onClose={() => setComponent(null)}
                />
            )}
            <Dialog open={Boolean(confirmation)} onOpenChange={open => !open && setConfirmation(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{confirmation === 'apply' ? a('Apply') : a('SaveVersion')}</DialogTitle>
                        <DialogDescription>{confirmation === 'apply' ? a('ApplyDescription') : a('SaveDescription')}</DialogDescription>
                    </DialogHeader>
                    <ul className="max-h-64 space-y-1 overflow-auto break-words text-sm">
                        {confirmation === 'apply'
                            ? linked.map(visual => (
                                  <li key={visual.id}>
                                      <Button variant="link" onClick={() => setComponent({ visual, candidate: true })}>
                                          {visual.title}
                                      </Button>
                                  </li>
                              ))
                            : pending.map(tab => <li key={tab.id}>{a('NotApplied', { name: tab.title })}</li>)}
                    </ul>
                    {confirmation === 'apply' && !linked.length && <p>{a('ApplyExploration')}</p>}
                    {confirmation === 'apply' && linked.length > 1 && <p className="text-sm text-muted-foreground">{a('Independent')}</p>}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmation(null)}>
                            {t('Cancel')}
                        </Button>
                        <Button disabled={busy} onClick={() => void (confirmation === 'apply' ? apply() : saveVersion())}>
                            {confirmation === 'apply' ? a('Apply') : a('SaveVersion')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AgentWorkspaceDrawer>
    );
}

function DatabaseColumns({ organizationId, connectionId, database, table }: { organizationId: string; connectionId: string; database: string; table: string }) {
    const [open, setOpen] = useState(false);
    const host = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const details = host.current?.closest('details');
        const toggle = () => setOpen(Boolean(details?.open));
        details?.addEventListener('toggle', toggle);
        return () => details?.removeEventListener('toggle', toggle);
    }, []);
    const columns = useQuery({
        queryKey: ['report-source-columns', organizationId, connectionId, database, table],
        enabled: open,
        queryFn: ({ signal }) =>
            executeActionClient<{ columns: { columnName: string; columnType?: string }[] }>('schema.describeTable', { connectionId, database, table }, { organizationId, signal }),
    });
    return (
        <div ref={host}>
            {columns.error && <p role="alert">{columns.error.message}</p>}
            {columns.data?.columns.map(column => (
                <div key={column.columnName} className="flex justify-between gap-2 py-1 pl-2 text-xs">
                    <span>{column.columnName}</span>
                    <span className="text-muted-foreground">{column.columnType}</span>
                </div>
            ))}
        </div>
    );
}

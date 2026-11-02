'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { createSerializer, parseAsString, parseAsInteger } from 'nuqs';
import { Provider } from 'jotai';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Info, SlidersHorizontal, Save, Bot, MessageSquare, Check } from 'lucide-react';
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
import type { ChartState } from '@/app/(app)/[organization]/[connectionId]/sql-console/components/result-table/components/charts/chart-shared';
import type { SQLEditorHandle } from '@/app/(app)/[organization]/[connectionId]/sql-console/components/sql-editor';
import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { SqlWorkspacePanel, SqlWorkspacePanelToggle } from '@/components/sql-workspace/sql-workspace-panel';
import { ReportSourceSidebar } from './report-source-sidebar';
import { SqlWorkspace } from '@/components/sql-workspace/sql-workspace';
import { SqlQueryPane, SqlQueryToolbar } from '@/components/sql-workspace/sql-query-pane';
import { SqlResults, SqlResultTabs } from '@/components/sql-workspace/sql-result-view';
import { LocalSqlResult } from '@/components/sql-workspace/local-sql-result';
import { AgentWorkspaceDrawer } from '@/components/agent-runs/agent-workspace-drawer';
import { executeActionClient } from '@/lib/actions/client';
import { reportWorkspaceReturnPath } from '@/lib/work-documents/workspace-url';
import { reportEmbeds, reportTagSource } from '@/lib/work-documents/report-core';
import { ReportSelect } from './report-select';
import { SelectItem } from '@/registry/new-york-v4/ui/select';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/registry/new-york-v4/ui/dialog';
import { SourceDetails } from './report-source-details';
import { useReportWorkingDraft } from './use-report-working-draft';

const serializeWork = createSerializer({ document: parseAsString, revision: parseAsInteger, handoff: parseAsString, panel: parseAsString });
const ComponentDialog = dynamic(() => import('./report-component-dialog'), { ssr: false });

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
    const panelT = useTranslations('AgentRuns.WorkspacePanel.Actions');
    const router = useRouter();
    const client = useQueryClient();
    const working = useReportWorkingDraft(initial.draft, organizationId);
    const { state, draft, change, flush, accept } = working;
    const [details, setDetails] = useState(false);
    const [preview, setPreview] = useState(true);
    const [copied, setCopied] = useState(false);
    const [resultView, setResultView] = useState<Record<string, string>>({});
    const [runs, setRuns] = useState<Record<string, ReportWorkspaceResult>>({});
    const [error, setError] = useState<string | null>(null);
    const [confirmation, setConfirmation] = useState<'apply' | 'save' | null>(null);
    const [component, setComponent] = useState<{ visual: WorkVisual; insert?: boolean; candidate?: boolean } | null>(null);
    const [busy, setBusy] = useState(false);
    const editor = useRef<SQLEditorHandle>(null);
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
    const resultStorageKey = `report:${organizationId}:${draft.documentId}:${draft.baseRevision}:${active?.id}:${view}:${selectedRun?.resultSetId ?? selected?.artifactId ?? ''}`;
    const chartStates = useRef<Record<string, ChartState>>({});
    const recordChartState = useCallback(
        (chart: ChartState) => {
            chartStates.current[resultStorageKey] = chart;
        },
        [resultStorageKey],
    );
    const resultChoices = [
        { id: 'snapshot', label: t('Snapshot'), show: Boolean(snapshot) },
        { id: 'candidate', label: t('CurrentRun'), show: Boolean(candidate) && !runs[active?.id] },
        ...(runs[active?.id]?.sets ?? []).map((_, index) => ({
            id: `run-${index}`,
            label: `${t('CurrentRun')}${runs[active.id]?.sets.length > 1 ? ` ${index + 1}` : ''}`,
            show: true,
        })),
        { id: 'applied', label: a('Applied'), show: Boolean(applied) },
    ].filter(item => item.show);
    useEffect(() => setCopied(false), [active?.id, active?.sql, view]);
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
    const beforeClose = async () => {
        try {
            editor.current?.flushSave();
            await flush();
            return true;
        } catch {
            return false;
        }
    };
    const returnToReport = async () => {
        if (!(await beforeClose())) return;
        if (intercepted && window.history.length > 1) router.back();
        else router.replace(reportWorkspaceReturnPath(organization, reference), { scroll: false });
    };
    const requestSaveVersion = () =>
        void operation(async () => {
            editor.current?.flushSave();
            await flush();
            setConfirmation('save');
        });
    const continueAnalysis = (destination: 'work' | 'agent') =>
        operation(async () => {
            const sql = editor.current?.getValuesByTabId()[active.id] ?? active.sql;
            updateTab(active.id, { sql });
            editor.current?.flushSave();
            await flush();
            const text = [
                `Continue this Dory query analysis: ${active.title}`,
                `Report: ${state.title} (revision ${draft.baseRevision})`,
                `Report ID: ${draft.documentId}`,
                `Source artifact: ${active.sourceArtifactId}`,
                `Query tab: ${active.id}`,
                `Workspace: ${window.location.href}`,
                `Selected result: ${resultChoices.find(item => item.id === view)?.label ?? view}`,
                `Result SQL: ${selectedRun?.sql ?? selected?.sql ?? ''}`,
                `Result set: ${currentResultId ?? selected?.artifactId ?? 'none'}`,
                `Columns: ${resultColumns.map(column => column.name).join(', ')}`,
                `Rows: ${resultRows.length}${(selectedRun?.limited ?? selected?.truncated) ? ' (partial result)' : ''}`,
                `Linked charts/components: ${linked.map(visual => `${visual.title} (${visual.type})`).join(', ') || 'none'}`,
                '',
                `Chart configuration: ${JSON.stringify(chartStates.current[resultStorageKey] ?? null)}`,
                'Current editor SQL (may differ from the selected result):',
                sql,
                '',
                'Use the selected result as historical evidence. Inspect the saved working draft and source before running a new query. Do not overwrite or publish the report without an explicit request.',
            ].join('\n');
            if (destination === 'agent') {
                await navigator.clipboard.writeText(text);
                setCopied(true);
            } else {
                const token = crypto.randomUUID();
                sessionStorage.setItem(
                    `report-handoff:${organization}:${token}`,
                    JSON.stringify({ text, files: [], references: [{ kind: 'report', id: draft.documentId, title: state.title, revision: draft.baseRevision }] }),
                );
                router.push(
                    serializeWork(`/${encodeURIComponent(organization)}/work`, { document: draft.documentId, revision: draft.baseRevision, handoff: token, panel: 'closed' }),
                );
            }
        });
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
            onBeforeClose={beforeClose}
            headerActions={
                <>
                    <Button size="sm" disabled={busy || state.proseNeedsReview} onClick={requestSaveVersion}>
                        {a('SaveVersion')}
                    </Button>
                </>
            }
        >
            <div className="relative flex h-full min-h-0 flex-col bg-background" data-testid="report-workspace">
                {busy && <div className="absolute inset-0 z-50 cursor-wait bg-background/40" aria-label={t('Loading')} />}
                {(error || working.error) && (
                    <div role="alert" className="flex gap-2 border-b p-2 text-sm text-destructive">
                        {error || working.error}
                        <Button size="sm" variant="outline" onClick={() => void flush().catch(() => undefined)}>
                            {a('Retry')}
                        </Button>
                    </div>
                )}
                <SqlWorkspace
                    mode="report"
                    sidebar={{
                        tables: (
                            <ReportSourceSidebar
                                key={`${draft.documentId}:${draft.baseRevision}:${context.reference.artifactId}`}
                                context={context}
                                info={sourceInfo.data}
                                loading={sourceInfo.isFetching}
                                error={sourceInfo.error?.message}
                                organizationId={organizationId}
                                onRefresh={() => void sourceInfo.refetch()}
                            />
                        ),
                        queries: (
                            <div className="p-3 text-sm">
                                <h3 className="mt-6 font-medium">{a('Queries')}</h3>
                                {state.tabs.map(tab => (
                                    <Button key={tab.id} variant="ghost" className="w-full justify-start truncate" onClick={() => selectTab(tab.id)}>
                                        {tab.title}
                                        {tab.hidden ? ` · ${a('Hidden')}` : ''}
                                    </Button>
                                ))}
                            </div>
                        ),
                    }}
                    tabs={{
                        tabs: uiTabs.filter(tab => !state.tabs.find(item => item.id === tab.tabId)?.hidden),
                        activeTabId: active?.id ?? null,
                        setActiveTabId: selectTab,
                        addTab: () => add(),
                        closeTab: id => updateTab(id, { hidden: true }),
                        closeOtherTabs: id => change(previous => ({ ...previous, tabs: previous.tabs.map(tab => ({ ...tab, hidden: tab.id !== id })), activeTabId: id })),
                        updateTab: (id, patch) => updateTab(id, { title: patch.tabName ?? active.title }),
                        reorderTabs: (sourceId, targetId) =>
                            change(previous => {
                                const tabs = [...previous.tabs];
                                const index = tabs.findIndex(tab => tab.id === sourceId);
                                const target = tabs.findIndex(tab => tab.id === targetId);
                                if (index >= 0 && target >= 0) tabs.splice(target, 0, tabs.splice(index, 1)[0]);
                                return { ...previous, tabs };
                            }),
                    }}
                    rail={
                        <>
                            <SqlWorkspacePanelToggle active={preview} label={a('Operations')} onClick={() => setPreview(!preview)}>
                                <SlidersHorizontal className="h-5 w-5" />
                            </SqlWorkspacePanelToggle>
                            <SqlWorkspacePanelToggle active={details} label={t('Details')} onClick={() => setDetails(true)}>
                                <Info className="h-5 w-5" />
                            </SqlWorkspacePanelToggle>
                        </>
                    }
                    rightPanel={
                        preview ? (
                            <SqlWorkspacePanel
                                title={a('Operations')}
                                label={a('Operations')}
                                back={{ label: t('Back'), onClick: () => void returnToReport() }}
                                actionsLabel={panelT('WorkspaceActions')}
                                actions={[
                                    { label: t('Details'), icon: <Info />, onSelect: () => setDetails(true) },
                                    { label: a('SaveVersion'), icon: <Save />, disabled: busy || state.proseNeedsReview, onSelect: requestSaveVersion },
                                ]}
                            >
                                <section className="grid gap-3" aria-label="Query">
                                    <h3 className="text-sm font-semibold">Query</h3>
                                    <p className="truncate text-sm text-muted-foreground" title={active.title}>
                                        {active.title}
                                    </p>
                                    <Button variant="outline" className="justify-start" onClick={() => add(true)}>
                                        <Copy className="size-4" />
                                        {a('Duplicate')}
                                    </Button>
                                </section>
                                <section className="grid gap-3 border-t pt-4" aria-label="Result / Chart">
                                    <h3 className="text-sm font-semibold">Result / Chart</h3>
                                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                        <span>{resultChoices.find(item => item.id === view)?.label}</span>
                                        <span>{t('Rows', { count: resultRows.length })}</span>
                                        <span>{(selectedRun?.limited ?? selected?.truncated) ? t('Subset') : t('Complete')}</span>
                                    </div>
                                    <Button
                                        variant="outline"
                                        className="justify-start"
                                        disabled={!currentResultId || Boolean(selectedRun?.error)}
                                        onClick={() => setConfirmation('apply')}
                                    >
                                        <Check className="size-4" />
                                        {a('Apply')}
                                    </Button>
                                    {linked.map(visual => (
                                        <Button key={visual.id} variant="ghost" className="justify-start truncate" onClick={() => setComponent({ visual })}>
                                            {visual.title}
                                        </Button>
                                    ))}
                                    {state.content.visuals.some(visual => !active.componentIds.includes(visual.id)) && (
                                        <ReportSelect
                                            aria-label={a('MoveComponent')}
                                            value=""
                                            onValueChange={id => {
                                                if (id === '__none') return;
                                                change(previous => ({
                                                    ...previous,
                                                    tabs: previous.tabs.map(tab => ({
                                                        ...tab,
                                                        componentIds:
                                                            tab.id === active.id ? [...tab.componentIds.filter(x => x !== id), id] : tab.componentIds.filter(x => x !== id),
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
                                    )}
                                </section>
                                <section className="grid gap-3 border-t pt-4">
                                    <h3 className="text-sm font-semibold">{a('ContinueAnalysis')}</h3>
                                    <Button className="justify-start" onClick={() => void continueAnalysis('work')}>
                                        <MessageSquare className="size-4" />
                                        {a('ContinueWork')}
                                    </Button>
                                    <Button variant="outline" className="justify-start" onClick={() => void continueAnalysis('agent')}>
                                        {copied ? <Check className="size-4" /> : <Bot className="size-4" />}
                                        {copied ? a('TaskCopied') : a('ContinueAgent')}
                                    </Button>
                                    <p className="text-xs leading-5 text-muted-foreground">{a('ContinueHint')}</p>
                                </section>
                                <div className="mt-auto grid gap-2 border-t pt-4 text-xs text-muted-foreground" data-testid="report-workspace-context">
                                    <p className="truncate" title={state.title}>
                                        {state.title}
                                    </p>
                                    <span>{a('BasedOn', { version: draft.baseRevision })}</span>
                                    <span role="status">{working.saving ? a('Saving') : working.dirty ? a('Unsaved') : a('Saved')}</span>
                                    {state.proseNeedsReview && (
                                        <div className="grid gap-2">
                                            <span>{a('ReviewNeeded')}</span>
                                            <Button variant="outline" size="sm" onClick={() => void returnToReport()}>
                                                {t('Back')}
                                            </Button>
                                            <Button variant="link" size="sm" onClick={() => change(previous => ({ ...previous, proseNeedsReview: false }))}>
                                                {a('Reviewed')}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </SqlWorkspacePanel>
                        ) : undefined
                    }
                >
                    <SqlQueryPane
                        toolbar={
                            <SqlQueryToolbar
                                runLabel={t('Run')}
                                running={Boolean(runningId)}
                                disabled={!active || !sourceInfo.data?.available}
                                onRun={run}
                                onCancel={() => abort.current?.abort()}
                                cancelLabel={t('Cancel')}
                            />
                        }
                        editor={{
                            ref: editor,
                            tabs: uiTabs,
                            activeTab: uiActive,
                            workspaceActive: true,
                            updateTab: (id, patch) => {
                                if ('content' in patch) updateTab(id, { sql: patch.content });
                            },
                            onRunQuery: run,
                            onNewTab: () => add(),
                            sourceContext: context
                                ? {
                                      connectionId: context.source.kind === 'database' ? context.source.connectionId : undefined,
                                      dialect: context.source.kind === 'unavailable' ? 'duckdb' : context.source.dialect,
                                  }
                                : undefined,
                        }}
                        results={
                            <SqlResults
                                testId="report-workspace-result"
                                tabs={
                                    <SqlResultTabs
                                        items={resultChoices}
                                        value={view}
                                        onChange={id => {
                                            setResultView(previous => ({ ...previous, [active.id]: id }));
                                            if (id.startsWith('run-')) {
                                                const set = runs[active.id]?.sets[Number(id.slice(4))];
                                                if (set?.resultSetId && !set.error) updateTab(active.id, { candidateId: set.resultSetId });
                                            }
                                        }}
                                    />
                                }
                                notice={
                                    <div className="flex flex-wrap gap-2 border-b p-2 text-xs text-muted-foreground">
                                        <span>
                                            {selected?.capturedAt && !selectedRun ? `${t('CapturedAt')} ${new Date(selected.capturedAt).toLocaleString()}` : t('CurrentRun')}
                                        </span>
                                        <span>{(selectedRun?.limited ?? selected?.truncated) ? t('Subset') : t('Complete')}</span>
                                    </div>
                                }
                                meta={{
                                    runningRemote: runningId === active?.id,
                                    runningLocal: false,
                                    rowsReturned: selectedRun?.rowCount ?? selected?.rows.length ?? 0,
                                    truncated: selectedRun?.limited ?? selected?.truncated,
                                    errorMessage: selectedRun?.error,
                                }}
                                limited={Boolean(selectedRun?.limited ?? selected?.truncated)}
                            >
                                {selectedRun?.error ? (
                                    <p role="alert" className="p-3 text-destructive">
                                        {selectedRun.error}
                                    </p>
                                ) : (
                                    <LocalSqlResult
                                        key={resultStorageKey}
                                        rows={resultRows}
                                        columns={resultColumns}
                                        storageKey={resultStorageKey}
                                        onChartStateChange={recordChartState}
                                    />
                                )}
                            </SqlResults>
                        }
                    />
                </SqlWorkspace>
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

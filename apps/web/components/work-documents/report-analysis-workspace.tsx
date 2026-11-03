'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/registry/new-york-v4/ui/dialog';
import { SelectItem } from '@/registry/new-york-v4/ui/select';
import type { ConnectionType } from '@dory/shared/types/connections';
import type {
    ReportAnalysisContext,
    ReportEvidenceReference,
    ReportQueryTab,
    ReportWorkingDraft,
    ReportWorkspaceResult,
    ReportWorkspaceSourceInfo,
} from '@dory/shared/types/report-workspace';
import type { UITabPayload } from '@dory/shared/types/tabs';
import type { WorkDocumentView, WorkEvidence } from '@dory/shared/types/work-document';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Provider } from 'jotai';
import { ArrowLeft, Copy, Eye, PanelRight, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { executeActionClient } from '@/lib/actions/client';
import { workspaceErrorMessage } from '@/lib/work-documents/workspace-presentation';
import { reportDraftChanges, type ReportDraftOperation } from '@/lib/work-documents/working-draft';
import { reportWorkspaceReturnPath } from '@/lib/work-documents/workspace-url';
import { AgentWorkspaceDrawer } from '@/components/agent-runs/agent-workspace-drawer';
import { SqlQueryPane, SqlQueryToolbar } from '@/components/sql-workspace/sql-query-pane';
import { SqlResults, SqlResultTabs } from '@/components/sql-workspace/sql-result-view';
import { SqlWorkspace } from '@/components/sql-workspace/sql-workspace';
import { SqlWorkspacePanelToggle } from '@/components/sql-workspace/sql-workspace-panel';
import { WorkspaceResult } from '@/components/sql-workspace/workspace-result';
import { SavedQueriesSidebar, type SavedQueryItem } from '@/app/(app)/[organization]/[connectionId]/sql-console/components/saved-queries/saved-queries-sidebar';
import type { SQLEditorHandle } from '@/app/(app)/[organization]/[connectionId]/sql-console/components/sql-editor';
import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';

import { ReportBody } from './report-body';
import { ReportSelect } from './report-select';
import { ReportSourceSidebar } from './report-source-sidebar';
import { ReportCanvas, ReportReplacementDialog, type CanvasReplacement } from './report-canvas';
import { ReportCanvasDnd, type ReportCanvasSource, type ReportDragItem, type ReportDropTarget } from './report-canvas-dnd';
import { withReportCanvas } from '@/lib/work-documents/report-canvas';
import { useReportWorkingDraft } from './use-report-working-draft';

type Connection = { connection: { id: string; name: string; type: ConnectionType } };

export function ReportAnalysisWorkspace({ organization, reference, intercepted = false }: { organization: string; reference: ReportEvidenceReference; intercepted?: boolean }) {
    const organizationId = useOrganizationId();
    const t = useTranslations('WorkDocuments.Workspace');
    const context = useQuery({
        queryKey: ['report-analysis', organizationId, reference.documentId, reference.revision],
        retry: false,
        refetchOnWindowFocus: false,
        queryFn: ({ signal }) => executeActionClient<ReportAnalysisContext>('report.workspace.analysis', reference, { organizationId, signal }),
    });
    const closeGuard = useRef<(() => Promise<boolean>) | null>(null);
    const beforeClose = useCallback(() => closeGuard.current?.() ?? true, []);
    return (
        <Provider>
            <AgentWorkspaceDrawer
                hideHeader={Boolean(context.data)}
                preferBack={intercepted}
                closeHref={reportWorkspaceReturnPath(organization, reference)}
                title={context.data?.draft.state.title ?? t('Loading')}
                backLabel={context.data?.draft.state.title ?? t('Back')}
                closeLabel={t('Close')}
                description={t('Description')}
                onBeforeClose={beforeClose}
            >
                {context.data ? (
                    <Analysis
                        key={context.data.draft.id ?? `${reference.documentId}:${reference.revision}`}
                        initial={context.data}
                        organization={organization}
                        organizationId={organizationId}
                        reference={reference}
                        closeGuard={closeGuard}
                    />
                ) : (
                    <p className="p-6" role={context.error ? 'alert' : 'status'}>
                        {context.error ? workspaceErrorMessage(context.error, t('Unavailable')) : t('Loading')}
                    </p>
                )}
            </AgentWorkspaceDrawer>
        </Provider>
    );
}

function Analysis({
    initial,
    organization,
    organizationId,
    reference,
    closeGuard,
}: {
    initial: ReportAnalysisContext;
    organization: string;
    organizationId: string;
    reference: ReportEvidenceReference;
    closeGuard: React.RefObject<(() => Promise<boolean>) | null>;
}) {
    const t = useTranslations('WorkDocuments.ConnectedWorkspace');
    const w = useTranslations('WorkDocuments.Workspace');
    const router = useRouter();
    const client = useQueryClient();
    const [busy, setBusy] = useState(false);
    const working = useReportWorkingDraft(initial.draft, organizationId, busy);
    const { state, draft, change, flush, accept, rememberResults } = working;
    const editor = useRef<SQLEditorHandle>(null);
    const controllers = useRef<Record<string, AbortController>>({});
    const [running, setRunning] = useState<string[]>([]);
    const [panel, setPanel] = useState(true);
    const [showChanges, setShowChanges] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [canvasSource, setCanvasSource] = useState<ReportCanvasSource>();
    const [dragItem, setDragItem] = useState<ReportDragItem>();
    const operationLock = useRef(false);
    const [selectedBlock, setSelectedBlock] = useState(reference.componentId ?? '');
    const [pending, setPending] = useState<CanvasReplacement>();
    const [preview, setPreview] = useState(false);
    const [feedback, setFeedback] = useState<string>();
    const [review, setReview] = useState(false);
    const [reviewed, setReviewed] = useState(false);
    const [error, setError] = useState<string>();
    const [runErrors, setRunErrors] = useState<Record<string, string>>({});
    const saveRequest = useRef<{ revision: number; id: string } | undefined>(undefined);
    const focused = useRef('');
    const active = state.tabs.find(tab => tab.id === state.activeTabId && !tab.hidden) ?? state.tabs.find(tab => !tab.hidden);
    const source = active?.source ?? initial.sources.find(item => item.reference.artifactId === active?.sourceArtifactId)?.source;
    const connections = useQuery({
        queryKey: ['workspace-connections', organizationId],
        queryFn: ({ signal }) => executeActionClient<{ connections: Connection[] }>('connection.list', {}, { organizationId, signal }),
    });
    const databases = useQuery({
        queryKey: ['workspace-databases', organizationId, source?.kind === 'database' ? source.connectionId : null],
        enabled: source?.kind === 'database',
        retry: false,
        queryFn: ({ signal }) =>
            executeActionClient<{ databases: Array<string | { name?: string; value: string; label?: string }> }>(
                'schema.listDatabases',
                { connectionId: source?.kind === 'database' ? source.connectionId : undefined },
                { organizationId, signal },
            ),
    });
    const schemas = useQuery({
        queryKey: ['workspace-schemas', organizationId, source],
        enabled: source?.kind === 'database' && Boolean(source.database),
        retry: false,
        queryFn: ({ signal }) =>
            executeActionClient<Array<{ value: string; label: string }>>(
                'schema.listSchemas',
                { connectionId: source?.kind === 'database' ? source.connectionId : undefined, database: source?.kind === 'database' ? source.database : undefined },
                { organizationId, signal },
            ),
    });
    const executionReference = { ...reference, publicationId: undefined, snapshotId: undefined, componentId: undefined, groupId: undefined };
    const sourceInput = {
        ...executionReference,
        revision: draft.baseRevision,
        artifactId: active?.sourceArtifactId ?? '',
        ...(source?.kind === 'database' ? { connectionId: source.connectionId, database: source.database, schema: source.schema } : {}),
    };
    const sourceInfo = useQuery({
        queryKey: ['workspace-source', organizationId, sourceInput],
        enabled: Boolean(active && source && source.kind !== 'unavailable'),
        retry: false,
        queryFn: ({ signal }) => executeActionClient<ReportWorkspaceSourceInfo>('report.workspace.source', sourceInput, { organizationId, signal }),
    });
    const updateTab = useCallback(
        (id: string, patch: Partial<ReportQueryTab>) => change(previous => ({ ...previous, tabs: previous.tabs.map(tab => (tab.id === id ? { ...tab, ...patch } : tab)) })),
        [change],
    );
    const selectTab = (id: string) => {
        editor.current?.flushSave();
        change(previous => ({ ...previous, activeTabId: id, tabs: previous.tabs.map(tab => (tab.id === id ? { ...tab, hidden: false } : tab)) }));
    };
    useEffect(() => {
        const originKey = `${reference.artifactId}:${reference.componentId ?? ''}`;
        if (focused.current === originKey) return;
        focused.current = originKey;
        setSelectedBlock(reference.componentId ?? '');
        const key = `report-workspace-origin:${draft.id ?? draft.documentId}`;
        try {
            if (sessionStorage.getItem(key) === originKey) return;
            sessionStorage.setItem(key, originKey);
        } catch {
            /* The persisted active tab remains usable without browser storage. */
        }
        const resultEntry = Object.entries(draft.results).find(([, result]) => result.evidence.artifactId === reference.artifactId);
        const origin = state.tabs.find(tab => tab.id === resultEntry?.[1].tabId) ?? state.tabs.find(tab => tab.sourceArtifactId === reference.artifactId);
        if (origin)
            change(previous => ({
                ...previous,
                activeTabId: origin.id,
                tabs: previous.tabs.map(tab =>
                    tab.id === origin.id
                        ? {
                              ...tab,
                              hidden: false,
                              ...(resultEntry ? { selectedResultId: resultEntry[0] } : tab.snapshotArtifactId === reference.artifactId ? { selectedResultId: 'snapshot' } : {}),
                          }
                        : tab,
                ),
            }));
    }, [change, draft.documentId, draft.id, draft.results, reference.artifactId, reference.componentId, state.tabs]);

    useEffect(() => () => Object.values(controllers.current).forEach(controller => controller.abort()), []);
    useLayoutEffect(() => {
        closeGuard.current = async () => {
            editor.current?.flushSave();
            try {
                await flush();
                return true;
            } catch {
                return false;
            }
        };
        return () => {
            closeGuard.current = null;
        };
    }, [closeGuard, flush]);
    const addTab = (duplicate = false) => {
        editor.current?.flushSave();
        const first = connections.data?.connections[0]?.connection;
        const id = `query_${crypto.randomUUID()}`;
        const tab: ReportQueryTab = {
            id,
            title: duplicate && active ? `${active.title} (${t('Copy')})` : t('NewQuery'),
            sql: duplicate && active ? (editor.current?.getValue() ?? active.sql) : '',
            hidden: false,
            componentIds: [],
            sourceArtifactId: source?.kind === 'attachment' ? (active?.sourceArtifactId ?? '') : '',
            source: source ?? (first ? { kind: 'database', connectionId: first.id, database: null, dialect: first.type } : undefined),
        };
        change(previous => ({ ...previous, tabs: [...previous.tabs, tab], activeTabId: id }));
    };
    const uiTabs = useMemo<UITabPayload[]>(
        () =>
            state.tabs
                .filter(tab => !tab.hidden)
                .map(tab => ({
                    tabId: tab.id,
                    tabName: tab.title,
                    tabType: 'sql',
                    content: tab.sql,
                    userId: draft.userId,
                    connectionId: tab.source?.kind === 'database' ? tab.source.connectionId : '',
                })),
        [state.tabs, draft.userId],
    );
    const resultIds = [
        ...new Set([
            ...(active?.resultIds ?? []),
            ...Object.entries(draft.results)
                .filter(([, result]) => result.tabId === active?.id || (!result.tabId && result.sourceArtifactId === active?.sourceArtifactId))
                .map(([id]) => id),
        ]),
    ];
    const snapshot = initial.sources.find(item => item.reference.artifactId === active?.snapshotArtifactId)?.evidence;
    const selectedResultId = active?.selectedResultId ?? (snapshot ? 'snapshot' : resultIds.at(-1));
    const selected = selectedResultId === 'snapshot' ? snapshot : selectedResultId ? draft.results[selectedResultId]?.evidence : undefined;
    const snapshotArtifact = useQuery({
        queryKey: ['workspace-snapshot-artifact', organizationId, snapshot?.artifactId],
        enabled: Boolean(snapshot),
        retry: false,
        queryFn: ({ signal }) => executeActionClient<{ sourceResultSetId: string | null }>('artifact.get', { artifactId: snapshot!.artifactId }, { organizationId, signal }),
    });
    const resultSetId = selectedResultId === 'snapshot' ? (snapshotArtifact.data?.sourceResultSetId ?? undefined) : selectedResultId;
    const resultChoices = [...(snapshot ? [{ id: 'snapshot', label: w('Snapshot') }] : []), ...resultIds.map((id, index) => ({ id, label: `${t('Result')} ${index + 1}` }))];
    const execution = useMutation({
        mutationFn: async ({ tab, sql, controller }: { tab: ReportQueryTab; sql: string; controller: AbortController }) => {
            await flush();
            const tabSource = tab.source ?? initial.sources.find(item => item.reference.artifactId === tab.sourceArtifactId)?.source;
            const result = await executeActionClient<ReportWorkspaceResult>(
                'report.workspace.execute',
                {
                    ...executionReference,
                    revision: draft.baseRevision,
                    artifactId: tab.sourceArtifactId,
                    tabId: tab.id,
                    sql,
                    requestId: crypto.randomUUID(),
                    workingDraft: true,
                    ...(tabSource?.kind === 'database' ? { connectionId: tabSource.connectionId, database: tabSource.database, schema: tabSource.schema } : {}),
                },
                { organizationId, signal: controller.signal },
            );
            controller.signal.throwIfAborted();
            const context = await executeActionClient<ReportAnalysisContext>(
                'report.workspace.analysis',
                { ...executionReference, revision: draft.baseRevision },
                { organizationId, signal: controller.signal },
            );
            return { tab, result, results: context.draft.results };
        },
        onSuccess: ({ tab, result, results }) => {
            rememberResults(results);
            const ids = result.sets.flatMap(set => (set.resultSetId && !set.error ? [set.resultSetId] : []));
            change(previous => ({
                ...previous,
                tabs: previous.tabs.map(item =>
                    item.id === tab.id ? { ...item, resultIds: [...(item.resultIds ?? []), ...ids], selectedResultId: ids[0] ?? item.selectedResultId } : item,
                ),
            }));
            setRunErrors(previous => ({ ...previous, [tab.id]: result.sets.flatMap(set => (set.error ? [set.error] : [])).join('\n') }));
        },
        onError: (failure, { tab, controller }) => setRunErrors(previous => ({ ...previous, [tab.id]: controller.signal.aborted ? w('Cancelled') : failure.message })),
        onSettled: (_data, _error, { tab }) => {
            delete controllers.current[tab.id];
            setRunning(previous => previous.filter(id => id !== tab.id));
        },
    });
    const run = () => {
        if (!active || busy || running.includes(active.id) || !sourceInfo.data?.available) return;
        const sql = editor.current?.getValue() ?? active.sql;
        updateTab(active.id, { sql });
        const controller = new AbortController();
        controllers.current[active.id] = controller;
        setRunning(previous => [...previous, active.id]);
        execution.mutate({ tab: { ...active, source }, sql, controller });
    };
    const safeError = error ?? (working.error ? workspaceErrorMessage(working.error, t('OperationFailed')) : undefined);
    const changes = useMemo(() => reportDraftChanges(state), [state]);
    const perform = async (action: () => Promise<void>) => {
        setBusy(true);
        setError(undefined);
        try {
            await action();
        } catch (failure) {
            setError(workspaceErrorMessage(failure, t('OperationFailed')));
        } finally {
            setBusy(false);
        }
    };
    const applyOperation = async (operation: ReportDraftOperation) => {
        if (operationLock.current) return;
        operationLock.current = true;
        await perform(async () => {
            editor.current?.flushSave();
            const next = await working.transact(saved =>
                executeActionClient<ReportWorkingDraft>(
                    'report.workspace.apply',
                    { documentId: draft.documentId, baseRevision: draft.baseRevision, expectedDraftRevision: saved.revision, operation },
                    { organizationId },
                ),
            );
            setPending(undefined);
            setCanvasSource(undefined);
            setReviewed(false);
            const id = operation.type === 'insert' ? operation.visual.id : operation.type === 'replace' ? operation.blockIds[0] : 'blockId' in operation ? operation.blockId : '';
            setSelectedBlock(id);
            setFeedback(
                t(
                    operation.type === 'undo' || operation.type === 'revert'
                        ? 'Undone'
                        : operation.type === 'insert'
                          ? 'AddedToDraft'
                          : operation.type === 'remove'
                            ? 'RemovedDraft'
                            : 'UpdatedDraft',
                ),
            );
            if (!withReportCanvas(next.state).canvas.blocks.length) setSelectedBlock('');
        });
        operationLock.current = false;
    };
    const choosePlacement = (value: ReportCanvasSource) => {
        if (busy || pending) return;
        setCanvasSource(structuredClone(value));
        setPanel(true);
        setExpanded(false);
        setError(undefined);
    };
    const place = (target: ReportDropTarget, value = canvasSource) => {
        if (!value || busy || pending) return;
        if (target.kind === 'gap') {
            void applyOperation({
                type: 'insert',
                resultId: value.resultId,
                visual: { id: `block_${crypto.randomUUID()}`, title: value.title, type: value.chartSpec ? 'chart' : 'table', chartSpec: value.chartSpec },
                anchorId: target.anchorId,
                position: target.position,
            });
        } else {
            const visual = state.content.visuals.find(item => item.id === target.blockId);
            const evidence =
                draft.results[value.resultId]?.evidence ??
                [...state.content.evidence, ...(state.baseline?.content.evidence ?? []), ...initial.sources.map(item => item.evidence)].find(
                    item => item.artifactId === value.artifactId,
                );
            if (!visual || !evidence || (value.chartSpec ? visual.type !== 'chart' : !['chart', 'table'].includes(visual.type))) return;
            setPending({ source: structuredClone(value), evidence, target: structuredClone(visual), fields: {} });
        }
    };
    const dragStart = (item: ReportDragItem) => {
        setDragItem(item);
        setPanel(true);
        setExpanded(false);
        if (item.kind === 'result') choosePlacement(item.source);
    };
    const dragEnd = (item: ReportDragItem, target?: ReportDropTarget) => {
        setDragItem(undefined);
        if (!target) {
            setCanvasSource(undefined);
            return;
        }
        if (item.kind === 'result') place(target, item.source);
        else if (target.kind === 'gap' && target.position !== 'end')
            void applyOperation({ type: 'move', blockId: item.blockId, anchorId: target.anchorId, position: target.position });
    };
    const save = () =>
        perform(async () => {
            change(previous => ({
                ...previous,
                proseNeedsReview: false,
                content: {
                    ...previous.content,
                    reviewedEvidenceGroupIds: previous.content.evidenceGroups?.filter(group => group.needsReview).map(group => group.id),
                    evidenceGroups: previous.content.evidenceGroups?.map(group => ({ ...group, needsReview: false })),
                },
            }));
            const saved = await flush();
            if (saveRequest.current?.revision !== saved.revision) saveRequest.current = { revision: saved.revision, id: crypto.randomUUID() };
            const next = await executeActionClient<WorkDocumentView & { draft: ReportWorkingDraft }>(
                'report.workspace.saveVersion',
                { documentId: draft.documentId, baseRevision: draft.baseRevision, expectedDraftRevision: saved.revision, requestId: saveRequest.current.id },
                { organizationId },
            );
            accept(next.draft);
            setReview(false);
            setFeedback(undefined);
            setReviewed(false);
            await client.invalidateQueries({ queryKey: ['work-document'] });
        });
    const openSavedQuery = (item: SavedQueryItem) =>
        perform(async () => {
            if (source?.kind !== 'database') return;
            editor.current?.flushSave();
            const id = `query_${crypto.randomUUID()}`;
            const database = typeof item.context?.database === 'string' ? item.context.database : source.database;
            const tab: ReportQueryTab = { id, title: item.title, sql: item.sqlText, source: { ...source, database }, sourceArtifactId: '', hidden: false, componentIds: [] };
            change(previous => ({ ...previous, tabs: [...previous.tabs, tab], activeTabId: id }));
            await flush();
            const resultSetId = item.historyResultSet?.resultSetId;
            if (resultSetId && item.historyResultSet?.dataAvailability === 'full') {
                const next = await executeActionClient<ReportWorkingDraft>(
                    'report.workspace.importResult',
                    { documentId: draft.documentId, baseRevision: draft.baseRevision, tabId: id, resultSetId },
                    { organizationId },
                );
                rememberResults(next.results);
                updateTab(id, { resultIds: [resultSetId], selectedResultId: resultSetId });
            }
        });
    const sourceContext =
        active && source
            ? {
                  reference: sourceInput,
                  title: active.title,
                  source: sourceInfo.data?.source ?? source,
                  evidence:
                      snapshot ??
                      selected ??
                      ({
                          artifactId: '',
                          title: active.title,
                          connectionId: null,
                          connectionName: null,
                          sql: active.sql,
                          capturedAt: '',
                          columns: [],
                          rows: [],
                          rowCount: null,
                          truncated: false,
                          runId: null,
                      } satisfies WorkEvidence),
              }
            : undefined;
    return (
        <ReportCanvasDnd
            onStart={dragStart}
            onEnd={dragEnd}
            onCancel={() => {
                setDragItem(undefined);
                setCanvasSource(undefined);
            }}
        >
            <div className="flex h-full min-h-0 flex-col bg-background" data-testid="report-workspace">
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label={w('Back')}
                        title={w('Back')}
                        onClick={() =>
                            void perform(async () => {
                                editor.current?.flushSave();
                                await flush();
                                router.push(
                                    reportWorkspaceReturnPath(organization, { ...reference, revision: state.baseline?.revision ?? reference.revision, publicationId: undefined }),
                                );
                            })
                        }
                    >
                        <ArrowLeft className="size-4" />
                    </Button>
                    <span className="max-w-[28vw] truncate font-medium" title={state.title}>
                        {state.title}
                    </span>
                    <span className="text-xs text-muted-foreground">{t('WorkspaceTitle')}</span>
                    <span className="text-xs text-muted-foreground">{t('Baseline', { revision: state.baseline?.revision ?? draft.baseRevision })}</span>
                    <span role="status" className="text-xs text-muted-foreground">
                        {working.saving || working.dirty ? t('Saving') : t('Saved')}
                    </span>
                    <div className="flex-1" />
                    <Button size="sm" variant="ghost" onClick={() => setPreview(true)}>
                        <Eye className="size-4" />
                        {t('Preview')}
                    </Button>
                    {!changes.length && <span className="text-xs text-muted-foreground">{t('ReportUnchanged')}</span>}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setPanel(true);
                            setShowChanges(true);
                        }}
                    >
                        {t('ChangeCount', { count: changes.length })}
                    </Button>
                    <Button
                        size="sm"
                        disabled={busy || !changes.length || Boolean(pending)}
                        onClick={() => {
                            setReview(true);
                            setReviewed(false);
                        }}
                    >
                        {t('ReviewSave')}
                    </Button>
                </div>
                {safeError && !panel && (
                    <p role="alert" className="border-b p-2 text-destructive">
                        {safeError}
                    </p>
                )}
                <SqlWorkspace
                    mode="report"
                    reportContext={{
                        reportId: draft.documentId,
                        draftId: draft.id ?? `${draft.documentId}:${draft.baseRevision}`,
                        baseRevision: state.baseline?.revision ?? draft.baseRevision,
                        originBlockId: reference.componentId,
                        originArtifactId: reference.artifactId,
                    }}
                    sidebar={{
                        tables: (
                            <div className="flex h-full min-h-0 flex-col">
                                <div className="space-y-2 border-b p-2">
                                    <ReportSelect
                                        aria-label={t('DataSource')}
                                        value={
                                            source?.kind === 'database'
                                                ? source.connectionId
                                                : source?.kind === 'attachment'
                                                  ? `attachment:${active?.sourceArtifactId}`
                                                  : '__attachment'
                                        }
                                        onValueChange={id => {
                                            const attachment = initial.sources.find(item => `attachment:${item.reference.artifactId}` === id && item.source.kind === 'attachment');
                                            if (active && attachment) updateTab(active.id, { source: attachment.source, sourceArtifactId: attachment.reference.artifactId });
                                            const connection = connections.data?.connections.find(item => item.connection.id === id)?.connection;
                                            if (active && connection)
                                                updateTab(active.id, { source: { kind: 'database', connectionId: id, database: null, dialect: connection.type } });
                                        }}
                                    >
                                        <SelectItem value="__attachment">{source?.kind === 'attachment' ? t('Attachment') : t('DataSource')}</SelectItem>
                                        {initial.sources
                                            .filter(item => item.source.kind === 'attachment')
                                            .map(item => (
                                                <SelectItem key={item.reference.artifactId} value={`attachment:${item.reference.artifactId}`}>
                                                    {item.evidence.title}
                                                </SelectItem>
                                            ))}
                                        {connections.data?.connections.map(item => (
                                            <SelectItem key={item.connection.id} value={item.connection.id}>
                                                {item.connection.name}
                                            </SelectItem>
                                        ))}
                                    </ReportSelect>
                                    {source?.kind === 'database' && (
                                        <ReportSelect
                                            aria-label={t('Database')}
                                            value={source.database ?? '__default'}
                                            onValueChange={database =>
                                                active && updateTab(active.id, { source: { ...source, database: database === '__default' ? null : database, schema: null } })
                                            }
                                        >
                                            <SelectItem value="__default">{t('DefaultDatabase')}</SelectItem>
                                            {databases.data?.databases.map(item => {
                                                const name = typeof item === 'string' ? item : (item.value ?? item.name ?? '');
                                                return (
                                                    <SelectItem key={name} value={name}>
                                                        {name}
                                                    </SelectItem>
                                                );
                                            })}
                                        </ReportSelect>
                                    )}
                                    {source?.kind === 'database' && Boolean(schemas.data?.length) && (
                                        <ReportSelect
                                            aria-label={t('Schema')}
                                            value={source.schema ?? '__default'}
                                            onValueChange={schema => active && updateTab(active.id, { source: { ...source, schema: schema === '__default' ? null : schema } })}
                                        >
                                            <SelectItem value="__default">{t('DefaultSchema')}</SelectItem>
                                            {schemas.data?.map(schema => (
                                                <SelectItem key={schema.value} value={schema.value}>
                                                    {schema.label}
                                                </SelectItem>
                                            ))}
                                        </ReportSelect>
                                    )}
                                </div>
                                {connections.error && (
                                    <p role="alert" className="p-2 text-sm text-destructive">
                                        {connections.error.message}
                                    </p>
                                )}
                                {sourceContext && (
                                    <ReportSourceSidebar
                                        context={sourceContext}
                                        info={sourceInfo.data}
                                        loading={sourceInfo.isFetching}
                                        error={sourceInfo.error?.message ?? databases.error?.message ?? schemas.error?.message}
                                        onRefresh={() => void sourceInfo.refetch()}
                                        organizationId={organizationId}
                                    />
                                )}
                            </div>
                        ),
                        queries: (
                            <div className="flex h-full min-h-0 flex-col">
                                <details className="border-b p-2">
                                    <summary className="cursor-pointer text-sm">{t('SessionQueries')}</summary>
                                    {state.tabs.map(tab => (
                                        <Button key={tab.id} variant="ghost" className="w-full justify-start" onClick={() => selectTab(tab.id)}>
                                            {tab.title}
                                        </Button>
                                    ))}
                                </details>
                                {source?.kind === 'database' && (
                                    <SavedQueriesSidebar key={source.connectionId} connectionId={source.connectionId} onSelect={item => void openSavedQuery(item)} />
                                )}
                            </div>
                        ),
                    }}
                    tabs={{
                        tabs: uiTabs,
                        activeTabId: active?.id ?? null,
                        setActiveTabId: selectTab,
                        addTab: () => addTab(),
                        closeTab: id => updateTab(id, { hidden: true }),
                        closeOtherTabs: id => change(previous => ({ ...previous, tabs: previous.tabs.map(tab => ({ ...tab, hidden: tab.id !== id })) })),
                        updateTab: (id, patch) => updateTab(id, { title: patch.tabName ?? t('NewQuery') }),
                        reorderTabs: (id, targetId) =>
                            change(previous => {
                                const tabs = [...previous.tabs];
                                const from = tabs.findIndex(tab => tab.id === id);
                                const to = tabs.findIndex(tab => tab.id === targetId);
                                if (from >= 0 && to >= 0) tabs.splice(to, 0, tabs.splice(from, 1)[0]);
                                return { ...previous, tabs };
                            }),
                    }}
                    rail={
                        <SqlWorkspacePanelToggle active={panel} label={t('Report')} onClick={() => setPanel(!panel)}>
                            <PanelRight />
                        </SqlWorkspacePanelToggle>
                    }
                    onRightPanelClose={() => setPanel(false)}
                    rightPanelLabel={t('Report')}
                    rightPanelFloating={Boolean(dragItem) || expanded}
                    rightPanelExpanded={expanded}
                    rightPanel={
                        panel ? (
                            <ReportCanvas
                                state={state}
                                source={canvasSource}
                                draggingBlock={dragItem?.kind === 'block' ? dragItem.blockId : undefined}
                                selectedId={selectedBlock}
                                onSelect={setSelectedBlock}
                                onPlace={place}
                                onCancel={() => {
                                    setCanvasSource(undefined);
                                    setError(undefined);
                                }}
                                onOperation={operation => void applyOperation(operation)}
                                busy={busy}
                                error={safeError}
                                notice={feedback}
                                onClose={() => setPanel(false)}
                                expanded={expanded}
                                onExpand={() => setExpanded(value => !value)}
                            />
                        ) : undefined
                    }
                >
                    {active ? (
                        <SqlQueryPane
                            toolbar={
                                <SqlQueryToolbar
                                    runLabel={w('Run')}
                                    running={running.includes(active.id)}
                                    disabled={busy || !sourceInfo.data?.available}
                                    onRun={run}
                                    onCancel={() => controllers.current[active.id]?.abort()}
                                    cancelLabel={w('Cancel')}
                                    actions={
                                        <Button size="sm" variant="ghost" onClick={() => addTab(true)}>
                                            <Copy />
                                            {t('DuplicateQuery')}
                                        </Button>
                                    }
                                />
                            }
                            editor={{
                                ref: editor,
                                tabs: uiTabs,
                                activeTab: uiTabs.find(tab => tab.tabId === active.id),
                                workspaceActive: true,
                                updateTab: (id, patch) => {
                                    if ('content' in patch) updateTab(id, { sql: patch.content });
                                },
                                onRunQuery: run,
                                onNewTab: () => addTab(),
                                sourceContext:
                                    source && source.kind !== 'unavailable'
                                        ? { connectionId: source.kind === 'database' ? source.connectionId : undefined, dialect: source.dialect }
                                        : undefined,
                            }}
                            results={
                                <SqlResults
                                    testId="report-workspace-result"
                                    tabs={<SqlResultTabs items={resultChoices} value={selectedResultId ?? ''} onChange={id => updateTab(active.id, { selectedResultId: id })} />}
                                    notice={
                                        runErrors[active.id] ? (
                                            <p role="alert" className="p-2 text-destructive">
                                                {workspaceErrorMessage(runErrors[active.id], t('ResultUnavailable'))}
                                            </p>
                                        ) : undefined
                                    }
                                    meta={{ runningRemote: running.includes(active.id), runningLocal: false, rowsReturned: selected?.rowCount ?? 0 }}
                                >
                                    {selected ? (
                                        <WorkspaceResult
                                            key={`${active.id}:${selectedResultId}`}
                                            resultSetId={resultSetId}
                                            evidence={selected}
                                            charts={state.charts?.filter(chart => chart.resultSetId === resultSetId) ?? []}
                                            onSaveChart={chart =>
                                                change(previous => ({ ...previous, charts: [...(previous.charts ?? []).filter(item => item.id !== chart.id), chart] }))
                                            }
                                            adoptedVisuals={state.content.visuals}
                                            baselineVisuals={state.baseline?.content.visuals ?? []}
                                            isSnapshot={selectedResultId === 'snapshot'}
                                            resultLabel={resultChoices.find(item => item.id === selectedResultId)?.label ?? t('Result')}
                                            onLocate={id => {
                                                setSelectedBlock(id);
                                                setPanel(true);
                                            }}
                                            onPlace={choosePlacement}
                                            reportSource={{
                                                resultId: selectedResultId === 'snapshot' ? `snapshot:${selected.artifactId}` : (resultSetId ?? ''),
                                                artifactId: selected.artifactId,
                                                tabTitle: active.title,
                                                resultLabel: resultChoices.find(item => item.id === selectedResultId)?.label ?? t('Result'),
                                                sourceLabel: selected.connectionName ?? t('Attachment'),
                                            }}
                                            disabled={busy || Boolean(pending)}
                                        />
                                    ) : (
                                        <p className="p-4 text-sm text-muted-foreground">{t('RunToExplore')}</p>
                                    )}
                                </SqlResults>
                            }
                        />
                    ) : (
                        <div className="p-4">
                            <Button onClick={() => addTab()}>
                                <Plus />
                                {t('NewQuery')}
                            </Button>
                        </div>
                    )}
                </SqlWorkspace>
                <ReportReplacementDialog
                    pending={pending}
                    onChange={setPending}
                    busy={busy}
                    error={safeError}
                    onApply={() =>
                        pending &&
                        void applyOperation({
                            type: 'replace',
                            resultId: pending.source.resultId,
                            blockIds: [pending.target.id],
                            chartSpec: pending.source.chartSpec,
                            fieldMappings: { [pending.target.id]: pending.fields },
                        })
                    }
                />
                <Dialog open={showChanges} onOpenChange={setShowChanges}>
                    <DialogContent className="max-h-[80vh] overflow-auto">
                        <DialogHeader>
                            <DialogTitle>{t('Changes')}</DialogTitle>
                            <DialogDescription>{t('ChangesDescription')}</DialogDescription>
                        </DialogHeader>
                        {!changes.length && <p className="text-sm text-muted-foreground">{t('NoChanges')}</p>}
                        {changes.map(item => (
                            <div key={item.id} className="flex items-center gap-2 rounded border p-3 text-sm">
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs text-muted-foreground">{t(item.type)}</p>
                                    <Button
                                        variant="link"
                                        className="h-auto max-w-full truncate p-0"
                                        onClick={() => {
                                            setSelectedBlock(item.id);
                                            setPanel(true);
                                            setShowChanges(false);
                                        }}
                                    >
                                        {item.title}
                                    </Button>
                                </div>
                                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void applyOperation({ type: 'revert', blockId: item.id })}>
                                    {t(item.type === 'remove' ? 'Restore' : 'Undo')}
                                </Button>
                            </div>
                        ))}
                        {safeError && (
                            <p role="alert" className="text-sm text-destructive">
                                {safeError}
                            </p>
                        )}
                    </DialogContent>
                </Dialog>
                <Dialog open={preview} onOpenChange={setPreview}>
                    <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-4xl">
                        <DialogHeader>
                            <DialogTitle>{t('Preview')}</DialogTitle>
                            <DialogDescription>{t('PreviewDescription')}</DialogDescription>
                        </DialogHeader>
                        <ReportBody title={state.title} content={state.content} onEvidence={() => undefined} previewOnly />
                    </DialogContent>
                </Dialog>
                <Dialog open={review} onOpenChange={setReview}>
                    <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-4xl">
                        <DialogHeader>
                            <DialogTitle>{t('ReviewSave')}</DialogTitle>
                            <DialogDescription>{t('ReviewDescription')}</DialogDescription>
                        </DialogHeader>
                        <ul className="space-y-1 text-sm">
                            {changes.map(item => (
                                <li key={item.id}>
                                    {t(item.type)}: {item.title}
                                </li>
                            ))}
                        </ul>
                        <ReportBody title={state.title} content={state.content} onEvidence={() => undefined} previewOnly />
                        <label className="flex gap-2 text-sm">
                            <input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />
                            {t('Reviewed')}
                        </label>
                        {safeError && (
                            <p role="alert" className="text-sm text-destructive">
                                {safeError}
                            </p>
                        )}
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setReview(false)}>
                                {w('Cancel')}
                            </Button>
                            <Button disabled={!reviewed || busy} onClick={() => void save()}>
                                {t('SaveVersion')}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </ReportCanvasDnd>
    );
}

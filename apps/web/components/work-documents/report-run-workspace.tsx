'use client';
import { ReportVersionRemoved } from './report-version-removed';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryStates, parseAsString } from 'nuqs';
import { diffLines } from 'diff';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal } from 'lucide-react';
import type { ReportEvidenceReference } from '@dory/shared/types/report-workspace';
import type { ReportResultPointer, ReportUpdateContext, ReportUpdateItem } from '@dory/shared/types/report-updates';
import AgentWorkspaceClient from '@/app/(app)/[organization]/[connectionId]/sql-console/agent-workspace-client';
import SqlConsoleLayout from '@/app/(app)/[organization]/[connectionId]/sql-console/layout';
import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';
import { AgentWorkspaceDrawer } from '@/components/agent-runs/agent-workspace-drawer';
import { executeActionClient } from '@/lib/actions/client';
import { normalizeSqlConsoleResultSnapshot } from '@/lib/client/sql-console-result-snapshot';
import { updateReady } from '@/lib/work-documents/report-updates';
import { reportWorkspaceParsers, reportWorkspaceReturnPath } from '@/lib/work-documents/workspace-url';
import { workRequest } from '@/lib/work-documents/client';
import { Button } from '@/registry/new-york-v4/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';
import { UpdateWorkspaceContext, type UpdatePanelControls } from './report-update-context';
import { useReportUpdateQueue } from './use-report-update-queue';

type Props = {
    organization: string;
    workId: string;
    connectionId: string;
    reference: ReportEvidenceReference;
    historical: boolean;
    section?: string;
    tabId?: string;
    defaultLayout?: number[];
};
type Notice = { reason: string } | { href: string };
const versionParams = { revision: reportWorkspaceParsers.revision, publication: reportWorkspaceParsers.publication, history: parseAsString };
export function ReportRunWorkspace(initialProps: Props) {
    const [version, setVersion] = useQueryStates(versionParams);
    const revision = version.revision ?? initialProps.reference.revision;
    const props = {
        ...initialProps,
        historical: version.history === '1' || Boolean(version.publication),
        reference: { ...initialProps.reference, revision, publicationId: version.publication ?? undefined },
    };
    const switchRevision = (revision: number) => {
        void setVersion({ revision, publication: null, history: null });
    };
    const t = useTranslations('ReportUpdates');
    const org = useOrganizationId();
    const [notice, setNotice] = useState<Notice>();
    const beforeClose = useRef<() => Promise<boolean>>(async () => true);
    const context = useQuery({
        queryKey: ['report-updates', org, props.reference.documentId, props.workId, revision],
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        staleTime: 0,
        gcTime: 0,
        queryFn: ({ signal }) =>
            executeActionClient<ReportUpdateContext>(
                'report.updates.get',
                { documentId: props.reference.documentId, workId: props.workId, revision },
                { organizationId: org, signal },
            ),
    });
    return (
        <AgentWorkspaceDrawer
            closeHref={reportWorkspaceReturnPath(props.organization, props.reference, props.historical)}
            preferBack={false}
            backLabel={t('Back')}
            title={t('Workspace')}
            onBeforeClose={() => beforeClose.current()}
        >
            {context.data && !context.isFetching ? (
                <Workspace
                    key={props.reference.documentId + ':' + revision}
                    {...props}
                    data={context.data}
                    switchRevision={switchRevision}
                    org={org}
                    beforeClose={beforeClose}
                    notice={notice}
                    setNotice={setNotice}
                />
            ) : context.error?.message === 'REPORT_VERSION_REMOVED' ? (
                <ReportVersionRemoved organization={props.organization} documentId={props.reference.documentId} />
            ) : (
                <p className="p-4" role={context.error ? 'alert' : 'status'}>
                    {context.error?.message ?? t('Loading')}
                </p>
            )}
        </AgentWorkspaceDrawer>
    );
}

function Workspace({
    data,
    org,
    beforeClose,
    switchRevision,
    notice,
    setNotice,
    ...props
}: Props & {
    data: ReportUpdateContext;
    org: string;
    switchRevision: (revision: number) => void;
    beforeClose: React.RefObject<() => Promise<boolean>>;
    notice?: Notice;
    setNotice: (notice: Notice) => void;
}) {
    const t = useTranslations('ReportUpdates');
    const router = useRouter(),
        client = useQueryClient();
    const { reference, workId, organization } = props;
    const readOnly = props.historical || data.latestRevision !== reference.revision;
    const queue = useReportUpdateQueue(data, workId, org, readOnly);
    const { state, change, items } = queue;
    const saveTabs = useRef<(() => Promise<void>) | null>(null);
    const tabs = useRef(new Map<string, { title: string; originalSql: string | null; sourceTabId: string }>());
    const initialized = useRef(false);
    const [restoredTabs, setRestoredTabs] = useState<Record<string, string>>({});
    const reportHref = reportWorkspaceReturnPath(organization, reference, props.historical);
    const reportTitle = data.document.title;
    const initial = data.bindings[reference.artifactId];
    const chartFor = (visualId?: string) => {
        const visual = data.document.content.visuals.find(v => v.id === visualId && v.type === 'chart');
        if (visual?.chartSpec) return visual.chartSpec;
        const chart = visual?.chart,
            y = chart?.yKey ?? chart?.yKeys?.[0]?.key;
        if (chart && y) return { version: 1 as const, chartType: chart.type === 'area' ? ('line' as const) : chart.type, xKey: chart.xKey, yKey: 'sum:' + y, groupKey: '__none__' };
    };
    const initialTarget = useMemo(
        () =>
            initial
                ? {
                      ...initial,
                      title: data.document.content.evidence.find(e => e.artifactId === reference.artifactId)?.title ?? t('Result'),
                      chart: chartFor(reference.componentId),
                  }
                : undefined,
        [initial, data.document.content, reference.componentId, reference.artifactId, t],
    );
    const evidence = data.document.content.evidence;
    const referenceConnection = evidence.find(item => item.artifactId === reference.artifactId)?.connectionId;
    const evidenceConnections = evidence.flatMap(item => {
        const connection = data.bindings[item.artifactId]?.connectionId ?? item.connectionId;
        return connection ? [connection] : [];
    });
    const connectionId =
        initial?.connectionId ?? referenceConnection ?? (evidenceConnections.includes(props.connectionId) ? props.connectionId : (evidenceConnections[0] ?? props.connectionId));
    const reportSources = useMemo(() => {
        const byTab = new Map<string, { database: string | null; schema?: string | null }>();
        let fallback: { database: string | null; schema?: string | null } | undefined;
        for (const evidence of data.document.content.evidence) {
            const binding = data.bindings[evidence.artifactId];
            if ((binding?.connectionId ?? evidence.connectionId) !== connectionId) continue;
            const database = binding?.database ?? evidence.sourceDatabaseName ?? null;
            const source = { database, schema: evidence.sourceSchemaName };
            if (database && (!fallback || evidence.artifactId === reference.artifactId)) fallback = source;
            if (!binding || !database) continue;
            if (!byTab.has(binding.tabId) || evidence.artifactId === reference.artifactId) byTab.set(binding.tabId, source);
        }
        for (const item of data.items) {
            const source = byTab.get(item.sourceTabId);
            if (source && !byTab.has(item.tabId)) byTab.set(item.tabId, source);
        }
        for (const [tabId, originalTabId] of Object.entries(restoredTabs)) {
            const source = byTab.get(originalTabId);
            if (source) byTab.set(tabId, source);
        }
        return { byTab, fallback };
    }, [connectionId, data.bindings, data.document.content.evidence, data.items, reference.artifactId, restoredTabs]);
    useEffect(() => {
        beforeClose.current = async () => {
            if (queue.busy) return false;
            try {
                await queue.flush();
                if (!readOnly) await saveTabs.current?.();
                return true;
            } catch (e) {
                queue.setError(String(e));
                return false;
            }
        };
        return () => {
            beforeClose.current = async () => true;
        };
    }, [queue, beforeClose, readOnly]);
    const edit = useCallback(
        (tabId: string, sql: string) => {
            const prior = state.current.find(item => item.tabId === tabId);
            const tab = tabs.current.get(tabId);
            if (!tab) return;
            if (prior) {
                tab.originalSql = prior.originalSql;
                tab.sourceTabId = prior.sourceTabId;
            }
            if (sql === tab.originalSql || (tab.originalSql === null && !sql.trim())) {
                if (prior) change(state.current.filter(item => item !== prior));
                return;
            }
            if (prior?.sql === sql && prior.title === tab.title) return;
            const next: ReportUpdateItem = { ...tab, tabId, id: prior?.id ?? crypto.randomUUID(), sql, results: [] };
            change(prior ? state.current.map(item => (item === prior ? next : item)) : [...state.current, next]);
        },
        [state, change],
    );

    const onTabs = useCallback(
        (incoming: { tabId: string; title: string; sql: string }[]) => {
            for (const { tabId, title, sql } of incoming) {
                const prior = state.current.find(item => item.tabId === tabId);
                const known = tabs.current.get(tabId);
                if (known) {
                    known.title = title;
                    if (prior && prior.title !== title) change(state.current.map(item => (item === prior ? { ...item, title } : item)));
                } else {
                    const originalSql = prior ? prior.originalSql : initialized.current ? null : sql;
                    tabs.current.set(tabId, { title, originalSql, sourceTabId: prior?.sourceTabId ?? tabId });
                    if (!prior && originalSql === null && sql.trim()) edit(tabId, sql);
                }
            }
            initialized.current = true;
        },
        [state, change, edit],
    );

    function restore(source: string, tabId: string) {
        setRestoredTabs(prev => (prev[tabId] === (prev[source] ?? source) ? prev : { ...prev, [tabId]: prev[source] ?? source }));
        const prior = state.current.find(item => item.tabId === source);
        const binding = Object.values(data.bindings).find(p => p.tabId === source);
        const known = tabs.current.get(tabId);
        tabs.current.set(tabId, {
            sourceTabId: prior?.sourceTabId ?? source,
            originalSql: prior ? prior.originalSql : (binding?.sql ?? known?.originalSql ?? null),
            title: prior?.title ?? known?.title ?? initialTarget?.title ?? t('Result'),
        });
        if (prior) change([...state.current.filter(item => item.tabId !== source && item.tabId !== tabId), { ...prior, tabId, results: [], executedSql: undefined }]);
        else if (binding) edit(tabId, binding.sql);
    }

    async function submit() {
        if (!items.length || !items.every(updateReady)) return;
        const saved = await queue.submit(async () => {
            await saveTabs.current?.();
        });
        if (!saved) return;
        if (saved.unchanged) {
            for (const item of items) {
                const tab = tabs.current.get(item.tabId);
                if (tab) tab.originalSql = item.sql;
            }
            setNotice({ reason: saved.reason || t('Unchanged') });
            return;
        }
        const href = reportWorkspaceReturnPath(organization, { ...reference, publicationId: undefined, revision: saved.revision });
        setNotice({ href });
        await Promise.all([
            client.invalidateQueries({ queryKey: ['work-document', organization, data.document.id] }),
            client.invalidateQueries({ queryKey: ['work-documents', organization] }),
        ]);
        switchRevision(saved.revision);
    }
    const leaveToReport = (href: string) => async (event: { preventDefault: () => void }) => {
        event.preventDefault();
        if (await beforeClose.current()) router.push(href);
    };
    const panel = ({ navigate, copy }: UpdatePanelControls) => (
        <aside className="flex h-full min-h-0 flex-col bg-card" data-testid="report-updates">
            <header className="flex items-start justify-between gap-2 border-b p-3">
                <div className="min-w-0">
                    <h2 className="font-semibold">{t('Title')}</h2>
                    <Link className="text-sm underline-offset-2 hover:underline" href={reportHref} onNavigate={leaveToReport(reportHref)}>
                        {reportTitle}
                        {data.document.version && ` · v${data.document.version}`} ↗
                    </Link>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button size="icon-sm" variant="ghost" aria-label={t('More')}>
                            <MoreHorizontal />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem onSelect={() => void copy().catch(e => queue.setError(e.message))}>{t('External')}</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </header>
            <div className="min-h-0 flex-1 overflow-auto p-3 space-y-3">
                {readOnly && (
                    <div className="text-sm">
                        {t('Historical')}{' '}
                        <Button variant="link" onClick={() => switchRevision(data.latestRevision)}>
                            {t('Latest')}
                        </Button>
                    </div>
                )}
                {!items.length && <p className="text-sm text-muted-foreground">{t('Empty')}</p>}
                {items.map(item => (
                    <section key={item.id} className="space-y-2 border-b pb-3 text-sm">
                        <button className="break-all text-left font-medium hover:underline" onClick={() => navigate({ ...item, result: item.results[0] })}>
                            {item.title}
                        </button>
                        <p className="text-muted-foreground">
                            {item.originalSql === null && t('NewTab') + ' · '}
                            {updateReady(item) ? t('Ran', { n: item.results.reduce((total, result) => total + result.rowCount, 0) }) : t('Pending')}
                        </p>
                        <SqlDiff before={item.originalSql ?? ''} after={item.sql} />
                    </section>
                ))}
            </div>
            <footer className="shrink-0 space-y-2 border-t p-3">
                {queue.error && (
                    <div role="alert" className="text-sm text-destructive">
                        {queue.error}{' '}
                        <Button
                            size="sm"
                            variant="link"
                            onClick={async () => {
                                try {
                                    const detail = await workRequest<{ document: { revision: number } }>('/api/work-documents/' + encodeURIComponent(data.document.id));
                                    if (detail.document.revision !== reference.revision) {
                                        switchRevision(detail.document.revision);
                                    } else {
                                        await client.invalidateQueries({ queryKey: ['report-updates', org, data.document.id, workId, reference.revision] });
                                    }
                                } catch (e) {
                                    queue.setError(String(e));
                                }
                            }}
                        >
                            {t('Latest')}
                        </Button>
                    </div>
                )}
                {notice && (
                    <p role="status" className="text-sm">
                        {'reason' in notice ? (
                            notice.reason
                        ) : (
                            <>
                                {t('Updated')} ·{' '}
                                <Link className="underline" href={notice.href} onNavigate={leaveToReport(notice.href)}>
                                    {t('ViewReport')}
                                </Link>
                            </>
                        )}
                    </p>
                )}
                <Button className="w-full" disabled={!items.length || !items.every(updateReady) || readOnly || queue.busy} onClick={() => void submit()}>
                    {queue.busy ? t('Updating') : t('Commit')}
                </Button>
            </footer>
        </aside>
    );
    return (
        <UpdateWorkspaceContext
            value={{
                workId,
                saveTabs,
                onRestoreTab: restore,
                onTabs,
                renderPanel: panel,
                onEdit: edit,
                onRunStart: tabId => {
                    change(state.current.map(item => (item.tabId === tabId ? { ...item, results: [], executedSql: undefined } : item)));
                },
                onExecution: (payload, sql) => {
                    const snapshot = normalizeSqlConsoleResultSnapshot(payload);
                    const { tabId, connectionId } = payload.session;
                    if (!snapshot || !tabId || !connectionId || snapshot.session.status !== 'success') return;
                    const results: ReportResultPointer[] = snapshot.resultSets.flatMap(set =>
                        set.resultSetId && set.status === 'success' && set.dataAvailability === 'full' && !set.limited
                            ? [
                                  {
                                      tabId,
                                      connectionId,
                                      sessionId: snapshot.session.sessionId,
                                      setIndex: set.setIndex,
                                      resultSetId: set.resultSetId,
                                      sql: set.sqlText ?? '',
                                      rowCount: set.rowCount ?? 0,
                                      database: set.sourceDatabaseName ?? payload.session.database ?? null,
                                  },
                              ]
                            : [],
                    );
                    if (!results.length || results.length !== snapshot.session.resultSetCount) return;
                    change(state.current.map(item => (item.tabId === tabId && item.sql === sql ? { ...item, executedSql: sql, results, needsReview: false } : item)));
                },
            }}
        >
            <div className="h-full min-h-0" inert={queue.busy}>
                <SqlConsoleLayout>
                    <AgentWorkspaceClient
                        organization={organization}
                        connectionId={connectionId}
                        workId={workId}
                        defaultLayout={props.defaultLayout}
                        initialResultTarget={initialTarget}
                        reportSources={reportSources}
                    />
                </SqlConsoleLayout>
            </div>
        </UpdateWorkspaceContext>
    );
}

function SqlDiff({ before, after }: { before: string; after: string }) {
    const changes = useMemo(
        () =>
            diffLines(before, after, { timeout: 40 }) ?? [
                { removed: true, added: false, value: before },
                { added: true, removed: false, value: after },
            ],
        [before, after],
    );
    return (
        <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
            {changes
                .filter(change => change.added || change.removed)
                .map((change, index) => (
                    <span key={index} className={change.added ? 'block text-primary' : 'block text-destructive'}>
                        {change.value
                            .replace(/\n$/, '')
                            .split('\n')
                            .map(line => (change.added ? '+ ' : '− ') + line)
                            .join('\n')}
                    </span>
                ))}
        </pre>
    );
}

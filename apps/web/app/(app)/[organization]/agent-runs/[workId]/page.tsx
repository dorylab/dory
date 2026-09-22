import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft, BrainCircuit, CheckCircle2, FileText, ListChecks } from 'lucide-react';

import { getDBService } from '@dory/database';
import { AgentRunActivitySection } from '@/components/agent-runs/agent-run-activity-section';
import { AgentRunStatusBadge } from '@/components/agent-runs/agent-run-status-badge';
import { FindingVerificationButton } from '@/components/agent-runs/finding-verification-button';
import { AgentRunVerifiedQueryButton } from '@/components/knowledge/agent-run-verified-query-button';
import { createAgentRunTextFormatter } from '@/lib/agent-runs/i18n';
import { buildAgentRunTimeline, getAgentRunActivitySummary, getAgentRunStats, getAgentRunSummary } from '@/lib/agent-runs/summary';
import { buildAgentWorkspacePathFromSnapshot, resolveAgentWorkspaceTarget } from '@/lib/agent-runs/workspace-url';
import { getAppBootstrapState } from '@/lib/server/app-bootstrap';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';

type FindingPresentation = {
    metricLabel?: string;
    metricValue?: string;
    metricUnit?: string;
    timeframe?: string;
    dimensions?: string[];
    facts?: Array<{ label: string; value: string }>;
};

type AgentRunFinding = {
    id: string;
    title: string;
    content: string | null;
    presentation: FindingPresentation | null;
    isPrimary: boolean;
    verifiedAt: Date | null;
    evidence: Array<{ id: string; title: string; type: string; rowCount: number | null }>;
};

function unique(values: string[]) {
    return [...new Set(values.filter(Boolean))];
}

function EvidenceCard({
    artifact,
    organization,
    workId,
    workspaceHref,
    sql,
    connectionId,
    labels,
}: {
    artifact: AgentRunFinding['evidence'][number];
    organization: string;
    workId: string;
    workspaceHref: string;
    sql: string | null;
    connectionId: string | null;
    labels: { viewResult: string; viewSql: string; rowCount: (count: number) => string };
}) {
    const artifactHref = `/${encodeURIComponent(organization)}/artifacts/${encodeURIComponent(artifact.id)}?fromAgentRun=${encodeURIComponent(workId)}`;

    return (
        <div className="grid min-w-0 gap-3 rounded-md border bg-muted/30 p-3">
            <div className="flex min-w-0 items-start gap-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                    <div className="line-clamp-2 break-words text-sm font-medium" title={artifact.title}>
                        {artifact.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                        {artifact.type}
                        {artifact.rowCount == null ? '' : ` · ${labels.rowCount(artifact.rowCount)}`}
                    </div>
                </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t pt-3">
                <Button asChild variant="outline" size="sm">
                    <Link href={artifactHref}>{labels.viewResult}</Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                    <Link href={workspaceHref}>{labels.viewSql}</Link>
                </Button>
                {sql && connectionId ? <AgentRunVerifiedQueryButton connectionId={connectionId} sql={sql} workId={workId} title={artifact.title} /> : null}
            </div>
        </div>
    );
}

export default async function AgentRunDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ organization: string; workId: string }>;
    searchParams: Promise<{ fromArtifact?: string }>;
}) {
    const [{ organization, workId }, { fromArtifact }] = await Promise.all([params, searchParams]);
    const [t, artifactsT] = await Promise.all([getTranslations('AgentRuns'), getTranslations('Artifacts')]);
    const formatter = createAgentRunTextFormatter(t);
    const bootstrap = await getAppBootstrapState({ organizationSlugOrId: organization });
    const userId = bootstrap.session?.user?.id ?? null;
    const organizationId = bootstrap.organization?.id ?? bootstrap.activeOrganizationId;

    if (!userId || !organizationId) redirect('/sign-in');

    const db = await getDBService();
    const [snapshot, events, connections, persistedFindings, artifacts, agentAssetUsage] = await Promise.all([
        db.works.getSnapshot({ organizationId, userId, workId }),
        db.works.listEvents({ organizationId, userId, workId }),
        db.connections.list(organizationId),
        db.works.listFindings({ organizationId, userId, workId }),
        db.artifacts.listByWork({ organizationId, workId }),
        db.works.listAgentAssetUsage({ organizationId, userId, workId }),
    ]);
    if (!snapshot) notFound();

    const workspaceHref = buildAgentWorkspacePathFromSnapshot(organization, snapshot);
    const connectionNames = new Map(connections.map(item => [item.connection.id, item.connection.name ?? item.connection.id]));
    const connectionName = snapshot.work.connectionId ? (connectionNames.get(snapshot.work.connectionId) ?? snapshot.work.connectionId) : null;
    const stats = getAgentRunStats(snapshot, connectionName, formatter);
    const summary = getAgentRunSummary(snapshot.work.metadata);
    const timeline = buildAgentRunTimeline(snapshot, events, formatter);
    const activitySummary = getAgentRunActivitySummary(snapshot, events, formatter);
    const hasWorkspace = Boolean(resolveAgentWorkspaceTarget(snapshot).connectionId);
    const backToArtifacts = Boolean(fromArtifact);
    const backHref = backToArtifacts ? `/${encodeURIComponent(organization)}/artifacts/${encodeURIComponent(fromArtifact!)}` : `/${encodeURIComponent(organization)}/agent-runs`;
    const backLabel = backToArtifacts ? `${artifactsT('Title')} · ${fromArtifact}` : t('List.Title');
    const findings = persistedFindings as AgentRunFinding[];
    const primaryFinding = findings.find(finding => finding.isPrimary) ?? findings[0] ?? null;
    const legacyConclusion = summary?.findings[0] ?? null;
    const conclusion = primaryFinding?.title ?? legacyConclusion;
    const definitionCount = agentAssetUsage.filter(item => item.assetKind === 'knowledge_definition').length;
    const resultSetCount = artifacts.filter(artifact => artifact.type === 'result_set').length;
    const referencedArtifactIds = new Set(findings.flatMap(finding => finding.evidence.map(artifact => artifact.id)));
    const otherArtifacts = artifacts.filter(artifact => !referencedArtifactIds.has(artifact.id));
    const inspectedTables = unique(
        events.flatMap(event => {
            if (!event.toolName.includes('explore_schema')) return [];
            const input = event.inputSummary;
            const table = input && typeof input.table === 'string' ? input.table : null;
            return table ? [table] : [];
        }),
    );
    const sqlByResultSetId = new Map(
        snapshot.sessions.flatMap(item =>
            item.queryResultSets.flatMap(resultSet => (resultSet.resultSetId && resultSet.sqlText ? [[resultSet.resultSetId, resultSet.sqlText] as const] : [])),
        ),
    );
    const traceSteps = unique(
        summary?.steps.length
            ? summary.steps
            : timeline
                  .filter(item => item.status !== 'error' && item.title !== formatter.eventTitle('created') && item.title !== formatter.eventTitle('finished'))
                  .map(item => item.title),
    );

    return (
        <div className="h-screen overflow-auto bg-n8">
            <main className="container mx-auto flex max-w-7xl flex-col gap-7 px-4 pb-10 pt-4 sm:px-6 lg:px-8">
                <header className="grid gap-5">
                    <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
                        <Link href={backHref}>
                            <ArrowLeft className="h-4 w-4" />
                            {backLabel}
                        </Link>
                    </Button>

                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                        <div className="min-w-0 max-w-4xl">
                            <div className="flex flex-wrap items-center gap-3">
                                <h1 className="text-2xl font-semibold tracking-normal">{summary?.summaryTitle || snapshot.work.title || t('Common.AgentRun')}</h1>
                                <AgentRunStatusBadge status={snapshot.work.status} />
                            </div>
                            {conclusion ? <p className="mt-3 max-w-3xl text-xl font-medium leading-snug sm:text-2xl">{conclusion}</p> : null}
                            <p className="mt-3 text-sm text-muted-foreground">
                                {[
                                    stats.dataSource,
                                    t('Detail.KnowledgeDefinitions', { count: definitionCount }),
                                    formatter.sqlRuns(stats.sqlExecutionCount),
                                    t('Detail.ResultSets', { count: resultSetCount }),
                                ].join(' · ')}
                            </p>
                        </div>
                        {hasWorkspace ? (
                            <Button asChild className="w-full sm:w-auto">
                                <Link href={workspaceHref}>{t('Actions.OpenWorkspace')}</Link>
                            </Button>
                        ) : (
                            <Button disabled>{t('Actions.OpenWorkspace')}</Button>
                        )}
                    </div>
                </header>

                <section className="grid gap-3">
                    <div>
                        <h2 className="text-base font-semibold">{t('Findings.Title')}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{t('Findings.Description')}</p>
                    </div>
                    {findings.length ? (
                        <div className="grid gap-4">
                            {findings.map(finding => (
                                <article
                                    key={finding.id}
                                    className="grid min-w-0 gap-6 rounded-lg border bg-card p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.72fr)] xl:gap-0"
                                >
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                {finding.presentation?.metricLabel ? (
                                                    <p className="text-sm font-medium text-muted-foreground">{finding.presentation.metricLabel}</p>
                                                ) : null}
                                                {finding.presentation?.metricValue ? (
                                                    <p className="mt-1 text-4xl font-semibold tracking-tight sm:text-5xl">
                                                        {finding.presentation.metricValue}
                                                        {finding.presentation.metricUnit ? (
                                                            <span className="ml-1 text-xl text-muted-foreground">{finding.presentation.metricUnit}</span>
                                                        ) : null}
                                                    </p>
                                                ) : (
                                                    <h3 className="text-lg font-semibold">{finding.title}</h3>
                                                )}
                                                {finding.presentation?.metricValue ? <h3 className="mt-2 text-base font-medium">{finding.title}</h3> : null}
                                            </div>
                                            <FindingVerificationButton findingId={finding.id} workId={workId} verifiedAt={finding.verifiedAt} />
                                        </div>
                                        {finding.presentation?.timeframe ? <p className="mt-3 text-sm text-muted-foreground">{finding.presentation.timeframe}</p> : null}
                                        {finding.presentation?.dimensions?.length ? (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {finding.presentation.dimensions.map(dimension => (
                                                    <Badge key={dimension} variant="secondary">
                                                        {dimension}
                                                    </Badge>
                                                ))}
                                            </div>
                                        ) : null}
                                        {finding.content ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{finding.content}</p> : null}
                                        {finding.presentation?.facts?.length ? (
                                            <dl className="mt-5 grid gap-3 sm:grid-cols-3">
                                                {finding.presentation.facts.map(fact => (
                                                    <div key={fact.label} className="rounded-md bg-muted/50 px-3 py-2">
                                                        <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                                                        <dd className="mt-1 text-sm font-semibold">{fact.value}</dd>
                                                    </div>
                                                ))}
                                            </dl>
                                        ) : null}
                                    </div>
                                    <div className="grid min-w-0 content-start gap-3 border-t pt-5 xl:border-t-0 xl:pl-6 xl:pt-0">
                                        <h3 className="text-sm font-semibold">{t('Findings.Evidence')}</h3>
                                        {finding.evidence.length ? (
                                            finding.evidence.map(artifact => (
                                                <EvidenceCard
                                                    key={artifact.id}
                                                    artifact={artifact}
                                                    organization={organization}
                                                    workId={workId}
                                                    workspaceHref={workspaceHref}
                                                    sql={sqlByResultSetId.get(artifacts.find(item => item.id === artifact.id)?.sourceResultSetId ?? '') ?? null}
                                                    connectionId={artifacts.find(item => item.id === artifact.id)?.connectionId ?? null}
                                                    labels={{
                                                        viewResult: t('Findings.ViewResult'),
                                                        viewSql: t('Findings.ViewSql'),
                                                        rowCount: count => t('Counts.Rows', { count }),
                                                    }}
                                                />
                                            ))
                                        ) : (
                                            <p className="text-sm text-muted-foreground">{t('Findings.NoEvidence')}</p>
                                        )}
                                    </div>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-lg border border-dashed px-5 py-8 text-sm text-muted-foreground">{t('Findings.Empty')}</div>
                    )}
                </section>

                {agentAssetUsage.length || inspectedTables.length ? (
                    <section className="grid gap-3">
                        <div>
                            <h2 className="text-base font-semibold">{t('Context.Title')}</h2>
                            <p className="mt-1 text-sm text-muted-foreground">{t('Context.Description')}</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {agentAssetUsage.map(item => {
                                const asset = item.assetSnapshot as { title?: string; knowledgeModelName?: string; deepLink?: string };
                                const content = (
                                    <>
                                        <BrainCircuit className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-medium">{asset.title ?? item.assetRef}</span>
                                            <span className="block truncate text-xs text-muted-foreground">
                                                {t(`Context.Kinds.${item.assetKind}`)}
                                                {asset.knowledgeModelName ? ` · ${asset.knowledgeModelName}` : ''}
                                            </span>
                                        </span>
                                    </>
                                );
                                return asset.deepLink ? (
                                    <Link key={item.assetRef} href={asset.deepLink} className="flex min-w-0 items-center gap-3 rounded-md border bg-card p-3 hover:bg-accent">
                                        {content}
                                    </Link>
                                ) : (
                                    <div key={item.assetRef} className="flex min-w-0 items-center gap-3 rounded-md border bg-card p-3">
                                        {content}
                                    </div>
                                );
                            })}
                            {inspectedTables.map(table => (
                                <div key={`table-${table}`} className="flex min-w-0 items-center gap-3 rounded-md border bg-card p-3">
                                    <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-medium">{table}</span>
                                        <span className="block truncate text-xs text-muted-foreground">
                                            {t('Context.Table')}
                                            {connectionName ? ` · ${connectionName}` : ''}
                                        </span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null}

                {otherArtifacts.length ? (
                    <section className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{t('Findings.OtherOutputs')}</span>
                        {otherArtifacts.map(artifact => (
                            <Link
                                key={artifact.id}
                                href={`/${encodeURIComponent(organization)}/artifacts/${encodeURIComponent(artifact.id)}?fromAgentRun=${encodeURIComponent(workId)}`}
                                className="text-sm text-primary hover:underline"
                            >
                                {artifact.title}
                            </Link>
                        ))}
                    </section>
                ) : null}

                <section className="grid gap-3">
                    <div>
                        <h2 className="text-base font-semibold">{t('Trace.Title')}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{t('Trace.Description')}</p>
                    </div>
                    <div className="grid gap-3 rounded-lg border bg-card p-4 sm:p-5">
                        {traceSteps.length ? (
                            traceSteps.map((step, index) => (
                                <div key={`${index}-${step}`} className="flex items-start gap-3 text-sm">
                                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                    <span>{step}</span>
                                </div>
                            ))
                        ) : (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <ListChecks className="h-4 w-4" />
                                {t('Trace.Empty')}
                            </div>
                        )}
                    </div>
                </section>

                <AgentRunActivitySection items={timeline} summary={activitySummary} />
            </main>
        </div>
    );
}

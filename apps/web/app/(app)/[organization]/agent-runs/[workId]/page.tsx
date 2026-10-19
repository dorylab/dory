import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { ArrowLeft, ArrowUpRight, BarChart3, BrainCircuit, Database, FileText, ListChecks } from 'lucide-react';

import { getDBService } from '@dory/database';
import { AgentRunActivitySection } from '@/components/agent-runs/agent-run-activity-section';
import { AgentRunStatusBadge } from '@/components/agent-runs/agent-run-status-badge';
import { FindingDetails } from '@/components/agent-runs/finding-details';
import { FindingVerificationButton } from '@/components/agent-runs/finding-verification-button';
import { AgentRunEvidence } from '@/components/agent-runs/agent-run-evidence';
import { getSupportingFacts, orderReportFindings, shouldShowHeadlineMetric } from '@/lib/agent-runs/report';
import { createAgentRunTextFormatter } from '@/lib/agent-runs/i18n';
import { buildAgentRunTimeline, getAgentRunActivitySummary, getAgentRunStats, getAgentRunSummary } from '@/lib/agent-runs/summary';
import { buildAgentWorkspacePathFromSnapshot, resolveAgentWorkspaceTarget } from '@/lib/agent-runs/workspace-url';
import { getAppBootstrapState } from '@/lib/server/app-bootstrap';
import { Button } from '@/registry/new-york-v4/ui/button';

function unique(values: string[]) {
    return [...new Set(values.filter(Boolean))];
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
    const dateFormatter = await getFormatter();
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
    const findings = orderReportFindings(persistedFindings);
    const primaryFinding = findings.find(finding => finding.isPrimary) ?? findings[0] ?? null;
    const title = (findings.length ? snapshot.work.title : summary?.summaryTitle) || snapshot.work.title || t('Common.AgentRun');
    const artifactById = new Map(artifacts.map(artifact => [artifact.id, artifact]));
    const resultSetCount = artifacts.filter(artifact => artifact.type === 'result_set').length;
    const referencedArtifactIds = new Set(findings.flatMap(finding => finding.evidence.map(artifact => artifact.id)));
    const unlinkedResults = artifacts.filter(artifact => artifact.type === 'result_set' && !referencedArtifactIds.has(artifact.id));
    const otherArtifacts = artifacts.filter(artifact => artifact.type !== 'result_set' && !referencedArtifactIds.has(artifact.id));
    const inspectedTables = unique(
        events.flatMap(event => {
            if (!event.toolName.includes('explore_schema')) return [];
            const input = event.inputSummary;
            const table = input && typeof input.table === 'string' ? input.table : null;
            return table ? [table] : [];
        }),
    );
    const traceSteps = unique(
        summary?.steps.length
            ? summary.steps
            : timeline
                  .filter(item => item.status !== 'error' && item.title !== formatter.eventTitle('created') && item.title !== formatter.eventTitle('finished'))
                  .map(item => item.title),
    );

    return (
        <div className="min-h-full shrink-0 bg-n8 text-foreground">
            <main className="container mx-auto flex max-w-6xl flex-col gap-8 px-4 py-6 sm:px-6 sm:pb-12 sm:pt-8 lg:px-8">
                <header className="grid gap-4">
                    <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit min-w-0 max-w-full justify-start">
                        <Link href={backHref}>
                            <ArrowLeft className="h-4 w-4" />
                            <span className="min-w-0 truncate">{backLabel}</span>
                            {connectionName ? <span className="max-w-64 truncate text-muted-foreground">/ {connectionName}</span> : null}
                        </Link>
                    </Button>

                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                        <div className="min-w-0 max-w-4xl">
                            <div className="flex flex-wrap items-center gap-3">
                                <h1 className="min-w-0 break-words text-2xl font-semibold leading-tight tracking-normal">{title}</h1>
                                <AgentRunStatusBadge status={snapshot.work.status} />
                            </div>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                {[
                                    dateFormatter.dateTime(snapshot.work.createdAt, { year: 'numeric', month: 'short', day: 'numeric' }),
                                    formatter.sqlRuns(stats.sqlExecutionCount),
                                    t('Detail.ResultSets', { count: resultSetCount }),
                                ].join(' · ')}
                            </p>
                        </div>
                        {hasWorkspace ? (
                            <Button asChild className="w-full justify-self-start sm:w-auto">
                                <Link href={workspaceHref}>
                                    {t('Report.ContinueWorkspace')}
                                    <ArrowUpRight className="h-4 w-4" />
                                </Link>
                            </Button>
                        ) : (
                            <Button disabled className="w-full justify-self-start sm:w-auto">
                                {t('Report.ContinueWorkspace')}
                            </Button>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">{t(hasWorkspace ? 'Report.WorkspaceHint' : 'Report.WorkspaceUnavailable')}</p>
                </header>

                <section className="grid gap-4" aria-labelledby="findings-heading">
                    <h2 id="findings-heading" className="text-sm font-medium text-muted-foreground">
                        {t('Findings.Title')}
                    </h2>
                    {findings.length ? (
                        <div className="grid gap-6">
                            {findings.map(finding => {
                                const facts = getSupportingFacts(finding.presentation);
                                return (
                                    <article key={finding.id} id={`finding-${finding.id}`} className="min-w-0 overflow-hidden rounded-xl border bg-card">
                                        <div className="p-5 sm:p-7">
                                            {shouldShowHeadlineMetric(finding.title, finding.presentation) && finding.presentation ? (
                                                <div className="mb-4">
                                                    {finding.presentation.metricLabel ? (
                                                        <p className="mb-2 text-sm text-muted-foreground">{finding.presentation.metricLabel}</p>
                                                    ) : null}
                                                    <p
                                                        className={`font-semibold tracking-tight tabular-nums ${finding.id === primaryFinding?.id ? 'text-4xl sm:text-5xl' : 'text-3xl'}`}
                                                    >
                                                        {finding.presentation.metricValue}
                                                        {finding.presentation.metricUnit ? (
                                                            <span className="ml-1 text-xl text-muted-foreground">{finding.presentation.metricUnit}</span>
                                                        ) : null}
                                                    </p>
                                                </div>
                                            ) : null}
                                            {finding.title.trim() !== title.trim() ? (
                                                <h3
                                                    className={`break-words font-semibold leading-relaxed ${finding.id === primaryFinding?.id ? 'text-xl sm:text-2xl' : 'text-lg'}`}
                                                >
                                                    {finding.title}
                                                </h3>
                                            ) : null}
                                            <FindingDetails
                                                content={finding.content?.trim() !== finding.title.trim() ? finding.content : null}
                                                presentation={finding.presentation ? { ...finding.presentation, facts } : null}
                                                labels={{ legacyData: t('Findings.LegacyData'), legacyDescription: t('Findings.LegacyDescription') }}
                                            />
                                            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
                                                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                                    <Database className="h-3.5 w-3.5" />
                                                    {t(finding.evidence.length ? 'Findings.EvidenceLinked' : 'Findings.EvidenceMissing')}
                                                </span>
                                                <FindingVerificationButton
                                                    findingId={finding.id}
                                                    workId={workId}
                                                    verifiedAt={finding.verifiedAt}
                                                    verifiedByName={finding.verifiedByName ?? finding.verifiedByUserId}
                                                />
                                            </div>
                                        </div>
                                        <div className="grid min-w-0 gap-5 border-t bg-muted/10 p-5 sm:p-7">
                                            <h3 className="text-sm font-semibold">{t('Findings.Evidence')}</h3>
                                            {finding.evidence.length ? (
                                                finding.evidence.map(artifact => (
                                                    <AgentRunEvidence
                                                        key={artifact.id}
                                                        artifact={{ ...artifact, sourceResultSetId: artifactById.get(artifact.id)?.sourceResultSetId }}
                                                        organization={organization}
                                                        workId={workId}
                                                    />
                                                ))
                                            ) : (
                                                <p className="text-sm text-muted-foreground">{t('Findings.NoEvidence')}</p>
                                            )}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    ) : summary?.findings.length ? (
                        <div className="space-y-3 rounded-lg border bg-card p-5">
                            {summary.findings
                                .filter(finding => finding.trim() !== title.trim())
                                .map((finding, index) => (
                                    <p key={index} className="text-sm leading-7">
                                        {finding}
                                    </p>
                                ))}
                            <p className="text-xs text-muted-foreground">{t('Findings.NoEvidence')}</p>
                        </div>
                    ) : (
                        <p className="rounded-lg border border-dashed px-5 py-8 text-sm text-muted-foreground">
                            {t(stats.sqlExecutionCount === 0 ? 'Findings.NoAnalysis' : 'Findings.Empty')}
                        </p>
                    )}
                </section>

                {unlinkedResults.length ? (
                    <section className="grid gap-4">
                        <div>
                            <h2 className="text-base font-semibold">{t('Report.OtherResults')}</h2>
                            <p className="mt-1 text-sm text-muted-foreground">{t('Report.OtherResultsHint')}</p>
                        </div>
                        {unlinkedResults.map(artifact => (
                            <div key={artifact.id} className="min-w-0 rounded-lg border bg-card p-5">
                                <AgentRunEvidence artifact={artifact} organization={organization} workId={workId} />
                            </div>
                        ))}
                    </section>
                ) : null}

                {agentAssetUsage.length || inspectedTables.length ? (
                    <section className="grid gap-3">
                        <div>
                            <h2 className="text-base font-semibold">{t('Context.Title')}</h2>
                            <p className="mt-1 text-sm text-muted-foreground">{t('Context.Description')}</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {agentAssetUsage.length ? (
                                <h3 className="text-xs font-medium text-muted-foreground sm:col-span-2 xl:col-span-3">{t('Report.BusinessKnowledge')}</h3>
                            ) : null}
                            {agentAssetUsage.map(item => {
                                const asset = item.assetSnapshot as {
                                    title?: string;
                                    knowledgeModelName?: string;
                                    deepLink?: string;
                                    ossieVersion?: string;
                                    modelRevision?: string;
                                    metricNames?: string[];
                                    relationshipNames?: string[];
                                };
                                // Snapshots retain organization IDs; use the current route's slug for navigation.
                                const assetHref = asset.deepLink?.startsWith('/') ? asset.deepLink.replace(/^\/[^/]+\//, `/${encodeURIComponent(organization)}/`) : null;
                                const content = (
                                    <>
                                        <BrainCircuit className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                        <span className="min-w-0">
                                            <span className="block break-words text-sm font-medium">{asset.title ?? item.assetRef}</span>
                                            <span className="block break-words text-xs leading-5 text-muted-foreground">
                                                {t(`Context.Kinds.${item.assetKind}`)}
                                                {asset.knowledgeModelName && asset.knowledgeModelName !== asset.title ? ` · ${asset.knowledgeModelName}` : ''}
                                                {asset.ossieVersion ? ` · Ossie ${asset.ossieVersion}` : ''}
                                                {asset.modelRevision ? ` · rev ${asset.modelRevision.slice(0, 8)}` : ''}
                                            </span>
                                            {item.assetKind === 'semantic_model' ? (
                                                <span className="mt-2 block text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                                                    {t('Context.AutomaticallyApplied')}
                                                    {asset.metricNames?.length ? ` · ${asset.metricNames.join(', ')}` : ''}
                                                    {asset.relationshipNames?.length ? ` · ${asset.relationshipNames.join(', ')}` : ''}
                                                </span>
                                            ) : null}
                                        </span>
                                    </>
                                );
                                return assetHref ? (
                                    <Link key={item.assetRef} href={assetHref} className="flex min-w-0 items-start gap-3 rounded-lg border bg-card p-4 hover:bg-accent">
                                        {content}
                                    </Link>
                                ) : (
                                    <div key={item.assetRef} className="flex min-w-0 items-start gap-3 rounded-lg border bg-card p-4">
                                        {content}
                                    </div>
                                );
                            })}
                            {inspectedTables.length ? (
                                <h3 className="mt-2 text-xs font-medium text-muted-foreground sm:col-span-2 xl:col-span-3">{t('Report.DataSources')}</h3>
                            ) : null}
                            {inspectedTables.map(table => (
                                <div key={`table-${table}`} className="flex min-w-0 items-start gap-3 rounded-lg border bg-card p-4">
                                    <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-medium">{table}</span>
                                        <span className="block break-words text-xs leading-5 text-muted-foreground">
                                            {t('Report.InspectedTable')}
                                            {connectionName ? ` · ${connectionName}` : ''}
                                        </span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null}

                <section className="grid gap-3">
                    <div>
                        <h2 className="text-base font-semibold">{t('Trace.Title')}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{t(summary?.steps.length ? 'Report.AgentStepsHint' : 'Report.RecordedStepsHint')}</p>
                    </div>
                    <div className="grid gap-3 rounded-lg border bg-card p-4 sm:p-5">
                        {traceSteps.length ? (
                            traceSteps.map((step, index) => (
                                <div key={`${index}-${step}`} className="flex items-start gap-3 text-sm">
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs tabular-nums text-muted-foreground">
                                        {index + 1}
                                    </span>
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

                {otherArtifacts.length ? (
                    <section className="grid gap-3">
                        <h2 className="text-base font-semibold">
                            {t('Findings.OtherOutputs')} <span className="ml-2 text-sm font-normal text-muted-foreground">{otherArtifacts.length}</span>
                        </h2>
                        <div className="divide-y rounded-lg border bg-card px-4">
                            {otherArtifacts.map(artifact => (
                                <Link
                                    key={artifact.id}
                                    href={`/${encodeURIComponent(organization)}/artifacts/${encodeURIComponent(artifact.id)}?fromAgentRun=${encodeURIComponent(workId)}`}
                                    className="flex items-center gap-3 py-4 hover:text-primary"
                                >
                                    {artifact.type === 'chart' ? (
                                        <BarChart3 className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    ) : (
                                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    )}
                                    <span className="min-w-0 flex-1">
                                        <span className="block break-words text-sm font-medium">{artifact.title}</span>
                                        <span className="text-xs text-muted-foreground">{artifactsT(`Viewer.Types.${artifact.type}`)}</span>
                                    </span>
                                    <ArrowUpRight className="h-4 w-4 shrink-0" />
                                </Link>
                            ))}
                        </div>
                    </section>
                ) : null}

                <AgentRunActivitySection items={timeline} summary={activitySummary} />
            </main>
        </div>
    );
}

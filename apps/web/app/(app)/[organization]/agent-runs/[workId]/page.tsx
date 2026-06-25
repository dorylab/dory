import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Database, PanelTop, TerminalSquare } from 'lucide-react';

import { getDBService } from '@dory/database';
import { AgentRunActivitySection } from '@/components/agent-runs/agent-run-activity-section';
import {
    getAgentRunActivitySummary,
    buildAgentRunTimeline,
    getAgentRunStats,
    getAgentRunStatusLabel,
    getAgentRunStatusVariant,
    getAgentRunSummary,
} from '@/lib/agent-runs/summary';
import { buildAgentWorkspacePathFromSnapshot, resolveAgentWorkspaceTarget } from '@/lib/agent-runs/workspace-url';
import { getAppBootstrapState } from '@/lib/server/app-bootstrap';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';

function formatDate(value: Date | string | null | undefined) {
    if (!value) return 'Never';
    const date = value instanceof Date ? value : new Date(value);
    return date.toLocaleString();
}

function Metric({ icon: Icon, label, value }: { icon: typeof Database; label: string; value: string | number }) {
    return (
        <div className="flex min-w-0 items-start gap-3 rounded-md border bg-card px-4 py-3">
            <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
                <div className="mt-1 truncate text-sm font-semibold">{value}</div>
            </div>
        </div>
    );
}

export default async function AgentRunDetailPage({ params }: { params: Promise<{ organization: string; workId: string }> }) {
    const { organization, workId } = await params;
    const bootstrap = await getAppBootstrapState({ organizationSlugOrId: organization });
    const userId = bootstrap.session?.user?.id ?? null;
    const organizationId = bootstrap.organization?.id ?? bootstrap.activeOrganizationId;

    if (!userId || !organizationId) {
        redirect('/sign-in');
    }

    const db = await getDBService();
    const [snapshot, events, connections] = await Promise.all([
        db.works.getSnapshot({ organizationId, userId, workId }),
        db.works.listEvents({ organizationId, userId, workId }),
        db.connections.list(organizationId),
    ]);
    if (!snapshot) notFound();

    const workspaceHref = buildAgentWorkspacePathFromSnapshot(organization, snapshot);
    const connectionNames = new Map(connections.map(item => [item.connection.id, item.connection.name ?? item.connection.id]));
    const connectionName = snapshot.work.connectionId ? (connectionNames.get(snapshot.work.connectionId) ?? snapshot.work.connectionId) : null;
    const stats = getAgentRunStats(snapshot, connectionName);
    const summary = getAgentRunSummary(snapshot.work.metadata);
    const timeline = buildAgentRunTimeline(snapshot, events);
    const activitySummary = getAgentRunActivitySummary(snapshot, events);
    const hasWorkspace = Boolean(resolveAgentWorkspaceTarget(snapshot).connectionId);
    const hasSummary = Boolean(summary && (summary.findings.length || summary.steps.length));

    return (
        <div className="bg-n8 h-screen overflow-auto">
            <main className="container mx-auto mt-10 flex flex-col gap-7 p-12 lg:p-12 xl:p-8 2xl:p-4">
                <header className="flex flex-col gap-5">
                    <div className="flex items-center justify-between gap-4">
                        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
                            <Link href={`/${organization}/agent-runs`}>
                                <ArrowLeft className="h-4 w-4" />
                                Agent Runs
                            </Link>
                        </Button>
                        {hasWorkspace ? (
                            <Button asChild>
                                <Link href={workspaceHref}>Open Workspace</Link>
                            </Button>
                        ) : (
                            <Button disabled>Open Workspace</Button>
                        )}
                    </div>

                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">Agent Run</div>
                            <h1 className="max-w-3xl text-2xl font-semibold tracking-normal">{summary?.summaryTitle || snapshot.work.title || 'Agent Run'}</h1>
                        </div>
                        <Badge variant={getAgentRunStatusVariant(snapshot.work.status)}>{getAgentRunStatusLabel(snapshot.work.status)}</Badge>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                        <Metric icon={Database} label="Data source" value={stats.dataSource} />
                        <Metric icon={PanelTop} label="Tabs created" value={stats.tabCount} />
                        <Metric icon={TerminalSquare} label="SQL runs" value={stats.sqlExecutionCount} />
                        <Metric icon={CheckCircle2} label="Last active" value={formatDate(stats.lastActiveAt)} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                        This run generated a workspace with {stats.tabCount.toLocaleString()} {stats.tabCount === 1 ? 'tab' : 'tabs'} and{' '}
                        {stats.sqlExecutionCount.toLocaleString()} {stats.sqlExecutionCount === 1 ? 'SQL run' : 'SQL runs'}. Open the workspace to inspect, edit, and continue the generated SQL
                        analysis.
                    </p>
                </header>

                <section className="grid gap-3">
                    <div>
                        <h2 className="text-base font-semibold">Run summary</h2>
                        <p className="mt-1 text-sm text-muted-foreground">A readable summary of the agent&apos;s findings and execution steps.</p>
                    </div>
                    <div className="rounded-lg border bg-card p-5">
                        {hasSummary ? (
                            <div className="grid gap-6 md:grid-cols-2">
                                <section className="grid content-start gap-3">
                                    <h3 className="text-sm font-semibold">Findings</h3>
                                    {summary?.findings.length ? (
                                        <ul className="grid gap-3">
                                            {summary.findings.map((item, itemIndex) => (
                                                <li key={`finding-${itemIndex}-${item}`} className="flex gap-3 text-sm">
                                                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                                    <span>{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">No findings generated yet.</div>
                                    )}
                                </section>
                                <section className="grid content-start gap-3">
                                    <h3 className="text-sm font-semibold">Steps</h3>
                                    {summary?.steps.length ? (
                                        <ul className="grid gap-3">
                                            {summary.steps.map((item, itemIndex) => (
                                                <li key={`step-${itemIndex}-${item}`} className="flex gap-3 text-sm">
                                                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                                    <span>{item}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">No execution steps recorded yet.</div>
                                    )}
                                </section>
                            </div>
                        ) : (
                            <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                                No summary generated for this run. Open the workspace to inspect generated SQL and results.
                            </div>
                        )}
                    </div>
                </section>

                <AgentRunActivitySection items={timeline} summary={activitySummary} />
            </main>
        </div>
    );
}

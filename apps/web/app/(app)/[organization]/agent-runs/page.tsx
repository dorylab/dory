import { redirect } from 'next/navigation';
import { Bot } from 'lucide-react';

import { getDBService } from '@dory/database';
import { getAgentRunOutputLabel, getAgentRunStatusLabel, getAgentRunStatusVariant, getAgentRunSummaryPreview } from '@/lib/agent-runs/summary';
import { buildAgentRunDetailPath, buildAgentWorkspacePathFromSnapshot, resolveAgentWorkspaceTarget } from '@/lib/agent-runs/workspace-url';
import { getAppBootstrapState } from '@/lib/server/app-bootstrap';
import { AgentRunsTable, type AgentRunListItem } from './agent-runs-table';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function formatDate(value: Date | string | null | undefined) {
    if (!value) return 'Never';
    const date = value instanceof Date ? value : new Date(value);
    return date.toLocaleString();
}

function parsePage(value: string | string[] | undefined) {
    const raw = Array.isArray(value) ? value[0] : value;
    const parsed = Number(raw ?? 1);
    return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 1;
}

function parsePageSize(value: string | string[] | undefined) {
    const raw = Array.isArray(value) ? value[0] : value;
    const parsed = Number(raw ?? DEFAULT_PAGE_SIZE);
    return PAGE_SIZE_OPTIONS.includes(parsed) ? parsed : DEFAULT_PAGE_SIZE;
}

function pageHref(organization: string, page: number, pageSize: number) {
    const query = new URLSearchParams();
    query.set('page', String(page));
    query.set('pageSize', String(pageSize));
    return `/${encodeURIComponent(organization)}/agent-runs?${query.toString()}`;
}

function shortWorkId(workId: string) {
    return workId.length > 12 ? workId.slice(0, 8) : workId;
}

export default async function AgentRunsPage({
    params,
    searchParams,
}: {
    params: Promise<{ organization: string }>;
    searchParams?: Promise<{ page?: string | string[]; pageSize?: string | string[] }>;
}) {
    const { organization } = await params;
    const query = await searchParams;
    const page = parsePage(query?.page);
    const pageSize = parsePageSize(query?.pageSize);
    const bootstrap = await getAppBootstrapState({ organizationSlugOrId: organization });
    const userId = bootstrap.session?.user?.id ?? null;
    const organizationId = bootstrap.organization?.id ?? bootstrap.activeOrganizationId;

    if (!userId || !organizationId) {
        redirect('/sign-in');
    }

    const db = await getDBService();
    const offset = (page - 1) * pageSize;
    const [{ rows: works, total }, connections] = await Promise.all([db.works.listPage({ organizationId, userId, limit: pageSize, offset }), db.connections.list(organizationId)]);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages) {
        redirect(pageHref(organization, totalPages, pageSize));
    }

    const currentPage = page;
    const pageWorks = works;
    const snapshotsByWorkId = new Map(
        (
            await Promise.all(
                pageWorks.map(async work => {
                    const snapshot = await db.works.getSnapshot({ organizationId, userId, workId: work.workId });
                    return snapshot ? ([work.workId, snapshot] as const) : null;
                }),
            )
        ).filter(entry => entry !== null),
    );
    const connectionsById = new Map(connections.map(item => [item.connection.id, item.connection]));
    const runItems: AgentRunListItem[] = pageWorks.map(work => {
        const snapshot = snapshotsByWorkId.get(work.workId) ?? { work, sessions: [], tabs: [] };
        const target = resolveAgentWorkspaceTarget(snapshot);
        const dataSourceConnectionId = work.connectionId ?? target.connectionId;
        const detailHref = buildAgentRunDetailPath(organization, work.workId);
        const workspaceHref = buildAgentWorkspacePathFromSnapshot(organization, snapshot);
        const connection = dataSourceConnectionId ? connectionsById.get(dataSourceConnectionId) : null;

        return {
            workId: work.workId,
            shortWorkId: shortWorkId(work.workId),
            title: work.title || 'Agent Run',
            outputLabel: getAgentRunOutputLabel(snapshot),
            summaryPreview: getAgentRunSummaryPreview(work.metadata),
            tabCount: snapshot.tabs?.length ?? 0,
            sqlExecutionCount: snapshot.sessions?.length ?? 0,
            hasWorkspace: Boolean(target.connectionId),
            dataSource: {
                connectionId: dataSourceConnectionId,
                connectionName: connection?.name ?? null,
                connectionType: connection?.type ?? null,
                connectionHost: connection?.host ?? null,
                connectionPort: connection?.port ?? null,
                connectionHttpPort: connection?.httpPort ?? null,
                databaseName: connection?.database ?? null,
            },
            statusLabel: getAgentRunStatusLabel(work.status),
            statusVariant: getAgentRunStatusVariant(work.status),
            lastActiveLabel: formatDate(work.lastActiveAt),
            detailHref,
            workspaceHref,
        };
    });

    return (
        <div className="bg-n8 h-screen overflow-auto">
            <main className="container mx-auto mt-10 flex flex-col gap-6 p-12 lg:p-12 xl:p-8 2xl:p-4">
                <header className="mb-0 flex items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Bot className="h-4 w-4" />
                            MCP activity
                        </div>
                        <h1 className="mt-2 text-2xl font-semibold tracking-normal">Agent Runs</h1>
                        <p className="mt-1 text-sm text-muted-foreground">Database work created by external agents through Dory MCP.</p>
                    </div>
                </header>

                <section className="rounded-lg border bg-card">
                    <AgentRunsTable
                        runs={runItems}
                        total={total}
                        pageIndex={currentPage - 1}
                        pageSize={pageSize}
                        pageSizeOptions={PAGE_SIZE_OPTIONS}
                        baseHref={`/${encodeURIComponent(organization)}/agent-runs`}
                    />
                </section>
            </main>
        </div>
    );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Bot, ExternalLink, ListChecks } from 'lucide-react';

import { getDBService } from '@dory/database';
import { buildAgentRunDetailPath, buildAgentWorkspacePathFromSnapshot } from '@/lib/agent-runs/workspace-url';
import { getAppBootstrapState } from '@/lib/server/app-bootstrap';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/registry/new-york-v4/ui/table';

function formatDate(value: Date | string | null | undefined) {
    if (!value) return 'Never';
    const date = value instanceof Date ? value : new Date(value);
    return date.toLocaleString();
}

function statusVariant(status: string | null | undefined): 'default' | 'secondary' | 'destructive' | 'outline' {
    if (status === 'error') return 'destructive';
    if (status === 'completed') return 'secondary';
    if (status === 'archived') return 'outline';
    return 'default';
}

export default async function AgentRunsPage({ params }: { params: Promise<{ organization: string }> }) {
    const { organization } = await params;
    const bootstrap = await getAppBootstrapState({ organizationSlugOrId: organization });
    const userId = bootstrap.session?.user?.id ?? null;
    const organizationId = bootstrap.organization?.id ?? bootstrap.activeOrganizationId;

    if (!userId || !organizationId) {
        redirect('/sign-in');
    }

    const db = await getDBService();
    const [works, connections] = await Promise.all([db.works.list({ organizationId, userId, limit: 100 }), db.connections.list(organizationId)]);
    const snapshotsByWorkId = new Map(
        (
            await Promise.all(
                works.map(async work => {
                    if (work.connectionId) {
                        return null;
                    }
                    const snapshot = await db.works.getSnapshot({ organizationId, userId, workId: work.workId });
                    return snapshot ? ([work.workId, snapshot] as const) : null;
                }),
            )
        ).filter(entry => entry !== null),
    );
    const connectionNames = new Map(connections.map(item => [item.connection.id, item.connection.name ?? item.connection.id]));

    return (
        <div className="h-full overflow-auto bg-background">
            <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-8 py-8">
                <header className="flex items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Bot className="h-4 w-4" />
                            MCP activity
                        </div>
                        <h1 className="mt-2 text-2xl font-semibold tracking-normal">Agent Runs</h1>
                    </div>
                </header>

                <section className="rounded-lg border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Question</TableHead>
                                <TableHead>Connection</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>External session</TableHead>
                                <TableHead>Last active</TableHead>
                                <TableHead className="text-right">Open</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {works.length ? (
                                works.map(work => {
                                    const detailHref = buildAgentRunDetailPath(organization, work.workId);
                                    const workspaceHref = buildAgentWorkspacePathFromSnapshot(organization, {
                                        work,
                                        sessions: snapshotsByWorkId.get(work.workId)?.sessions ?? [],
                                        tabs: snapshotsByWorkId.get(work.workId)?.tabs ?? [],
                                    });
                                    return (
                                        <TableRow key={work.workId}>
                                            <TableCell>
                                                <Link href={detailHref} className="line-clamp-2 font-medium hover:underline" title={work.title || 'Agent Run'}>
                                                    {work.title || 'Agent Run'}
                                                </Link>
                                                <div className="mt-1 max-w-[320px] truncate font-mono text-xs text-muted-foreground">{work.workId}</div>
                                            </TableCell>
                                            <TableCell>{work.connectionId ? (connectionNames.get(work.connectionId) ?? work.connectionId) : 'None'}</TableCell>
                                            <TableCell>
                                                <Badge variant={statusVariant(work.status)}>{work.status}</Badge>
                                            </TableCell>
                                            <TableCell className="max-w-[220px] truncate font-mono text-xs">{work.externalSessionId ?? 'None'}</TableCell>
                                            <TableCell>{formatDate(work.lastActiveAt)}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button asChild size="sm">
                                                        <Link href={detailHref}>
                                                            <ListChecks className="h-4 w-4" />
                                                            Activity
                                                        </Link>
                                                    </Button>
                                                    <Button asChild variant="outline" size="sm">
                                                        <Link href={workspaceHref}>
                                                            <ExternalLink className="h-4 w-4" />
                                                            Workspace
                                                        </Link>
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                        No Agent Runs yet.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </section>
            </main>
        </div>
    );
}

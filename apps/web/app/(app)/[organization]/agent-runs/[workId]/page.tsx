import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';

import { getDBService } from '@dory/database';
import { buildAgentWorkspacePathFromSnapshot } from '@/lib/agent-runs/workspace-url';
import { getAppBootstrapState } from '@/lib/server/app-bootstrap';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/registry/new-york-v4/ui/card';
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

function formatSummary(value: Record<string, unknown> | null | undefined) {
    if (!value || !Object.keys(value).length) return '';
    return JSON.stringify(value, null, 2);
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
    const [snapshot, events] = await Promise.all([db.works.getSnapshot({ organizationId, userId, workId }), db.works.listEvents({ organizationId, userId, workId })]);
    if (!snapshot) notFound();

    const workspaceHref = buildAgentWorkspacePathFromSnapshot(organization, snapshot);

    return (
        <div className="h-full overflow-auto bg-background">
            <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-8 py-8">
                <header className="flex items-center justify-between gap-4">
                    <div>
                        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
                            <Link href={`/${organization}/agent-runs`}>
                                <ArrowLeft className="h-4 w-4" />
                                Agent Runs
                            </Link>
                        </Button>
                        <h1 className="text-2xl font-semibold tracking-normal">{snapshot.work.title || 'Agent Run'}</h1>
                        <div className="mt-2 font-mono text-xs text-muted-foreground">{snapshot.work.workId}</div>
                    </div>
                    <Button asChild>
                        <Link href={workspaceHref}>
                            <ExternalLink className="h-4 w-4" />
                            Open Workspace
                        </Link>
                    </Button>
                </header>

                <div className="grid gap-4 md:grid-cols-4">
                    <Card className="rounded-lg">
                        <CardHeader>
                            <CardTitle className="text-sm">Status</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Badge variant={statusVariant(snapshot.work.status)}>{snapshot.work.status}</Badge>
                        </CardContent>
                    </Card>
                    <Card className="rounded-lg">
                        <CardHeader>
                            <CardTitle className="text-sm">Tabs</CardTitle>
                        </CardHeader>
                        <CardContent className="text-2xl font-semibold">{snapshot.tabs.length}</CardContent>
                    </Card>
                    <Card className="rounded-lg">
                        <CardHeader>
                            <CardTitle className="text-sm">SQL Sessions</CardTitle>
                        </CardHeader>
                        <CardContent className="text-2xl font-semibold">{snapshot.sessions.length}</CardContent>
                    </Card>
                    <Card className="rounded-lg">
                        <CardHeader>
                            <CardTitle className="text-sm">Last Active</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm">{formatDate(snapshot.work.lastActiveAt)}</CardContent>
                    </Card>
                </div>

                <section className="rounded-lg border bg-card">
                    <div className="border-b px-4 py-3 text-sm font-medium">Activity</div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Time</TableHead>
                                <TableHead>Tool</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Duration</TableHead>
                                <TableHead>Input</TableHead>
                                <TableHead>Output</TableHead>
                                <TableHead>Error</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {events.length ? (
                                events.map(event => {
                                    const inputSummary = formatSummary(event.inputSummary);
                                    const outputSummary = formatSummary(event.outputSummary);
                                    const errorSummary = [event.errorCode, event.errorMessage].filter(Boolean).join(': ');

                                    return (
                                        <TableRow key={event.eventId} className="align-top">
                                            <TableCell className="whitespace-nowrap">{formatDate(event.createdAt)}</TableCell>
                                            <TableCell className="font-mono text-xs">{event.toolName}</TableCell>
                                            <TableCell>
                                                <Badge variant={event.status === 'error' ? 'destructive' : 'secondary'}>{event.status}</Badge>
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">{event.durationMs} ms</TableCell>
                                            <TableCell className="max-w-[240px]">
                                                {inputSummary ? (
                                                    <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">
                                                        {inputSummary}
                                                    </pre>
                                                ) : null}
                                            </TableCell>
                                            <TableCell className="max-w-[220px]">
                                                {outputSummary ? (
                                                    <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">
                                                        {outputSummary}
                                                    </pre>
                                                ) : null}
                                            </TableCell>
                                            <TableCell className="max-w-[260px] whitespace-pre-wrap break-words text-sm text-muted-foreground">{errorSummary}</TableCell>
                                        </TableRow>
                                    );
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                        No activity recorded.
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

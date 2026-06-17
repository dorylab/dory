'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Bot, CheckCircle2, Database, PanelTop, TerminalSquare } from 'lucide-react';

import { AgentRunActivityTimeline } from '@/components/agent-runs/agent-run-activity-timeline';
import { authFetch } from '@/lib/client/auth-fetch';
import {
    buildAgentRunTimeline,
    getAgentRunStats,
    getAgentRunStatusLabel,
    getAgentRunStatusVariant,
    getAgentRunSummary,
    type AgentRunEventLike,
    type AgentRunSnapshotLike,
} from '@/lib/agent-runs/summary';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/registry/new-york-v4/ui/sheet';

type WorkSnapshotResponse = {
    code?: number;
    data?: {
        snapshot?: AgentRunSnapshotLike;
        events?: AgentRunEventLike[];
    };
    message?: string;
};

async function fetchRunContext(workId: string) {
    const response = await authFetch(`/api/works/${encodeURIComponent(workId)}/snapshot`);
    const payload = (await response.json().catch(() => null)) as WorkSnapshotResponse | null;
    if (!response.ok || payload?.code !== 0 || !payload.data?.snapshot) {
        throw new Error(payload?.message ?? 'Failed to load Agent Run.');
    }
    return {
        snapshot: payload.data.snapshot,
        events: payload.data.events ?? [],
    };
}

function Stat({ icon: Icon, label, value }: { icon: typeof Database; label: string; value: string | number }) {
    return (
        <div className="min-w-0 rounded-md border bg-card px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                {label}
            </div>
            <div className="mt-1 truncate text-sm font-semibold">{value}</div>
        </div>
    );
}

export function AgentRunContextDrawer({ workId, connectionName }: { workId: string; connectionName?: string | null }) {
    const [open, setOpen] = useState(false);
    const query = useQuery({
        queryKey: ['agent-run-context', workId],
        queryFn: () => fetchRunContext(workId),
        enabled: open,
        staleTime: 10_000,
    });

    const snapshot = query.data?.snapshot ?? null;
    const events = query.data?.events ?? [];
    const summary = snapshot ? getAgentRunSummary(snapshot.work.metadata) : null;
    const stats = snapshot ? getAgentRunStats(snapshot, connectionName) : null;
    const timeline = useMemo(() => (snapshot ? buildAgentRunTimeline(snapshot, events) : []), [events, snapshot]);

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1.5 rounded-full px-2.5 text-xs">
                    <Bot className="h-3.5 w-3.5" />
                    Agent Run
                </Button>
            </SheetTrigger>
            <SheetContent className="w-[min(92vw,440px)] sm:max-w-[440px]">
                <SheetHeader className="border-b pr-10">
                    <SheetTitle>Agent Run</SheetTitle>
                    <SheetDescription>This workspace was created by an Agent Run.</SheetDescription>
                </SheetHeader>

                <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
                    {query.isLoading ? (
                        <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">Loading Agent Run...</div>
                    ) : query.error ? (
                        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{query.error.message}</div>
                    ) : snapshot && stats ? (
                        <div className="grid gap-5">
                            <section className="grid gap-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="truncate text-base font-semibold">{summary?.summaryTitle || snapshot.work.title || 'Agent Run'}</div>
                                        <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{snapshot.work.workId}</div>
                                    </div>
                                    <Badge variant={getAgentRunStatusVariant(snapshot.work.status)}>{getAgentRunStatusLabel(snapshot.work.status)}</Badge>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <Stat icon={Database} label="Data source" value={stats.dataSource} />
                                    <Stat icon={PanelTop} label="Tabs" value={stats.tabCount} />
                                    <Stat icon={TerminalSquare} label="SQL runs" value={stats.sqlExecutionCount} />
                                    <Stat icon={Activity} label="Status" value={stats.statusLabel} />
                                </div>
                            </section>

                            <section className="grid gap-2">
                                <h3 className="text-sm font-semibold">What the agent did</h3>
                                {summary ? (
                                    <ul className="grid gap-2">
                                        {summary.summaryBullets.map(item => (
                                            <li key={item} className="flex gap-2 text-sm">
                                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                                <span>{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">No agent-written summary yet.</div>
                                )}
                            </section>

                            <section className="grid gap-2">
                                <h3 className="text-sm font-semibold">Activity</h3>
                                <AgentRunActivityTimeline items={timeline} compact />
                            </section>
                        </div>
                    ) : null}
                </div>
            </SheetContent>
        </Sheet>
    );
}

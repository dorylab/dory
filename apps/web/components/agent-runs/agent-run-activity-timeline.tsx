import { cn } from '@dory/web-utils';
import type { AgentRunTimelineItem } from '@/lib/agent-runs/summary';
import { Badge } from '@/registry/new-york-v4/ui/badge';

function formatDate(value: string | Date | null | undefined, compact: boolean) {
    if (!value) return 'Unknown time';
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Unknown time';
    if (compact) {
        return date.toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
        });
    }
    return date.toLocaleString();
}

function safeJson(value: unknown) {
    if (!value) return '';
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function statusVariant(status: string | null | undefined): 'default' | 'secondary' | 'destructive' | 'outline' {
    if (status === 'error' || status === 'failed') return 'destructive';
    if (status === 'success' || status === 'completed') return 'secondary';
    return 'outline';
}

function hasDetails(item: AgentRunTimelineItem) {
    return Boolean(item.rawInput || item.rawOutput || item.sessionId || item.tabId || item.sqlLength || item.error);
}

export function AgentRunActivityTimeline({ items, compact = false }: { items: AgentRunTimelineItem[]; compact?: boolean }) {
    if (!items.length) {
        return <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No activity recorded yet.</div>;
    }

    return (
        <div className={cn('flex flex-col', compact ? 'gap-3' : 'gap-4')}>
            {items.map(item => {
                const details = hasDetails(item);
                const input = safeJson(item.rawInput);
                const output = safeJson(item.rawOutput);

                return (
                    <article key={item.id} className={cn('relative grid gap-3', compact ? 'grid-cols-[4.75rem_1fr]' : 'grid-cols-[7rem_1fr]')}>
                        <div className="break-words pt-0.5 text-right text-xs text-muted-foreground">{formatDate(item.time, compact)}</div>
                        <div className="relative pb-4 pl-5">
                            <div className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full border border-background bg-muted-foreground" />
                            <div className="absolute bottom-0 left-[4px] top-5 w-px bg-border" />
                            <div className="min-w-0 rounded-md border bg-card px-3 py-2.5">
                                <div className="flex min-w-0 items-center justify-between gap-3">
                                    <div className="min-w-0 truncate text-sm font-medium">{item.title}</div>
                                    {item.status ? (
                                        <Badge variant={statusVariant(item.status)} className="capitalize">
                                            {item.status}
                                        </Badge>
                                    ) : null}
                                </div>
                                {item.meta.length ? <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">{item.meta.join(' · ')}</div> : null}
                                {details ? (
                                    <details className="mt-2 group">
                                        <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground hover:text-foreground">Show raw details</summary>
                                        <div className="mt-2 grid gap-2 text-xs">
                                            {item.sessionId || item.tabId || item.sqlLength ? (
                                                <div className="grid gap-1 rounded-md bg-muted/50 p-2 text-muted-foreground">
                                                    {item.sessionId ? <div>sessionId: {item.sessionId}</div> : null}
                                                    {item.tabId ? <div>tabId: {item.tabId}</div> : null}
                                                    {item.sqlLength ? <div>SQL length: {item.sqlLength}</div> : null}
                                                </div>
                                            ) : null}
                                            {input ? (
                                                <pre className="max-h-48 overflow-auto rounded-md bg-muted/50 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                                                    {input}
                                                </pre>
                                            ) : null}
                                            {output ? (
                                                <pre className="max-h-48 overflow-auto rounded-md bg-muted/50 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                                                    {output}
                                                </pre>
                                            ) : null}
                                            {item.error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-destructive">{item.error}</div> : null}
                                        </div>
                                    </details>
                                ) : null}
                            </div>
                        </div>
                    </article>
                );
            })}
        </div>
    );
}

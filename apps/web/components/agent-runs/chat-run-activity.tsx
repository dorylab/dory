'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/registry/new-york-v4/ui/button';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, ChevronRight, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { type AgentRunEventLike, type AgentRunWorkLike } from '@/lib/agent-runs/summary';
import type { SqlResultBodyProps } from '@/components/@dory/ui/ai/sql-result/type';

import { ChatToolActivityList, type ChatMessageToolRow } from './chat-tool-activity';

type Activity = { work: AgentRunWorkLike; events: AgentRunEventLike[]; runHref: string; workspaceHref: string | null };

export function ChatAnalysisProcess({ streaming, children }: { streaming: boolean; children: ReactNode }) {
    const t = useTranslations('AgentRuns');
    return (
        <details className="group/analysis my-3 text-sm" open={streaming} data-testid="chat-analysis-process">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                {streaming ? <Loader2 className="size-4 animate-spin" /> : <ChevronRight className="size-4 transition-transform group-open/analysis:rotate-90" />}
                {t(streaming ? 'Chat.Analyzing' : 'Chat.Process')}
            </summary>
            <div className="mt-3 space-y-3">{children}</div>
        </details>
    );
}

export function ChatRunActivity({
    workId,
    requestId,
    streaming,
    children,
    tools,
    onCopySql,
    onManualExecute,
}: {
    workId: string;
    requestId: string;
    streaming: boolean;
    children?: ReactNode;
    tools: ChatMessageToolRow[];
    onCopySql: (sql: string) => Promise<void> | void;
    onManualExecute?: SqlResultBodyProps['onManualExecute'];
}) {
    const t = useTranslations('AgentRuns');
    const { data, isPending, isError } = useQuery({
        queryKey: ['chat-run-activity', workId, requestId, streaming],
        queryFn: async ({ signal }): Promise<Activity> => {
            const response = await fetch(`/api/chat/run-activity?workId=${encodeURIComponent(workId)}&requestId=${encodeURIComponent(requestId)}`, { signal });
            if (!response.ok) throw new Error('Unable to load analysis activity');
            return response.json();
        },
        refetchInterval: query =>
            streaming || (query.state.data?.work.status === 'active' && (query.state.data.work.metadata?.chatTurn as { requestId?: string } | undefined)?.requestId === requestId)
                ? 1500
                : false,
    });
    const events = data?.events ?? [];
    const turn = data?.work.metadata?.chatTurn as { requestId?: string; summarySaved?: boolean; responseSaved?: boolean } | undefined;
    const ended = !streaming && Boolean(data && (data.work.status !== 'active' || turn?.requestId !== requestId));
    const incomplete = data?.work.status === 'error' && turn?.requestId === requestId && (!turn.summarySaved || !turn.responseSaved);
    return (
        <>
            <ChatAnalysisProcess streaming={streaming}>
                {isPending ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        {t('Chat.Loading')}
                    </div>
                ) : null}
                {isError ? <p className="text-destructive">{t('Chat.LoadFailed')}</p> : null}
                {children}
                <ChatToolActivityList
                    events={events}
                    tools={tools}
                    workId={workId}
                    onCopySql={onCopySql}
                    onManualExecute={onManualExecute}
                    ended={ended}
                />
            </ChatAnalysisProcess>
            {ended && data ? (
                <div className="mb-3 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                        <Link href={data.runHref}>
                            {t('Chat.ViewRun')}
                            <ArrowUpRight className="size-3.5" />
                        </Link>
                    </Button>
                    {data.workspaceHref ? (
                        <Button asChild size="sm" variant="ghost">
                            <Link href={data.workspaceHref}>{t('Chat.OpenWorkspace')}</Link>
                        </Button>
                    ) : null}
                </div>
            ) : null}
            {ended && incomplete ? <p className="mb-3 text-sm text-muted-foreground">{t('Chat.Incomplete')}</p> : null}
        </>
    );
}

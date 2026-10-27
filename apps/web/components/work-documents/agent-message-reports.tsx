'use client';

import { useEffect } from 'react';
import type { UIMessage } from 'ai';
import type { WorkDocumentSummary } from '@dory/shared/types/work-document';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Check, FileText, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ChatMetadata } from '@/lib/chat-context/types';
import { workRequest } from '@/lib/work-documents/client';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { getToolName, getToolOutput } from '@/app/(app)/[organization]/[connectionId]/chatbot/thread/message-tool-compat';

function reportPreview(document: WorkDocumentSummary) {
    const preview = (document.summary ?? '')
        .replace(/(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\1|$)/g, '')
        .split('\n')
        .filter(line => !/^\s*(?:#{1,6}\s|\||(?:[-:*]\s*){3,}$)/.test(line) && !/^\s*\S.*\|.*\|/.test(line))
        .join(' ')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[*_`]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return preview.startsWith(document.title) ? preview.slice(document.title.length).trim() : preview;
}

export function useChatReports(organization: string, chatId: string | null, busy: boolean) {
    const client = useQueryClient();
    const query = useQuery({
        queryKey: ['work-documents', organization, chatId],
        enabled: Boolean(chatId),
        queryFn: () => workRequest<{ documents: WorkDocumentSummary[] }>(`/api/work-documents?chatId=${encodeURIComponent(chatId!)}`),
        refetchInterval: busy ? 1500 : false,
    });
    useEffect(() => {
        if (!busy) void client.invalidateQueries({ queryKey: ['work-documents', organization, chatId] });
    }, [busy, chatId, client, organization]);
    return query;
}

export function getMessageReportIds(message: UIMessage): string[] {
    const ids = new Set<string>();
    const metadata = message.metadata as ChatMetadata | undefined;
    if (metadata?.reportDocumentId) ids.add(metadata.reportDocumentId);
    for (const part of message.parts) {
        const name = getToolName(part);
        if (!['createWorkReport', 'updateWorkReport', 'dory_finish_work'].includes(name ?? '')) continue;
        const output = getToolOutput(part);
        const id = output?.reportDocumentId ?? output?.id;
        if (typeof id === 'string') ids.add(id);
    }
    return [...ids];
}

export function reportsForMessage(message: UIMessage, messages: UIMessage[], reports: WorkDocumentSummary[]) {
    const index = messages.findIndex(item => item.id === message.id);
    const user = messages.slice(0, index).findLast(item => item.role === 'user');
    const userMetadata = user?.metadata as ChatMetadata | undefined;
    const metadata = message.metadata as ChatMetadata | undefined;
    const ids = getMessageReportIds(message);
    return reports.filter(report => {
        if (report.sourceMessageId !== message.id && messages.some(item => item.role === 'assistant' && item.id === report.sourceMessageId)) return false;
        return (
            ids.includes(report.id) || report.sourceMessageId === message.id || (report.sourceMessageId === (metadata?.userMessageId ?? user?.id) && !userMetadata?.sourceMessageId)
        );
    });
}

export function AgentMessageReports({
    message,
    messages,
    reports,
    busy,
    onOpen,
}: {
    message: UIMessage;
    messages: UIMessage[];
    reports: WorkDocumentSummary[];
    busy: boolean;
    onOpen: (id: string) => void;
}) {
    const t = useTranslations('ChatComposer');
    if (message.role !== 'assistant') return null;
    const documents = reportsForMessage(message, messages, reports);
    if (!documents.length) return null;
    return (
        <div className="my-4 space-y-3" data-testid="message-reports">
            {documents.map(document => {
                const preview = reportPreview(document);
                const generating = document.status !== 'ready' && busy;
                return (
                    <button
                        key={document.id}
                        type="button"
                        onClick={() => onOpen(document.id)}
                        className="group flex w-full max-w-2xl cursor-pointer items-start gap-3 rounded-xl border border-border/70 bg-card p-4 text-left text-card-foreground shadow-xs transition-colors hover:border-primary/30 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:gap-4 sm:p-5"
                    >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-primary">
                            <FileText aria-hidden="true" className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-3">
                                <span className="line-clamp-2 break-words text-sm font-semibold leading-6">{document.title}</span>
                                <Badge variant="secondary" className="mt-0.5 shrink-0 font-mono text-[11px] tabular-nums">
                                    v{document.version ?? document.revision}
                                </Badge>
                            </span>
                            {preview && <span className="mt-1.5 line-clamp-2 break-words text-sm leading-6 text-muted-foreground">{preview}</span>}
                            <span className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs">
                                <span className="inline-flex items-center gap-1.5 text-muted-foreground" role={generating ? 'status' : undefined}>
                                    {document.status === 'ready' ? (
                                        <Check aria-hidden="true" className="size-3.5" />
                                    ) : generating ? (
                                        <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
                                    ) : null}
                                    {t(document.status === 'ready' ? 'Saved' : generating ? 'Generating' : 'Incomplete')}
                                </span>
                                <span className="inline-flex items-center gap-1 font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                                    {t('OpenReport')}
                                    <ArrowUpRight aria-hidden="true" className="size-3.5" />
                                </span>
                            </span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

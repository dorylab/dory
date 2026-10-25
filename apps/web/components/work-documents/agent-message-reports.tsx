'use client';

import { useEffect } from 'react';
import type { UIMessage } from 'ai';
import type { WorkDocumentSummary } from '@dory/shared/types/work-document';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ChatMetadata } from '@/lib/chat-context/types';
import { workRequest } from '@/lib/work-documents/client';
import { getToolName, getToolOutput } from '@/app/(app)/[organization]/[connectionId]/chatbot/thread/message-tool-compat';

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
    const latestUser = messages.findLast(item => item.role === 'user');
    const request = latestUser?.metadata as ChatMetadata | undefined;
    const generating = busy && request?.outputIntent === 'report' && (request.sourceMessageId === message.id || (!request.sourceMessageId && message.id === messages.at(-1)?.id));
    if (!documents.length && !generating) return null;
    return (
        <div className="mb-4 space-y-2" data-testid="message-reports">
            {documents.map(document => (
                <button
                    key={document.id}
                    type="button"
                    onClick={() => onOpen(document.id)}
                    className="flex w-full max-w-xl items-start gap-3 rounded-lg border bg-card p-4 text-left text-card-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{document.title}</span>
                        {document.summary && (
                            <span className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                {document.summary.replace(/!\[[^\]]*\]\([^)]*\)|[#*_`]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')}
                            </span>
                        )}
                        <span className="mt-2 block text-xs text-muted-foreground">
                            {t(document.status === 'ready' ? 'Saved' : busy ? 'Generating' : 'Incomplete')} · {t('OpenReport')}
                        </span>
                    </span>
                </button>
            ))}
            {generating && !documents.length && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    {t('Generating')}
                </div>
            )}
        </div>
    );
}

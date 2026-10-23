'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@/registry/new-york-v4/ui/button';
import { PopoverContent } from '@/registry/new-york-v4/ui/popover';
import type { WorkDocumentSummary } from '@dory/shared/types/work-document';
import { useQueries, type Query } from '@tanstack/react-query';
import type { UIMessage } from 'ai';
import { ArrowLeft, ArrowUpRight, FileText, Loader2, Play, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { AgentRunWorkLike } from '@/lib/agent-runs/summary';
import { workRequest } from '@/lib/work-documents/client';

export function AgentResources({
    open,
    reportVisible,
    activeDocumentId,
    editing,
    reports,
    messages,
    busy,
    loading,
    error,
    onRetry,
    onSelect,
    onBack,
    onClose,
    onRestoreFocus,
    children,
}: {
    open: boolean;
    reportVisible: boolean;
    activeDocumentId: string | null;
    editing: boolean;
    reports: WorkDocumentSummary[];
    messages: UIMessage[];
    busy: boolean;
    loading: boolean;
    error: Error | null;
    onRetry: () => void;
    onSelect: (id: string) => void;
    onBack: () => void;
    onClose: () => void;
    onRestoreFocus: () => void;
    children: ReactNode;
}) {
    const t = useTranslations('WorkDocuments.Resources');
    const { organization } = useParams<{ organization: string }>();
    const closeButton = useRef<HTMLButtonElement>(null);
    const restoreFocus = useRef(false);
    const previousView = useRef({ open, reportVisible });
    useEffect(() => {
        if (open && (!previousView.current.open || previousView.current.reportVisible !== reportVisible)) closeButton.current?.focus();
        previousView.current = { open, reportVisible };
    }, [open, reportVisible]);
    const runs = [
        ...new Map(
            [...messages].reverse().flatMap(message => {
                const metadata = message.metadata as { agentRunId?: string; requestId?: string } | undefined;
                return metadata?.agentRunId ? [[metadata.agentRunId, metadata] as const] : [];
            }),
        ).entries(),
    ];
    const activities = useQueries({
        queries: runs.map(([id]) => ({
            queryKey: ['agent-resource-run', organization, id],
            queryFn: () => workRequest<{ work: AgentRunWorkLike }>(`/api/chat/run-activity?workId=${encodeURIComponent(id)}`),
            refetchInterval: (query: Query<{ work: AgentRunWorkLike }>) => (busy || query.state.data?.work.status === 'active' ? 1500 : false),
        })),
    });
    const content = (
        <>
            <div className="flex shrink-0 items-center justify-between gap-2 border-b p-3">
                {reportVisible ? (
                    <Button variant="ghost" size="sm" onClick={onBack}>
                        <ArrowLeft className="size-4" />
                        {t('Back')}
                    </Button>
                ) : (
                    <h2 className="px-2 text-sm font-medium">{t('Title')}</h2>
                )}
                <Button
                    ref={closeButton}
                    size="icon"
                    variant="ghost"
                    aria-label={t('Close')}
                    onClick={() => {
                        restoreFocus.current = true;
                        onClose();
                    }}
                >
                    <X className="size-4" />
                </Button>
            </div>
            {reportVisible ? (
                <div className="min-h-0 flex-1">{children}</div>
            ) : (
                <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
                    <section aria-label="Agent Runs" className="space-y-2">
                        <h3 className="text-xs font-medium text-muted-foreground">Agent Runs</h3>
                        {!runs.length ? (
                            <p className="text-sm text-muted-foreground">{t('NoRuns')}</p>
                        ) : (
                            runs.map(([id], index) => {
                                const query = activities[index];
                                const work = query.data?.work;
                                const status = work?.status;
                                return (
                                    <div key={id} className="rounded-lg border p-3">
                                        <Link
                                            className="flex items-start gap-2 rounded-sm text-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                                            href={`/${encodeURIComponent(organization)}/agent-runs/${encodeURIComponent(id)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <Play className="mt-0.5 size-4 shrink-0" />
                                            <span className="min-w-0 flex-1 break-words">{work?.title || 'Agent Run'}</span>
                                            <ArrowUpRight className="size-4 shrink-0" />
                                        </Link>
                                        <p className="mt-2 text-xs text-muted-foreground">
                                            {t(
                                                query.isPending
                                                    ? 'Loading'
                                                    : query.isError
                                                      ? 'LoadFailed'
                                                      : status === 'active'
                                                        ? 'Running'
                                                        : status === 'completed'
                                                          ? 'Completed'
                                                          : status === 'error'
                                                            ? 'Failed'
                                                            : status === 'archived'
                                                              ? 'Archived'
                                                              : 'Unknown',
                                            )}
                                        </p>
                                        {query.isError ? (
                                            <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
                                                {t('Retry')}
                                            </Button>
                                        ) : null}
                                    </div>
                                );
                            })
                        )}
                    </section>
                    <section aria-label="Work" className="space-y-2 border-t pt-4">
                        <h3 className="text-xs font-medium text-muted-foreground">Work</h3>
                        {loading ? (
                            <Loader2 aria-label={t('Loading')} className="size-4 animate-spin" />
                        ) : error ? (
                            <div role="alert" className="text-sm text-destructive">
                                {t('LoadFailed')}
                                <Button variant="ghost" size="sm" onClick={onRetry}>
                                    {t('Retry')}
                                </Button>
                            </div>
                        ) : !reports.length ? (
                            <p className="text-sm text-muted-foreground">{t('NoWorks')}</p>
                        ) : (
                            [...reports]
                                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                                .map(report => (
                                    <Button
                                        key={report.id}
                                        aria-pressed={report.id === activeDocumentId}
                                        variant="ghost"
                                        className="h-auto w-full justify-start gap-2 rounded-lg border p-3 text-left"
                                        onClick={() => onSelect(report.id)}
                                    >
                                        <FileText className="size-4 shrink-0" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate">{report.title}</span>
                                            <span className="block text-xs font-normal text-muted-foreground">{t(report.status === 'ready' ? 'Ready' : 'Draft')}</span>
                                        </span>
                                    </Button>
                                ))
                        )}
                    </section>
                </div>
            )}
        </>
    );
    return (
        <PopoverContent
            aria-label={t('Title')}
            align="end"
            side="bottom"
            sideOffset={8}
            collisionPadding={12}
            className={`flex max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl p-0 shadow-xl ${reportVisible ? 'h-[min(48rem,var(--radix-popover-content-available-height))] w-[48rem]' : 'max-h-[min(36rem,var(--radix-popover-content-available-height))] w-[22rem]'}`}
            onOpenAutoFocus={() => {
                restoreFocus.current = false;
            }}
            onEscapeKeyDown={() => {
                restoreFocus.current = true;
            }}
            onCloseAutoFocus={event => {
                if (restoreFocus.current) {
                    event.preventDefault();
                    // Wait for nested dialogs to finish restoring their own focus.
                    requestAnimationFrame(onRestoreFocus);
                }
                restoreFocus.current = false;
            }}
            onInteractOutside={event => {
                // Nested editor dialogs must not dismiss the report or lose changes.
                if (editing) event.preventDefault();
                else if (event.detail.originalEvent.type === 'pointerdown') restoreFocus.current = false;
            }}
            data-testid="agent-resources"
        >
            {content}
        </PopoverContent>
    );
}

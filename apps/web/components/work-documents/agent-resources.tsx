'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/registry/new-york-v4/ui/collapsible';
import { PopoverContent } from '@/registry/new-york-v4/ui/popover';
import type { WorkDocumentSummary } from '@dory/shared/types/work-document';
import type { UIMessage } from 'ai';
import { ArrowLeft, ChevronDown, Loader2, Terminal, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { executionStatus, useAgentResources } from '@/hooks/use-agent-resources';

import { AgentOutputs } from './agent-outputs';
import { AgentQueries } from './agent-queries';

export function AgentResources({
    open,
    detailVisible,
    activeDocumentId,
    editing,
    reports,
    messages,
    busy,
    loading,
    error,
    onRetry,
    onSelect,
    onSelectQuery,
    onSelectArtifact,
    onBack,
    onClose,
    onRestoreFocus,
    children,
}: {
    open: boolean;
    detailVisible: boolean;
    activeDocumentId: string | null;
    editing: boolean;
    reports: WorkDocumentSummary[];
    messages: UIMessage[];
    busy: boolean;
    loading: boolean;
    error: Error | null;
    onRetry: () => void;
    onSelect: (id: string) => void;
    onSelectQuery: (workId: string, sessionId: string) => void;
    onSelectArtifact: (id: string) => void;
    onBack: () => void;
    onClose: () => void;
    onRestoreFocus: () => void;
    children: ReactNode;
}) {
    const t = useTranslations('WorkDocuments.Resources');
    const { organization } = useParams<{ organization: string }>();
    const closeButton = useRef<HTMLButtonElement>(null);
    const restoreFocus = useRef(false);
    const previousView = useRef({ open, detailVisible });
    useEffect(() => {
        if (open && (!previousView.current.open || previousView.current.detailVisible !== detailVisible)) closeButton.current?.focus();
        previousView.current = { open, detailVisible };
    }, [open, detailVisible]);
    const resources = useAgentResources({ organization, messages, reports, open, busy });
    const [executionsOpen, setExecutionsOpen] = useState(false);
    useEffect(() => {
        if (!open) setExecutionsOpen(false);
    }, [open]);
    const outputsIncomplete = loading || Boolean(error) || resources.loading || resources.failed;
    const counts = { Running: 0, Failed: 0, Completed: 0, Unknown: 0 };
    resources.queries.forEach(query => {
        counts[executionStatus(query.session.status)]++;
    });
    const executionSummary = [
        t('SqlQueries'),
        ...(['Running', 'Failed', 'Completed', 'Unknown'] as const)
            .filter(status => counts[status] > 0)
            .map(status => t('StatusCount', { status: t(status), count: counts[status] })),
    ].join(' · ');
    const snapshotFeedback = (
        <>
            {resources.loading ? <Loader2 aria-label={t('Loading')} className="size-4 animate-spin" /> : null}
            {resources.failed ? (
                <div role="alert" className="text-sm text-destructive">
                    {t('LoadFailed')}
                    <Button variant="ghost" size="sm" onClick={resources.retry}>
                        {t('Retry')}
                    </Button>
                </div>
            ) : null}
        </>
    );
    const content = (
        <>
            <div className="flex shrink-0 items-center justify-between gap-2 border-b p-3">
                {detailVisible ? (
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
            {detailVisible ? (
                <div className="min-h-0 flex-1">{children}</div>
            ) : (
                <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
                    <section aria-label={t('Outputs')} className="space-y-2">
                        <h3 className="flex items-center gap-2 text-sm font-medium">
                            {t('Outputs')}
                            <Badge variant="secondary" data-testid="outputs-count">
                                {resources.outputs.length}
                            </Badge>
                        </h3>
                        {outputsIncomplete ? <p className="text-xs text-muted-foreground">{t('LoadedCount')}</p> : null}
                        {loading ? <Loader2 aria-label={t('Loading')} className="size-4 animate-spin" /> : null}
                        {error ? (
                            <div role="alert" className="text-sm text-destructive">
                                {t('ReportsLoadFailed')}
                                <Button variant="ghost" size="sm" onClick={onRetry}>
                                    {t('Retry')}
                                </Button>
                            </div>
                        ) : null}
                        {snapshotFeedback}
                        {!outputsIncomplete && !resources.outputs.length ? <p className="text-sm text-muted-foreground">{t('NoOutputs')}</p> : null}
                        <AgentOutputs outputs={resources.outputs} activeDocumentId={activeDocumentId} onSelectReport={onSelect} onSelectArtifact={onSelectArtifact} />
                    </section>
                    <section aria-label={t('Executions')} className="border-t pt-4">
                        <Collapsible open={executionsOpen} onOpenChange={setExecutionsOpen} className="space-y-2">
                            <h3>
                                <CollapsibleTrigger asChild>
                                    <Button variant="ghost" className="h-auto w-full justify-start gap-2 p-0 py-1 hover:bg-transparent">
                                        <Terminal className="size-4 shrink-0" />
                                        <span className="flex-1 text-left">{t('Executions')}</span>
                                        <Badge variant="secondary" data-testid="executions-count">
                                            {resources.queries.length}
                                        </Badge>
                                        <ChevronDown className={`size-4 shrink-0 transition-transform ${executionsOpen ? 'rotate-180' : ''}`} />
                                    </Button>
                                </CollapsibleTrigger>
                            </h3>
                            <p className="text-xs text-muted-foreground" data-testid="execution-summary">
                                {executionSummary}
                            </p>
                            {resources.loading || resources.failed ? <p className="text-xs text-muted-foreground">{t('LoadedCount')}</p> : null}
                            <CollapsibleContent className="space-y-2">
                                {snapshotFeedback}
                                {!resources.loading && !resources.failed && !resources.queries.length ? <p className="text-sm text-muted-foreground">{t('NoQueries')}</p> : null}
                                <AgentQueries organization={organization} queries={resources.queries} runs={resources.runs} onSelectQuery={onSelectQuery} />
                            </CollapsibleContent>
                        </Collapsible>
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
            className={`flex max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl p-0 shadow-xl ${detailVisible ? 'h-[min(48rem,var(--radix-popover-content-available-height))] w-[48rem]' : 'max-h-[min(36rem,var(--radix-popover-content-available-height))] w-[22rem]'}`}
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

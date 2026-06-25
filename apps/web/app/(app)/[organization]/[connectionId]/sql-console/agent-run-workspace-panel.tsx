'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, ChevronDown, Copy, FileText, Loader2, MoreHorizontal, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { cn } from '@dory/web-utils';
import { buildAgentRunHandoffPrompt } from '@/lib/agent-runs/handoff-prompt';
import { authFetch } from '@/lib/client/auth-fetch';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/registry/new-york-v4/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from '@/registry/new-york-v4/ui/dropdown-menu';

type WorkSnapshotResponse = {
    code?: number;
    data?: {
        snapshot?: {
            work: {
                workId: string;
                title?: string | null;
                connectionId?: string | null;
                metadata?: Record<string, unknown> | null;
            };
            tabs?: unknown[];
            sessions?: unknown[];
        };
    };
    message?: string;
};

async function fetchRunContext(workId: string) {
    const response = await authFetch(`/api/works/${encodeURIComponent(workId)}/snapshot`);
    const payload = (await response.json().catch(() => null)) as WorkSnapshotResponse | null;
    if (!response.ok || payload?.code !== 0 || !payload.data?.snapshot) {
        throw new Error(payload?.message ?? 'AGENT_RUN_LOAD_FAILED');
    }
    return payload.data.snapshot;
}

function summaryTitle(metadata: Record<string, unknown> | null | undefined) {
    const raw = metadata?.agentRunSummary;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const title = (raw as Record<string, unknown>).summaryTitle;
    return typeof title === 'string' && title.trim() ? title : null;
}

function tabSummaries(tabs: unknown[] | undefined, fallbackName: (index: number) => string) {
    if (!tabs?.length) return [];

    return tabs.map((tab, index) => {
        const record = tab && typeof tab === 'object' && !Array.isArray(tab) ? (tab as Record<string, unknown>) : {};
        const name = record.tabName ?? record.title ?? record.name;
        const id = record.tabId ?? record.id;

        return {
            id: typeof id === 'string' && id.trim() ? id : `tab-${index}`,
            name: typeof name === 'string' && name.trim() ? name : fallbackName(index),
        };
    });
}

async function copyTextToClipboard(content: string) {
    try {
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(content);
            return;
        }
    } catch {
        // Use the textarea fallback below.
    }

    const ta = document.createElement('textarea');
    ta.value = content;
    ta.setAttribute('readonly', 'true');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
    } finally {
        document.body.removeChild(ta);
    }
}

export function AgentRunWorkspacePanel({
    workId,
    connectionId,
    connectionName,
    workspaceUrl,
    tabCount,
    onSaveWorkspace,
    hasUnsavedChanges,
    onRequestCloseWorkspace,
    onOpenAgentRuns,
    onSelectGeneratedTab,
    activeTabId,
}: {
    workId: string;
    connectionId?: string | null;
    connectionName?: string | null;
    workspaceUrl?: string | null;
    tabCount?: number | null;
    onSaveWorkspace: () => Promise<void>;
    hasUnsavedChanges: boolean;
    onRequestCloseWorkspace: () => void;
    onOpenAgentRuns: () => void;
    onSelectGeneratedTab: (tabId: string) => void;
    activeTabId?: string | null;
    onSaveAndCloseWorkspace: () => Promise<void>;
    onCloseWorkspaceWithoutSaving: () => void;
}) {
    const t = useTranslations('AgentRuns');
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [saveError, setSaveError] = useState<string | null>(null);
    const [handoffBusy, setHandoffBusy] = useState(false);
    const [generatedTabsOpen, setGeneratedTabsOpen] = useState(false);
    const query = useQuery({
        queryKey: ['agent-run-handoff', workId],
        queryFn: () => fetchRunContext(workId),
        staleTime: 10_000,
    });
    const snapshot = query.data ?? null;
    const resolvedWorkspaceUrl = workspaceUrl || (typeof window !== 'undefined' ? window.location.href : null);
    const title = useMemo(() => summaryTitle(snapshot?.work.metadata) || snapshot?.work.title || t('Common.AgentRun'), [snapshot?.work.metadata, snapshot?.work.title, t]);
    const generatedTabs = useMemo(() => tabSummaries(snapshot?.tabs, index => t('WorkspacePanel.GeneratedTabs.FallbackName', { index: index + 1 })), [snapshot?.tabs, t]);
    const generatedTabCount = generatedTabs.length || tabCount || 0;
    const isSaving = saveState === 'saving' || handoffBusy;
    const workspaceStatusDescription = hasUnsavedChanges ? t('WorkspacePanel.Status.UnsavedDescription') : t('WorkspacePanel.Status.SavedDescription');

    const performSave = useCallback(
        async ({ showToast = true, refetch = true }: { showToast?: boolean; refetch?: boolean } = {}) => {
            setSaveState('saving');
            setSaveError(null);
            try {
                await onSaveWorkspace();
                setSaveState('saved');
                if (refetch) {
                    void query.refetch();
                }
                if (showToast) {
                    toast.success(t('WorkspacePanel.Toasts.WorkspaceSaved'));
                }
            } catch (error) {
                const message = error instanceof Error && error.message ? error.message : t('WorkspacePanel.Toasts.WorkspaceSaveFailed');
                setSaveState('error');
                setSaveError(message);
                if (showToast) {
                    toast.error(message);
                }
                throw error;
            }
        },
        [onSaveWorkspace, query, t],
    );

    const handleCopyHandoff = useCallback(async () => {
        setHandoffBusy(true);
        try {
            await performSave({ showToast: false, refetch: false });
            const refreshed = await query.refetch();
            const nextSnapshot = refreshed.data ?? snapshot;
            const prompt = buildAgentRunHandoffPrompt({
                workId,
                connectionId: connectionId ?? nextSnapshot?.work.connectionId ?? null,
                workspaceUrl: resolvedWorkspaceUrl,
                title: summaryTitle(nextSnapshot?.work.metadata) || nextSnapshot?.work.title || title,
                connectionName,
                tabCount: nextSnapshot?.tabs?.length ?? tabCount ?? null,
                sqlExecutionCount: nextSnapshot?.sessions?.length ?? null,
            });

            await copyTextToClipboard(prompt);
            setSaveState('saved');
            toast.success(t('WorkspacePanel.Toasts.TaskCopied'));
        } catch (error) {
            const message = error instanceof Error && error.message ? error.message : t('WorkspacePanel.Toasts.TaskCopyFailed');
            toast.error(message);
        } finally {
            setHandoffBusy(false);
        }
    }, [connectionId, connectionName, performSave, query, resolvedWorkspaceUrl, snapshot, tabCount, title, t, workId]);

    return (
        <aside className="flex h-full w-full flex-col border-l bg-card shadow-xl">
            <div className="flex h-16 shrink-0 items-center justify-between border-b px-3">
                <div className="min-w-0">
                    <Button variant="ghost" size="sm" className="-ml-2 h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={onOpenAgentRuns}>
                        <ArrowLeft className="h-3.5 w-3.5" />
                        {t('List.Title')}
                    </Button>
                    <div className="truncate px-0.5 text-sm font-semibold">{title}</div>
                </div>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label={t('WorkspacePanel.Actions.WorkspaceActions')}>
                            <MoreHorizontal />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuGroup>
                            <DropdownMenuItem disabled={isSaving} onSelect={() => void performSave()}>
                                <Save />
                                {t('WorkspacePanel.Actions.SaveWorkspace')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={onRequestCloseWorkspace}>
                                <ArrowLeft />
                                {t('WorkspacePanel.Actions.CloseWorkspace')}
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4">
                <div className="grid gap-1.5">
                    <h2 className="text-sm font-semibold">{t('WorkspacePanel.Continue.Title')}</h2>
                    <p className="text-sm leading-5 text-muted-foreground">{t('WorkspacePanel.Continue.Description')}</p>
                </div>

                {query.error ? (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                        {query.error instanceof Error && query.error.message !== 'AGENT_RUN_LOAD_FAILED' ? query.error.message : t('WorkspacePanel.LoadFailed')}
                    </div>
                ) : null}

                {generatedTabCount > 0 ? (
                    <Collapsible open={generatedTabsOpen} onOpenChange={setGeneratedTabsOpen} className="rounded-md border bg-background">
                        <CollapsibleTrigger asChild>
                            <button type="button" className="flex w-full items-center justify-between gap-3 rounded-t-md px-3 py-2 text-left transition-colors hover:bg-muted/50">
                                <div className="min-w-0">
                                    <div className="text-sm font-medium">{t('WorkspacePanel.GeneratedTabs.Title')}</div>
                                    <div className="text-xs text-muted-foreground">{t('Counts.Tabs', { count: generatedTabCount })}</div>
                                </div>
                                {generatedTabs.length ? (
                                    <ChevronDown
                                        className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', !generatedTabsOpen && '-rotate-90')}
                                        aria-hidden="true"
                                    />
                                ) : null}
                            </button>
                        </CollapsibleTrigger>
                        {generatedTabs.length ? (
                            <CollapsibleContent>
                                <div className="grid gap-1 border-t px-3 py-2">
                                    {generatedTabs.map(tab => (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            className={cn(
                                                'flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors hover:bg-muted hover:text-foreground',
                                                activeTabId === tab.id ? 'bg-muted text-foreground' : 'text-muted-foreground',
                                            )}
                                            onClick={() => onSelectGeneratedTab(tab.id)}
                                            aria-label={t('WorkspacePanel.GeneratedTabs.OpenTab', { name: tab.name })}
                                        >
                                            <FileText className="shrink-0" />
                                            <span className="truncate">{tab.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </CollapsibleContent>
                        ) : null}
                    </Collapsible>
                ) : null}

                <div className="grid gap-2">
                    <Button className="justify-start gap-2" disabled={handoffBusy || saveState === 'saving'} onClick={() => void handleCopyHandoff()}>
                        {handoffBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                        {t('WorkspacePanel.Actions.CopyTask')}
                    </Button>
                </div>

                {saveState === 'saved' ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        {t('WorkspacePanel.Status.CopiedSavedDescription')}
                    </div>
                ) : saveState === 'error' ? (
                    <div className="text-xs text-destructive">{saveError ?? t('WorkspacePanel.Toasts.WorkspaceSaveFailed')}</div>
                ) : (
                    <div className="text-xs text-muted-foreground">{workspaceStatusDescription}</div>
                )}
            </div>
        </aside>
    );
}

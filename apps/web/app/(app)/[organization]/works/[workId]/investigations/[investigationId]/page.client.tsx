'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSetAtom } from 'jotai';
import { ArrowLeft, Bot, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/registry/new-york-v4/ui/drawer';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { useConnectionDetail } from '../../../../connections/hooks/use-connections';
import SQLConsoleClient from '../../../../[connectionId]/sql-console/client';
import type { WorkDetail, WorkInvestigation } from '../../../types';

type WorkInvestigationWorkspacePageClientProps = {
    organization: string;
    workId: string;
    investigationId: string;
    defaultLayout?: number[];
};

const WORKSPACE_PREFETCH_STALE_TIME_MS = 30_000;

type WorkInvestigationWorkspaceContentProps = WorkInvestigationWorkspacePageClientProps & {
    onClose: () => void;
};

export function WorkInvestigationWorkspaceContent({
    workId,
    investigationId,
    defaultLayout,
    onClose,
}: WorkInvestigationWorkspaceContentProps) {
    const setCurrentConnection = useSetAtom(currentConnectionAtom);

    const workQuery = useQuery({
        queryKey: ['work', workId],
        queryFn: () => executeActionClient<WorkDetail>('work.get', { id: workId }),
    });

    const work = workQuery.data?.work ?? null;
    const latestRun = workQuery.data?.latestRun ?? null;
    const investigation = useMemo(
        () => workQuery.data?.investigations.find(item => item.id === investigationId) ?? null,
        [investigationId, workQuery.data?.investigations],
    );
    const connectionQuery = useConnectionDetail(work?.connectionId);
    const isAgentRunning = latestRun?.status === 'running' || work?.status === 'running';

    const continueAgentMutation = useMutation({
        mutationFn: async () => {
            const response = await fetch(`/api/works/${encodeURIComponent(workId)}/run`, {
                method: 'POST',
            });

            if (!response.ok) {
                const text = await response.text().catch(() => '');
                let message = text;
                try {
                    const parsed = JSON.parse(text) as { error?: string };
                    message = parsed.error ?? text;
                } catch {
                    // keep text response
                }
                throw new Error(message || 'Failed to continue agent');
            }

            await workQuery.refetch();
            void response.text().finally(() => {
                void workQuery.refetch();
            });
        },
        onSuccess: () => toast.success('Agent run started'),
        onError: error => {
            void workQuery.refetch();
            toast.error(error instanceof Error ? error.message : 'Failed to continue agent');
        },
    });

    useEffect(() => {
        if (connectionQuery.data) {
            setCurrentConnection(connectionQuery.data);
        }
    }, [connectionQuery.data, setCurrentConnection]);

    const ensureWorkspaceQuery = useQuery({
        queryKey: ['work', workId, 'investigation', investigationId, 'workspace'],
        queryFn: () =>
            executeActionClient<WorkInvestigation>(
                'work.ensureInvestigationWorkspace',
                {
                    workId,
                    investigationId,
                },
                { currentConnectionId: work?.connectionId },
            ),
        enabled: Boolean(work?.connectionId && investigation),
        retry: false,
        staleTime: WORKSPACE_PREFETCH_STALE_TIME_MS,
    });

    useEffect(() => {
        if (ensureWorkspaceQuery.error) {
            toast.error(ensureWorkspaceQuery.error instanceof Error ? ensureWorkspaceQuery.error.message : 'Failed to open workspace');
        }
    }, [ensureWorkspaceQuery.error]);

    const canRenderConsole = Boolean(work && investigation && connectionQuery.data && ensureWorkspaceQuery.isSuccess);
    const linkedTabId = ensureWorkspaceQuery.data?.linkedTabId ?? investigation?.linkedTabId ?? null;

    return (
        <div className="bg-background flex h-full min-h-0 flex-col">
            <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4 text-card-foreground">
                <div className="min-w-0 flex-1 pr-3">
                    <Button className="min-w-0 max-w-full justify-start px-2" variant="ghost" size="sm" onClick={onClose}>
                        <ArrowLeft />
                        <span className="shrink-0">Work</span>
                        <span className="shrink-0 text-muted-foreground"> / </span>
                        <span className="truncate font-medium">{investigation?.title ?? 'Workspace'}</span>
                    </Button>
                </div>
                <Button
                    variant="secondary"
                    size="sm"
                    disabled={!work || isAgentRunning || continueAgentMutation.isPending}
                    onClick={() => continueAgentMutation.mutate()}
                >
                    {isAgentRunning || continueAgentMutation.isPending ? <Loader2 className="animate-spin" /> : <Bot />}
                    Continue Agent
                </Button>
            </header>

            <main className="min-h-0 flex-1">
                {workQuery.isLoading ? (
                    <div className="h-full p-4">
                        <Skeleton className="h-full w-full" />
                    </div>
                ) : !work || !investigation ? (
                    <div className="flex h-full items-center justify-center p-8 text-center">
                        <div>
                            <h1 className="text-base font-semibold">Analysis not found</h1>
                            <p className="mt-2 text-sm text-muted-foreground">This Work Investigation is unavailable.</p>
                        </div>
                    </div>
                ) : canRenderConsole ? (
                    <SQLConsoleClient
                        defaultLayout={defaultLayout}
                        connectionId={work.connectionId}
                        workspaceScope={{
                            type: 'work_investigation',
                            workId,
                            investigationId,
                        }}
                        preferredActiveTabId={linkedTabId}
                        expectExistingTabs={Boolean(linkedTabId)}
                    />
                ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Opening workspace
                    </div>
                )}
            </main>
        </div>
    );
}

export function WorkInvestigationWorkspacePageClient(props: WorkInvestigationWorkspacePageClientProps) {
    const router = useRouter();

    return (
        <div className="bg-background fixed inset-0 z-40 flex flex-col">
            <WorkInvestigationWorkspaceContent {...props} onClose={() => router.push(`/${props.organization}/works/${props.workId}`)} />
        </div>
    );
}

export function WorkInvestigationWorkspaceDialogClient(props: WorkInvestigationWorkspacePageClientProps) {
    const router = useRouter();

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                router.back();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [router]);

    return (
        <Drawer direction="bottom" dismissible={false} handleOnly shouldScaleBackground={false} open onOpenChange={open => {
            if (!open) router.back();
        }}>
            <DrawerContent className="!mt-0 !h-dvh !max-h-none !rounded-none !border-0 !p-0 data-[vaul-drawer-direction=bottom]:!mt-0 data-[vaul-drawer-direction=bottom]:!h-dvh data-[vaul-drawer-direction=bottom]:!max-h-none data-[vaul-drawer-direction=bottom]:!rounded-none data-[vaul-drawer-direction=bottom]:!border-0 [&>div:first-child]:hidden">
                <DrawerTitle className="sr-only">
                    Work Investigation Workspace
                </DrawerTitle>
                <DrawerDescription className="sr-only">
                    Full screen SQL workspace for the selected Work Investigation.
                </DrawerDescription>
                <WorkInvestigationWorkspaceContent {...props} onClose={() => router.back()} />
            </DrawerContent>
        </Drawer>
    );
}

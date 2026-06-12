'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAtom } from 'jotai';
import { AlertTriangle, ArrowLeft, Bot, Check, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import { buildContinueAgentRunFetchInit } from '@/lib/work/continue-agent-request';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/registry/new-york-v4/ui/drawer';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import { useConnectionDetail } from '../../../../connections/hooks/use-connections';
import WorkInvestigationSQLConsoleClient, {
    type WorkInvestigationWorkspaceDirtyState,
    type WorkInvestigationWorkspaceSnapshotController,
    type WorkInvestigationWorkspaceSnapshotInput,
} from '../../../../[connectionId]/sql-console/work-investigation-client';
import type { WorkDetail, WorkInvestigation } from '../../../types';

type WorkInvestigationWorkspacePageClientProps = {
    organization: string;
    workId: string;
    investigationId: string;
    defaultLayout?: number[];
};

const WORKSPACE_PREFETCH_STALE_TIME_MS = 30_000;

const CLEAN_DIRTY_STATE: WorkInvestigationWorkspaceDirtyState = {
    isDirty: false,
    changeSummary: {
        sqlEdited: false,
        resultRefreshed: false,
        chartConfigChanged: false,
        selectedRowsChanged: false,
    },
};

function isSameDirtyState(left: WorkInvestigationWorkspaceDirtyState, right: WorkInvestigationWorkspaceDirtyState) {
    return (
        left.isDirty === right.isDirty &&
        left.changeSummary.sqlEdited === right.changeSummary.sqlEdited &&
        left.changeSummary.resultRefreshed === right.changeSummary.resultRefreshed &&
        left.changeSummary.chartConfigChanged === right.changeSummary.chartConfigChanged &&
        left.changeSummary.selectedRowsChanged === right.changeSummary.selectedRowsChanged
    );
}

function hasWorkspaceSnapshotChanges(snapshot: WorkInvestigationWorkspaceSnapshotInput) {
    return Object.values(snapshot.humanEdits.changeSummary).some(Boolean);
}

type WorkInvestigationWorkspaceContentProps = WorkInvestigationWorkspacePageClientProps & {
    onClose: () => void;
};

export function WorkInvestigationWorkspaceContent({ workId, investigationId, defaultLayout, onClose }: WorkInvestigationWorkspaceContentProps) {
    const [currentConnection, setCurrentConnection] = useAtom(currentConnectionAtom);
    const snapshotControllerRef = useRef<WorkInvestigationWorkspaceSnapshotController | null>(null);
    const [dirtyState, setDirtyState] = useState<WorkInvestigationWorkspaceDirtyState>(CLEAN_DIRTY_STATE);
    const [pendingContinueSnapshot, setPendingContinueSnapshot] = useState<WorkInvestigationWorkspaceSnapshotInput | null>(null);
    const [isCollectingSnapshot, setIsCollectingSnapshot] = useState(false);
    const [isRunningSqlFirst, setIsRunningSqlFirst] = useState(false);
    const [continueDrawerOpen, setContinueDrawerOpen] = useState(false);
    const [userNote, setUserNote] = useState('');

    const workQuery = useQuery({
        queryKey: ['work', workId],
        queryFn: () => executeActionClient<WorkDetail>('work.get', { id: workId }),
    });

    const work = workQuery.data?.work ?? null;
    const latestRun = workQuery.data?.latestRun ?? null;
    const investigation = useMemo(() => workQuery.data?.investigations.find(item => item.id === investigationId) ?? null, [investigationId, workQuery.data?.investigations]);
    const connectionQuery = useConnectionDetail(work?.connectionId);
    const isAgentRunning = latestRun?.status === 'running' || work?.status === 'running';
    const latestAgentStepId = useMemo(() => {
        const events = workQuery.data?.latestRunEvents ?? [];
        for (let index = events.length - 1; index >= 0; index -= 1) {
            const event = events[index];
            if (event.role === 'agent' || event.role === 'tool' || event.type === 'sql_executed') {
                return event.id;
            }
        }
        return events[events.length - 1]?.id ?? null;
    }, [workQuery.data?.latestRunEvents]);

    const continueAgentMutation = useMutation({
        mutationFn: async (input?: { snapshot?: WorkInvestigationWorkspaceSnapshotInput | null; focusInvestigationId?: string | null }) => {
            const response = await fetch(
                `/api/works/${encodeURIComponent(workId)}/run`,
                buildContinueAgentRunFetchInit({
                    snapshot: input?.snapshot,
                    focusInvestigationId: input?.focusInvestigationId,
                    previousAgentStepId: latestAgentStepId,
                }),
            );

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
        onSuccess: (_data, variables) => {
            if (variables?.snapshot) {
                snapshotControllerRef.current?.markSent();
                setDirtyState(CLEAN_DIRTY_STATE);
                setPendingContinueSnapshot(null);
                setContinueDrawerOpen(false);
                setUserNote('');
            }
            toast.success('Agent run started');
            onClose();
        },
        onError: error => {
            void workQuery.refetch();
            toast.error(error instanceof Error ? error.message : 'Failed to continue agent');
        },
    });

    const handleContinueAgent = async () => {
        const controller = snapshotControllerRef.current;
        if (!controller) {
            continueAgentMutation.mutate({ focusInvestigationId: investigationId });
            return;
        }

        try {
            setIsCollectingSnapshot(true);
            const snapshot = await controller.collect();
            if (hasWorkspaceSnapshotChanges(snapshot)) {
                setPendingContinueSnapshot(snapshot);
                setDirtyState({
                    isDirty: true,
                    changeSummary: snapshot.humanEdits.changeSummary,
                });
                setContinueDrawerOpen(true);
                return;
            }

            continueAgentMutation.mutate({ snapshot });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to collect workspace snapshot');
        } finally {
            setIsCollectingSnapshot(false);
        }
    };

    const handleConfirmContinue = async () => {
        const controller = snapshotControllerRef.current;
        if (!controller) {
            continueAgentMutation.mutate({ focusInvestigationId: investigationId });
            return;
        }

        try {
            setIsCollectingSnapshot(true);
            const snapshot = await controller.collect(userNote);
            continueAgentMutation.mutate({ snapshot });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to collect workspace snapshot');
        } finally {
            setIsCollectingSnapshot(false);
        }
    };

    const handleRunSqlFirst = async () => {
        const controller = snapshotControllerRef.current;
        if (!controller) return;

        try {
            setIsRunningSqlFirst(true);
            setContinueDrawerOpen(false);
            setPendingContinueSnapshot(null);
            await controller.runActiveSql();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to run SQL');
        } finally {
            setIsRunningSqlFirst(false);
        }
    };

    const handleWorkspaceDirtyStateChange = useCallback((nextState: WorkInvestigationWorkspaceDirtyState) => {
        setDirtyState(prevState => (isSameDirtyState(prevState, nextState) ? prevState : nextState));
    }, []);

    const drawerChangeSummary = pendingContinueSnapshot?.humanEdits.changeSummary ?? dirtyState.changeSummary;
    const isLatestResultFromPreviousSql = drawerChangeSummary.sqlEdited && !drawerChangeSummary.resultRefreshed;

    useEffect(() => {
        if (connectionQuery.data && currentConnection?.connection?.id !== connectionQuery.data.connection.id) {
            setCurrentConnection(connectionQuery.data);
        }
    }, [connectionQuery.data, currentConnection?.connection?.id, setCurrentConnection]);

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
                {continueAgentMutation.isPending && (dirtyState.isDirty || continueAgentMutation.variables?.snapshot) ? (
                    <div className="mr-3 flex max-w-[11rem] shrink-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" />
                        <span className="truncate">Sending workspace to Agent...</span>
                    </div>
                ) : dirtyState.isDirty ? (
                    <div className="mr-3 max-w-[11rem] shrink-0 truncate text-xs font-medium text-amber-600 dark:text-amber-400">Human edited · Not sent to Agent</div>
                ) : null}
                <Button
                    variant="secondary"
                    size="sm"
                    disabled={!work || isAgentRunning || continueAgentMutation.isPending || isCollectingSnapshot || isRunningSqlFirst}
                    onClick={handleContinueAgent}
                >
                    {isAgentRunning || continueAgentMutation.isPending || isCollectingSnapshot || isRunningSqlFirst ? <Loader2 className="animate-spin" /> : <Bot />}
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
                    <WorkInvestigationSQLConsoleClient
                        defaultLayout={defaultLayout}
                        connectionId={work.connectionId}
                        workId={workId}
                        investigationId={investigationId}
                        preferredActiveTabId={linkedTabId}
                        expectExistingTabs={Boolean(linkedTabId)}
                        onWorkspaceDirtyStateChange={handleWorkspaceDirtyStateChange}
                        onWorkspaceSnapshotControllerChange={controller => {
                            snapshotControllerRef.current = controller;
                        }}
                    />
                ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Opening workspace
                    </div>
                )}
            </main>
            <Drawer direction="right" open={continueDrawerOpen} onOpenChange={setContinueDrawerOpen}>
                <DrawerContent className="w-full sm:max-w-md">
                    <DrawerHeader className="border-b">
                        <DrawerTitle>Continue with Agent</DrawerTitle>
                        <DrawerDescription>Your workspace changes will be sent to the Agent as context for this Analysis.</DrawerDescription>
                    </DrawerHeader>
                    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-4">
                        <div>
                            <p className="mb-2 text-sm font-medium">Changes to include:</p>
                            <div className="space-y-2 text-sm text-muted-foreground">
                                {drawerChangeSummary.sqlEdited ? (
                                    <div className="flex items-center gap-2">
                                        <Check className="size-4 text-foreground" />
                                        SQL edited
                                    </div>
                                ) : null}
                                {isLatestResultFromPreviousSql ? (
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
                                        Latest result is from the previous SQL
                                    </div>
                                ) : drawerChangeSummary.resultRefreshed ? (
                                    <div className="flex items-center gap-2">
                                        <Check className="size-4 text-foreground" />
                                        Latest result included
                                    </div>
                                ) : null}
                                {drawerChangeSummary.chartConfigChanged ? (
                                    <div className="flex items-center gap-2">
                                        <Check className="size-4 text-foreground" />
                                        Chart config changed
                                    </div>
                                ) : null}
                                {drawerChangeSummary.selectedRowsChanged ? (
                                    <div className="flex items-center gap-2">
                                        <Check className="size-4 text-foreground" />
                                        Selected rows included
                                    </div>
                                ) : null}
                            </div>
                        </div>
                        <label className="space-y-2">
                            <span className="text-sm font-medium">Instruction for Agent</span>
                            <Textarea
                                value={userNote}
                                onChange={event => setUserNote(event.target.value)}
                                placeholder="Tell the Agent what to do next with these changes..."
                                className="min-h-28 resize-none"
                            />
                        </label>
                        <p className="text-sm text-muted-foreground">The Agent will continue this Analysis and may update the findings or suggest next steps.</p>
                    </div>
                    <DrawerFooter className="border-t sm:flex-row sm:justify-end">
                        {isLatestResultFromPreviousSql ? (
                            <>
                                <Button variant="outline" onClick={handleRunSqlFirst} disabled={continueAgentMutation.isPending || isCollectingSnapshot || isRunningSqlFirst}>
                                    {isRunningSqlFirst ? <Loader2 className="animate-spin" /> : <Play />}
                                    Run SQL first
                                </Button>
                                <Button onClick={handleConfirmContinue} disabled={continueAgentMutation.isPending || isCollectingSnapshot || isRunningSqlFirst}>
                                    {continueAgentMutation.isPending || isCollectingSnapshot ? <Loader2 className="animate-spin" /> : <Bot />}
                                    Continue anyway
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={() => setContinueDrawerOpen(false)}
                                    disabled={continueAgentMutation.isPending || isCollectingSnapshot || isRunningSqlFirst}
                                >
                                    Cancel
                                </Button>
                                <Button onClick={handleConfirmContinue} disabled={continueAgentMutation.isPending || isCollectingSnapshot || isRunningSqlFirst}>
                                    {continueAgentMutation.isPending || isCollectingSnapshot ? <Loader2 className="animate-spin" /> : <Bot />}
                                    Continue Analysis
                                </Button>
                            </>
                        )}
                    </DrawerFooter>
                </DrawerContent>
            </Drawer>
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
        <Drawer
            direction="bottom"
            dismissible={false}
            handleOnly
            shouldScaleBackground={false}
            open
            onOpenChange={open => {
                if (!open) router.back();
            }}
        >
            <DrawerContent className="!mt-0 !h-dvh !max-h-none !rounded-none !border-0 !p-0 data-[vaul-drawer-direction=bottom]:!mt-0 data-[vaul-drawer-direction=bottom]:!h-dvh data-[vaul-drawer-direction=bottom]:!max-h-none data-[vaul-drawer-direction=bottom]:!rounded-none data-[vaul-drawer-direction=bottom]:!border-0 [&>div:first-child]:hidden">
                <DrawerTitle className="sr-only">Work Investigation Workspace</DrawerTitle>
                <DrawerDescription className="sr-only">Full screen SQL workspace for the selected Work Investigation.</DrawerDescription>
                <WorkInvestigationWorkspaceContent {...props} onClose={() => router.back()} />
            </DrawerContent>
        </Drawer>
    );
}

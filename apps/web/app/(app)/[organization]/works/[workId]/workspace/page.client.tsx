'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useAtom } from 'jotai';
import { ArrowLeft, Bot, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import { buildContinueAgentRunFetchInit } from '@/lib/work/continue-agent-request';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Textarea } from '@/registry/new-york-v4/ui/textarea';
import WorkSQLConsoleClient, {
    type WorkWorkspaceDirtyState,
    type WorkWorkspaceSnapshotController,
    type WorkWorkspaceSnapshotInput,
} from '../../../[connectionId]/sql-console/work-client';
import { useConnectionDetail } from '../../../connections/hooks/use-connections';
import type { WorkDetail } from '../../types';

type WorkWorkspacePageClientProps = {
    organization: string;
    workId: string;
};

const CLEAN_DIRTY_STATE: WorkWorkspaceDirtyState = {
    isDirty: false,
    changeSummary: {
        sqlEdited: false,
        resultRefreshed: false,
        chartConfigChanged: false,
        selectedRowsChanged: false,
    },
};

function hasWorkspaceSnapshotChanges(snapshot: WorkWorkspaceSnapshotInput) {
    return Object.values(snapshot.humanEdits.changeSummary).some(Boolean);
}

export function WorkWorkspacePageClient({ organization, workId }: WorkWorkspacePageClientProps) {
    const [currentConnection, setCurrentConnection] = useAtom(currentConnectionAtom);
    const snapshotControllerRef = useRef<WorkWorkspaceSnapshotController | null>(null);
    const [dirtyState, setDirtyState] = useState<WorkWorkspaceDirtyState>(CLEAN_DIRTY_STATE);
    const [userInstruction, setUserInstruction] = useState('');
    const [isCollectingSnapshot, setIsCollectingSnapshot] = useState(false);

    const workQuery = useQuery({
        queryKey: ['work', workId],
        queryFn: () => executeActionClient<WorkDetail>('work.get', { id: workId }),
    });
    const work = workQuery.data?.work ?? null;
    const latestRun = workQuery.data?.latestRun ?? null;
    const workspaceSummary = workQuery.data?.workspaceSummary ?? null;
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

    useEffect(() => {
        if (connectionQuery.data && currentConnection?.connection?.id !== connectionQuery.data.connection.id) {
            setCurrentConnection(connectionQuery.data);
        }
    }, [connectionQuery.data, currentConnection?.connection?.id, setCurrentConnection]);

    const continueAgentMutation = useMutation({
        mutationFn: async (snapshot: WorkWorkspaceSnapshotInput | null) => {
            const response = await fetch(
                `/api/works/${encodeURIComponent(workId)}/run`,
                buildContinueAgentRunFetchInit({
                    snapshot: snapshot
                        ? {
                              ...snapshot,
                              intent: snapshot.intent,
                              previousAgentStepId: latestAgentStepId,
                          }
                        : null,
                    previousAgentStepId: latestAgentStepId,
                    userInstruction: userInstruction.trim() || undefined,
                    trigger: snapshot ? 'continue_from_workspace' : 'user_instruction',
                    focusTabId: snapshot?.focusTabId ?? undefined,
                }),
            );

            if (!response.ok) {
                const text = await response.text().catch(() => '');
                throw new Error(text || 'Failed to continue Agent');
            }

            void response.text().finally(() => {
                void workQuery.refetch();
            });
        },
        onSuccess: (_data, snapshot) => {
            if (snapshot) {
                snapshotControllerRef.current?.markSent();
                setDirtyState(CLEAN_DIRTY_STATE);
            }
            setUserInstruction('');
            toast.success('Agent run started');
        },
        onError: error => {
            void workQuery.refetch();
            toast.error(error instanceof Error ? error.message : 'Failed to continue Agent');
        },
    });

    const handleContinueAgent = async () => {
        const controller = snapshotControllerRef.current;
        if (!controller) {
            continueAgentMutation.mutate(null);
            return;
        }

        try {
            setIsCollectingSnapshot(true);
            const snapshot = await controller.collect(userInstruction);
            continueAgentMutation.mutate(hasWorkspaceSnapshotChanges(snapshot) || userInstruction.trim() ? snapshot : null);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to collect workspace snapshot');
        } finally {
            setIsCollectingSnapshot(false);
        }
    };

    if (!work) {
        return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading Work workspace...</div>;
    }

    const unsyncedCount = Math.max(workspaceSummary?.unsyncedCount ?? 0, dirtyState.isDirty ? 1 : 0);

    return (
        <div className="flex h-full min-h-0 flex-col bg-background">
            <div className="border-b bg-background px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                        <Button variant="ghost" size="sm" className="-ml-2 gap-2" asChild>
                            <Link href={`/${organization}/works/${workId}`}>
                                <ArrowLeft className="size-4" />
                                Back to Work
                            </Link>
                        </Button>
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="truncate text-lg font-semibold">{work.title}</h1>
                            {unsyncedCount > 0 ? <Badge variant="outline">{unsyncedCount} unsynced change{unsyncedCount === 1 ? '' : 's'}</Badge> : <Badge variant="secondary">Synced</Badge>}
                        </div>
                        <p className="max-w-4xl text-sm text-muted-foreground">Goal: {work.goal}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => snapshotControllerRef.current?.markSent()} disabled={!dirtyState.isDirty}>
                            <Save className="size-4" />
                            Save
                        </Button>
                        <Button size="sm" onClick={handleContinueAgent} disabled={isAgentRunning || continueAgentMutation.isPending || isCollectingSnapshot}>
                            {continueAgentMutation.isPending || isCollectingSnapshot ? <Loader2 className="size-4 animate-spin" /> : <Bot className="size-4" />}
                            Continue with Agent
                        </Button>
                    </div>
                </div>
                <div className="mt-3 flex gap-2">
                    <Textarea
                        value={userInstruction}
                        onChange={event => setUserInstruction(event.target.value)}
                        placeholder="Tell Agent what to do next"
                        className="min-h-10 flex-1 resize-none"
                    />
                </div>
            </div>
            <div className="min-h-0 flex-1">
                <WorkSQLConsoleClient
                    connectionId={work.connectionId}
                    workId={work.id}
                    preferredActiveTabId={workspaceSummary?.activeTabId}
                    expectExistingTabs={Boolean(workspaceSummary?.tabCount)}
                    onWorkspaceDirtyStateChange={setDirtyState}
                    onWorkspaceSnapshotControllerChange={controller => {
                        snapshotControllerRef.current = controller;
                    }}
                />
            </div>
        </div>
    );
}

'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useSetAtom } from 'jotai';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { executeActionClient } from '@/lib/actions/client';
import { currentConnectionAtom } from '@/shared/stores/app.store';
import { Button } from '@/registry/new-york-v4/ui/button';
import { Skeleton } from '@/registry/new-york-v4/ui/skeleton';
import { useConnectionDetail } from '../../../../connections/hooks/use-connections';
import SQLConsoleClient from '../../../../[connectionId]/sql-console/client';
import type { WorkDetail, WorkInvestigation } from '../../../../work/types';

type WorkInvestigationWorkspacePageClientProps = {
    organization: string;
    workId: string;
    investigationId: string;
    defaultLayout?: number[];
};

export function WorkInvestigationWorkspacePageClient({
    organization,
    workId,
    investigationId,
    defaultLayout,
}: WorkInvestigationWorkspacePageClientProps) {
    const router = useRouter();
    const setCurrentConnection = useSetAtom(currentConnectionAtom);

    const workQuery = useQuery({
        queryKey: ['work', workId],
        queryFn: () => executeActionClient<WorkDetail>('work.get', { id: workId }),
    });

    const work = workQuery.data?.work ?? null;
    const investigation = useMemo(
        () => workQuery.data?.investigations.find(item => item.id === investigationId) ?? null,
        [investigationId, workQuery.data?.investigations],
    );
    const connectionQuery = useConnectionDetail(work?.connectionId);

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
    });

    useEffect(() => {
        if (ensureWorkspaceQuery.error) {
            toast.error(ensureWorkspaceQuery.error instanceof Error ? ensureWorkspaceQuery.error.message : 'Failed to open workspace');
        }
    }, [ensureWorkspaceQuery.error]);

    const isLoading = workQuery.isLoading || connectionQuery.isLoading || ensureWorkspaceQuery.isLoading;
    const canRenderConsole = Boolean(work && investigation && connectionQuery.data && ensureWorkspaceQuery.isSuccess);
    const linkedTabId = ensureWorkspaceQuery.data?.linkedTabId ?? investigation?.linkedTabId ?? null;

    return (
        <div className="bg-background fixed inset-0 z-40 flex flex-col">
            <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4 text-card-foreground">
                <div className="flex min-w-0 items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => router.push(`/${organization}/works/${workId}`)}>
                        <ArrowLeft />
                        Work
                    </Button>
                    <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{investigation?.title ?? 'Workspace'}</div>
                        <div className="truncate text-xs text-muted-foreground">{work?.title ?? 'Work Investigation'}</div>
                    </div>
                </div>
                {isLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="size-3 animate-spin" />
                        Opening workspace
                    </div>
                ) : null}
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

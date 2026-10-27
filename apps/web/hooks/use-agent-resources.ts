'use client';

import { useEffect } from 'react';
import type { WorkDocumentSummary } from '@dory/shared/types/work-document';
import { useQueries, useQueryClient, type Query } from '@tanstack/react-query';
import type { UIMessage } from 'ai';

import { querySnapshotOptions, type SavedQuery } from '@/lib/agent-runs/query-snapshot';
import type { AgentRunWorkLike } from '@/lib/agent-runs/summary';
import type { ArtifactSummary } from '@/lib/artifacts/types';
import { workRequest } from '@/lib/work-documents/client';

export type ResourceOutput = { kind: 'report'; report: WorkDocumentSummary } | { kind: 'artifact'; artifact: ArtifactSummary };
export type ResourceQuery = SavedQuery & { workId: string };
export type ResourceRun = {
    id: string;
    work: AgentRunWorkLike | undefined;
    loading: boolean;
    failed: boolean;
    retry: () => void;
};

export function executionStatus(status: string) {
    switch (status) {
        case 'success':
            return 'Completed';
        case 'error':
            return 'Failed';
        case 'running':
        case 'pending':
            return 'Running';
        default:
            return 'Unknown';
    }
}

export function useAgentResources({
    organization,
    messages,
    reports,
    open,
    busy,
}: {
    organization: string;
    messages: UIMessage[];
    reports: WorkDocumentSummary[];
    open: boolean;
    busy: boolean;
}) {
    const client = useQueryClient();
    const runIds = [
        ...new Set(
            [...messages].reverse().flatMap(message => {
                const metadata = message.metadata as { agentRunId?: string } | undefined;
                return metadata?.agentRunId ? [metadata.agentRunId] : [];
            }),
        ),
    ];
    const activities = useQueries({
        queries: runIds.map(id => ({
            queryKey: ['agent-resource-run', organization, id],
            queryFn: () => workRequest<{ work: AgentRunWorkLike }>(`/api/chat/run-activity?workId=${encodeURIComponent(id)}`),
            enabled: open,
            refetchInterval: (query: Query<{ work: AgentRunWorkLike }>) => (busy || query.state.data?.work.status === 'active' ? 1500 : false),
        })),
    });
    const snapshots = useQueries({
        queries: runIds.map((id, index) => ({
            ...querySnapshotOptions(organization, id),
            enabled: open,
            refetchInterval: busy || activities[index].data?.work.status === 'active' ? 1500 : false,
        })),
    });
    useEffect(() => {
        // Capture the final execution and outputs even when a turn ends between polling ticks.
        if (!busy) void client.invalidateQueries({ queryKey: ['agent-query-snapshot', organization] });
    }, [busy, client, organization]);

    const queries = [
        ...new Map(
            snapshots.flatMap((snapshot, index) =>
                (snapshot.data?.sessions ?? []).map(item => [`${runIds[index]}:${item.session.sessionId}`, { ...item, workId: runIds[index] }] as const),
            ),
        ).values(),
    ].sort((a, b) => (b.session.startedAt ?? '').localeCompare(a.session.startedAt ?? ''));
    // Prefer the latest copy when the same output is linked from multiple runs.
    const artifacts = [
        ...new Map(
            snapshots
                .flatMap(snapshot => snapshot.data?.artifacts ?? [])
                .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
                .map(artifact => [artifact.id, artifact]),
        ).values(),
    ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const uniqueReports = [...new Map([...reports].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).map(report => [report.id, report])).values()].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
    );
    const outputs: ResourceOutput[] = [
        ...uniqueReports.map(report => ({ kind: 'report' as const, report })),
        ...artifacts.map(artifact => ({ kind: 'artifact' as const, artifact })),
    ];
    const runs: ResourceRun[] = runIds.map((id, index) => ({
        id,
        work: activities[index].data?.work,
        loading: activities[index].isPending,
        failed: activities[index].isError,
        retry: () => {
            void activities[index].refetch();
        },
    }));
    return {
        outputs,
        queries,
        runs,
        loading: snapshots.some(snapshot => snapshot.isPending),
        failed: snapshots.some(snapshot => snapshot.isError),
        retry: () =>
            snapshots.forEach(snapshot => {
                if (snapshot.isError) void snapshot.refetch();
            }),
    };
}

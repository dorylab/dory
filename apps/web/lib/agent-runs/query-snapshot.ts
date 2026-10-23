import { queryOptions } from '@tanstack/react-query';

import type { ArtifactSummary } from '@/lib/artifacts/types';

export type SavedQuery = {
    session: {
        sessionId: string;
        sqlText: string;
        database: string | null;
        connectionId?: string | null;
        tabId?: string | null;
        status: string;
        startedAt?: string;
        durationMs?: number | null;
        errorMessage?: string | null;
    };
    queryResultSets: Array<{ columns: Array<{ name: string; type?: string | null }> | null; rowCount: number | null; limited?: boolean | null }>;
    results: unknown[][];
};

export function querySnapshotOptions(organization: string, workId: string) {
    return queryOptions({
        queryKey: ['agent-query-snapshot', organization, workId],
        staleTime: 60_000,
        queryFn: async ({ signal }): Promise<{ sessions: SavedQuery[]; artifacts: ArtifactSummary[] }> => {
            const response = await fetch(`/api/works/${encodeURIComponent(workId)}/snapshot`, { signal });
            if (!response.ok) throw new Error('Unable to load SQL evidence');
            const body = (await response.json()) as { data: { snapshot: { sessions: SavedQuery[] }; artifacts?: ArtifactSummary[] } };
            return { sessions: body.data.snapshot.sessions, artifacts: body.data.artifacts ?? [] };
        },
    });
}

'use client';

import { useEffect } from 'react';
import { Button } from '@/registry/new-york-v4/ui/button';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Code2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { querySnapshotOptions } from '@/lib/agent-runs/query-snapshot';

import { AgentArtifacts } from './agent-artifacts';

export function AgentQueries({
    organization,
    runIds,
    open,
    busy,
    onSelectQuery,
    onSelectArtifact,
}: {
    organization: string;
    runIds: string[];
    open: boolean;
    busy: boolean;
    onSelectQuery: (workId: string, sessionId: string) => void;
    onSelectArtifact: (id: string) => void;
}) {
    const t = useTranslations('WorkDocuments.Resources');
    const runsT = useTranslations('AgentRuns');
    const client = useQueryClient();
    const snapshots = useQueries({
        queries: runIds.map(workId => ({
            ...querySnapshotOptions(organization, workId),
            enabled: open,
            refetchInterval: busy ? 1500 : false,
        })),
    });
    useEffect(() => {
        // Fetch the final saved query even if the turn ends between polling ticks.
        if (!busy) void client.invalidateQueries({ queryKey: ['agent-query-snapshot', organization] });
    }, [busy, client, organization]);
    const queries = snapshots
        .flatMap((snapshot, index) => (snapshot.data?.sessions ?? []).map(item => ({ ...item, workId: runIds[index] })))
        .sort((a, b) => (b.session.startedAt ?? '').localeCompare(a.session.startedAt ?? ''));
    const artifacts = [...new Map(snapshots.flatMap(snapshot => snapshot.data?.artifacts ?? []).map(artifact => [artifact.id, artifact])).values()].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
    );
    const pending = snapshots.some(snapshot => snapshot.isPending);
    const failed = snapshots.some(snapshot => snapshot.isError);
    return (
        <>
            <section aria-label="Queries" className="space-y-2 border-t pt-4">
                <h3 className="text-xs font-medium text-muted-foreground">Queries</h3>
                {pending ? <Loader2 aria-label={t('Loading')} className="size-4 animate-spin" /> : null}
                {failed ? (
                    <div role="alert" className="text-sm text-destructive">
                        {t('LoadFailed')}
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                                snapshots.forEach(snapshot => {
                                    if (snapshot.isError) void snapshot.refetch();
                                })
                            }
                        >
                            {t('Retry')}
                        </Button>
                    </div>
                ) : null}
                {!pending && !failed && !queries.length ? <p className="text-sm text-muted-foreground">{t('NoQueries')}</p> : null}
                {queries.map(({ workId, session, queryResultSets }) => (
                    <button
                        key={`${workId}:${session.sessionId}`}
                        type="button"
                        onClick={() => onSelectQuery(workId, session.sessionId)}
                        className="flex w-full cursor-pointer text-left min-w-0 items-start gap-2 rounded-lg border p-3 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <Code2 className="mt-0.5 size-4 shrink-0" />
                        <span className="min-w-0 flex-1">
                            <span className="block truncate font-mono" title={session.sqlText}>
                                {session.sqlText}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                                {[
                                    session.database,
                                    t(session.status === 'success' ? 'Completed' : session.status === 'error' ? 'Failed' : 'Running'),
                                    queryResultSets[0]?.rowCount != null ? runsT('Counts.Rows', { count: queryResultSets[0].rowCount }) : null,
                                ]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0" />
                    </button>
                ))}
            </section>
            <AgentArtifacts
                onSelect={onSelectArtifact}
                artifacts={artifacts}
                loading={pending}
                failed={failed}
                onRetry={() =>
                    snapshots.forEach(snapshot => {
                        if (snapshot.isError) void snapshot.refetch();
                    })
                }
            />
        </>
    );
}

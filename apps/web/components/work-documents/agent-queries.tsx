'use client';

import Link from 'next/link';
import { Button } from '@/registry/new-york-v4/ui/button';
import { ArrowUpRight, ChevronRight, Code2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { executionStatus, type ResourceQuery, type ResourceRun } from '@/hooks/use-agent-resources';

function RunSource({ organization, run }: { organization: string; run: ResourceRun }) {
    const t = useTranslations('WorkDocuments.Resources');
    const status = run.loading
        ? 'Loading'
        : run.failed
          ? 'LoadFailed'
          : run.work?.status === 'active'
            ? 'Running'
            : run.work?.status === 'completed'
              ? 'Completed'
              : run.work?.status === 'error'
                ? 'Failed'
                : run.work?.status === 'archived'
                  ? 'Archived'
                  : 'Unknown';
    return (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <Link
                className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                href={`/${encodeURIComponent(organization)}/agent-runs/${encodeURIComponent(run.id)}`}
                target="_blank"
                rel="noopener noreferrer"
            >
                <span className="truncate">{t('RunSource', { title: run.work?.title || t('AgentRun') })}</span>
                <ArrowUpRight className="size-3 shrink-0" />
            </Link>
            <span>{t(status)}</span>
            {run.failed ? (
                <Button variant="ghost" size="sm" onClick={run.retry}>
                    {t('Retry')}
                </Button>
            ) : null}
        </div>
    );
}

export function AgentQueries({
    organization,
    queries,
    runs,
    onSelectQuery,
}: {
    organization: string;
    queries: ResourceQuery[];
    runs: ResourceRun[];
    onSelectQuery: (workId: string, sessionId: string) => void;
}) {
    const t = useTranslations('WorkDocuments.Resources');
    const runsT = useTranslations('AgentRuns');
    const runsById = new Map(runs.map(run => [run.id, run]));
    const queryRunIds = new Set(queries.map(query => query.workId));
    return (
        <>
            <div className="space-y-2" data-testid="resource-queries">
                {queries.map(({ workId, session, queryResultSets }) => {
                    const run = runsById.get(workId);
                    return (
                        <div key={`${workId}:${session.sessionId}`} className="overflow-hidden rounded-lg border">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => onSelectQuery(workId, session.sessionId)}
                                className="h-auto w-full min-w-0 items-start justify-start gap-2 whitespace-normal p-3 text-left"
                            >
                                <Code2 className="mt-0.5 size-4 shrink-0" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-mono" title={session.sqlText}>
                                        {session.sqlText}
                                    </span>
                                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                                        {[
                                            session.database,
                                            t(executionStatus(session.status)),
                                            queryResultSets[0]?.rowCount != null ? runsT('Counts.Rows', { count: queryResultSets[0].rowCount }) : null,
                                        ]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </span>
                                </span>
                                <ChevronRight className="size-4 shrink-0" />
                            </Button>
                            {run ? (
                                <div className="px-3 pb-3">
                                    <RunSource organization={organization} run={run} />
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </div>
            {runs
                .filter(run => !queryRunIds.has(run.id))
                .map(run => (
                    <div key={run.id} className="rounded-lg border p-3">
                        <RunSource organization={organization} run={run} />
                    </div>
                ))}
        </>
    );
}

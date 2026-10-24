'use client';

import { Button } from '@/registry/new-york-v4/ui/button';
import { ChartNoAxesCombined, ChevronRight, FileText, Loader2, Table2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ArtifactSummary } from '@/lib/artifacts/types';

export function AgentArtifacts({
    onSelect,
    artifacts,
    loading,
    failed,
    onRetry,
}: {
    onSelect: (id: string) => void;
    artifacts: ArtifactSummary[];
    loading: boolean;
    failed: boolean;
    onRetry: () => void;
}) {
    const t = useTranslations('WorkDocuments.Resources');
    const artifactsT = useTranslations('Artifacts');
    const runsT = useTranslations('AgentRuns');
    return (
        <section aria-label="Artifacts" className="space-y-2 border-t pt-4">
            <h3 className="text-xs font-medium text-muted-foreground">Artifacts</h3>
            {loading ? <Loader2 aria-label={t('Loading')} className="size-4 animate-spin" /> : null}
            {failed ? (
                <div role="alert" className="text-sm text-destructive">
                    {t('LoadFailed')}
                    <Button size="sm" variant="ghost" onClick={onRetry}>
                        {t('Retry')}
                    </Button>
                </div>
            ) : null}
            {!loading && !failed && !artifacts.length ? <p className="text-sm text-muted-foreground">{t('NoArtifacts')}</p> : null}
            {artifacts.map(artifact => {
                const Icon = artifact.type === 'chart' ? ChartNoAxesCombined : artifact.type === 'file' ? FileText : Table2;
                return (
                    <button
                        key={artifact.id}
                        type="button"
                        onClick={() => onSelect(artifact.id)}
                        className="flex w-full cursor-pointer text-left min-w-0 items-start gap-2 rounded-lg border p-3 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <Icon className="mt-0.5 size-4 shrink-0" />
                        <span className="min-w-0 flex-1">
                            <span className="block truncate" title={artifact.title}>
                                {artifact.title}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                                {[
                                    artifactsT(`Types.${artifact.type}`),
                                    artifact.connectionName,
                                    artifact.status === 'unavailable'
                                        ? artifactsT('Statuses.unavailable')
                                        : artifact.rowCount != null
                                          ? runsT('Counts.Rows', { count: artifact.rowCount })
                                          : null,
                                ]
                                    .filter(Boolean)
                                    .join(' · ')}
                            </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0" />
                    </button>
                );
            })}
        </section>
    );
}

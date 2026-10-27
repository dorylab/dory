'use client';

import { Badge } from '@/registry/new-york-v4/ui/badge';
import { Button } from '@/registry/new-york-v4/ui/button';
import { ChartNoAxesCombined, ChevronRight, FileText, Table2 } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';

import type { ResourceOutput } from '@/hooks/use-agent-resources';

export function AgentOutputs({
    outputs,
    activeDocumentId,
    onSelectReport,
    onSelectArtifact,
}: {
    outputs: ResourceOutput[];
    activeDocumentId: string | null;
    onSelectReport: (id: string) => void;
    onSelectArtifact: (id: string) => void;
}) {
    const t = useTranslations('WorkDocuments.Resources');
    const artifactsT = useTranslations('Artifacts');
    const runsT = useTranslations('AgentRuns');
    const format = useFormatter();
    const now = useNow({ updateInterval: 60_000 });
    return outputs.map(output => {
        const report = output.kind === 'report' ? output.report : null;
        const artifact = output.kind === 'artifact' ? output.artifact : null;
        const item = output.kind === 'report' ? output.report : output.artifact;
        const Icon = artifact?.type === 'chart' ? ChartNoAxesCombined : artifact?.type === 'result_set' ? Table2 : FileText;
        const metadata = report
            ? [t('Report'), t('Updated', { time: format.relativeTime(new Date(report.updatedAt), now) }), report.status === 'draft' ? t('Draft') : null]
            : artifact
              ? [
                    artifactsT(`Viewer.Types.${artifact.type}`),
                    artifact.type === 'file' ? artifact.fileFormat?.toUpperCase() : null,
                    artifact.status === 'unavailable' ? artifactsT('Statuses.unavailable') : artifact.rowCount != null ? runsT('Counts.Rows', { count: artifact.rowCount }) : null,
                ]
              : [];
        return (
            <Button
                key={`${output.kind}:${item.id}`}
                variant="ghost"
                aria-pressed={report ? report.id === activeDocumentId : undefined}
                className="h-auto w-full min-w-0 justify-start gap-2 whitespace-normal rounded-lg border p-3 text-left"
                onClick={() => (report ? onSelectReport(report.id) : onSelectArtifact(item.id))}
                data-testid="resource-output"
            >
                <Icon className="size-4 shrink-0 self-start mt-0.5" />
                <span className="min-w-0 flex-1">
                    <span className="block truncate" title={item.title}>
                        {item.title}
                    </span>
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">{metadata.filter(Boolean).join(' · ')}</span>
                </span>
                {report ? (
                    <Badge variant="secondary" className="self-start">
                        v{report.version ?? report.revision}
                    </Badge>
                ) : (
                    <ChevronRight className="size-4 shrink-0" />
                )}
            </Button>
        );
    });
}

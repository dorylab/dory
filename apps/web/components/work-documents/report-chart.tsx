'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/registry/new-york-v4/ui/button';
import type { WorkEvidence, WorkVisual } from '@dory/shared/types/work-document';
import { useQuery } from '@tanstack/react-query';

import { executeActionClient } from '@/lib/actions/client';
import { reportNumber } from '@/lib/work-documents/format';
import { ChartResultCard } from '@/components/@dory/ui/ai/charts-result';
import { SqlResultChartPane } from '@/components/sql-workspace/sql-result-view';
import { useWorkspaceChartSource } from '@/components/sql-workspace/workspace-result';
import { useOrganizationId } from '@/app/(app)/[organization]/components/organization-context';

export default function ReportChart({ visual, evidence }: { visual: WorkVisual; evidence: WorkEvidence }) {
    const [hidden, setHidden] = useState<string[]>([]);
    if (visual.chartSpec) return <WorkspaceReportChart visual={visual} evidence={evidence} />;
    const chart = visual.chart!;
    const series = chart.yKeys ?? [{ key: chart.yKey!, label: chart.yKey! }];
    const data = evidence.rows.map(row => ({ ...row, ...Object.fromEntries(series.map(item => [item.key, reportNumber(row[item.key])])) }));
    return (
        <div className="space-y-3">
            {series.length > 1 && (
                <div className="flex flex-wrap gap-2" aria-label={visual.title}>
                    {series.map(item => (
                        <Button
                            key={item.key}
                            size="sm"
                            variant={hidden.includes(item.key) ? 'ghost' : 'outline'}
                            aria-pressed={!hidden.includes(item.key)}
                            onClick={() => setHidden(previous => (previous.includes(item.key) ? previous.filter(key => key !== item.key) : [...previous, item.key]))}
                        >
                            {item.label ?? item.key}
                        </Button>
                    ))}
                </div>
            )}
            {series
                .filter(item => !hidden.includes(item.key))
                .map(item => (
                    <ChartResultCard
                        key={item.key}
                        variant="bare"
                        result={{
                            type: 'chart',
                            chartType: chart.type,
                            title: series.length > 1 ? (item.label ?? item.key) : visual.title,
                            data,
                            xKey: chart.xKey,
                            categoryKey: chart.xKey,
                            valueKey: item.key,
                            yKeys: [item],
                        }}
                    />
                ))}
        </div>
    );
}

function WorkspaceReportChart({ visual, evidence }: { visual: WorkVisual; evidence: WorkEvidence }) {
    const organizationId = useOrganizationId();
    const artifact = useQuery({
        queryKey: ['report-chart-source', organizationId, evidence.artifactId],
        enabled: !visual.chartData,
        queryFn: ({ signal }) => executeActionClient<{ sourceResultSetId: string | null }>('artifact.get', { artifactId: evidence.artifactId }, { organizationId, signal }),
        retry: false,
    });
    const liveSource = useWorkspaceChartSource(artifact.data?.sourceResultSetId ?? undefined, visual.chartSpec);
    const source = useMemo(
        () => (visual.chartData ? { cacheKey: JSON.stringify([visual.chartSpec, visual.chartData]), readChart: async () => visual.chartData! } : liveSource),
        [visual.chartData, visual.chartSpec, liveSource],
    );
    const rows = useMemo(() => evidence.rows.map(rowData => ({ rowData })), [evidence.rows]);
    if (artifact.error) return <p role="alert">{artifact.error.message}</p>;
    if (!source) return <div role="status" className="h-64 animate-pulse rounded bg-muted" />;
    return (
        <div className="flex h-96 flex-col">
            <SqlResultChartPane
                visible
                rows={rows}
                columnsRaw={evidence.columnTypes ?? evidence.columns.map(name => ({ name }))}
                initialState={visual.chartSpec}
                remoteSource={source}
                presentationOnly
                stateSyncEnabled={false}
            />
        </div>
    );
}

'use client';

import { useState } from 'react';
import { Button } from '@/registry/new-york-v4/ui/button';
import type { WorkEvidence, WorkVisual } from '@dory/shared/types/work-document';

import { reportNumber } from '@/lib/work-documents/format';
import { ChartResultCard } from '@/components/@dory/ui/ai/charts-result';

export default function ReportChart({ visual, evidence }: { visual: WorkVisual; evidence: WorkEvidence }) {
    const [hidden, setHidden] = useState<string[]>([]);
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
